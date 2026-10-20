#!/usr/bin/env python3
"""
Catalogue PDF extraction for the product-image pipeline (PyMuPDF + macOS Vision OCR). Read-only on the PDF.

  python3 scripts/product-images/catalogue_extract.py index <pdf> <out_dir> [--force]
      Every page: native text lines (with boxes), OCR lines for text drawn as outlines (with boxes and confidence),
      embedded image placements (box, visible-content box from the image's transparency mask), a page preview, and the
      original embedded assets of photo-sized images. Writes <out_dir>/index.json. Skips work if the PDF is unchanged.

  python3 scripts/product-images/catalogue_extract.py crop <pdf> <requests.json> <out_dir>
      Renders each requested page region (PDF points): [{id, page, box, dpi}] -> <out_dir>/crops/<id>.png. The caller passes
      the photo's native density as dpi, so embedded pixels are not upsampled (capped at 300 dpi).

Coordinates are PDF points, origin top-left (PyMuPDF convention). No model matching happens here: that is done, with
tests, in catalogue-match.mjs.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

import fitz  # PyMuPDF

OCR_DPI = 220
PREVIEW_DPI = 90
CROP_DPI = 300
HERE = os.path.dirname(os.path.abspath(__file__))


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ocr_binary(out_dir):
    """Compiles the Vision OCR helper once (macOS). Returns its path, or None when unavailable."""
    src = os.path.join(HERE, "ocr", "vision_ocr.swift")
    bin_dir = os.path.join(os.path.dirname(os.path.abspath(out_dir.rstrip("/"))), "bin")
    os.makedirs(bin_dir, exist_ok=True)
    exe = os.path.join(bin_dir, "vision_ocr")
    if os.path.exists(exe) and os.path.getmtime(exe) >= os.path.getmtime(src):
        return exe
    try:
        subprocess.run(["xcrun", "swiftc", "-O", src, "-o", exe], check=True, capture_output=True, timeout=600)
        return exe
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"OCR unavailable ({e}); pages without native text will have no OCR lines\n")
        return None


def run_ocr(exe, page):
    pix = page.get_pixmap(dpi=OCR_DPI)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t:
        tmp = t.name
    try:
        pix.save(tmp)
        out = subprocess.run([exe, tmp], check=True, capture_output=True, text=True, timeout=300).stdout
    finally:
        os.unlink(tmp)
    W, H = page.rect.width, page.rect.height
    lines = []
    for row in out.splitlines():
        parts = row.split("\t", 5)
        if len(parts) < 6 or not parts[5].strip():
            continue
        conf, x, y, w, h = (float(v) for v in parts[:5])
        # Vision: normalised, origin bottom-left -> PDF points, origin top-left
        lines.append({"text": parts[5], "box": [round(x * W, 2), round((1 - y - h) * H, 2), round((x + w) * W, 2), round((1 - y) * H, 2)],
                      "conf": round(conf, 3), "source": "ocr"})
    return lines


def native_lines(page):
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if text:
                lines.append({"text": text, "box": [round(v, 2) for v in line["bbox"]], "conf": 1.0, "source": "native",
                              "size": round(max(span["size"] for span in line["spans"]), 2)})
    return lines


def alpha_content_box(doc, info, smask):
    """Visible part of an image (non-transparent pixels of its soft mask) mapped to page coordinates."""
    x0, y0, x1, y1 = info["bbox"]
    if not smask:
        return [x0, y0, x1, y1], 1.0
    try:
        m = fitz.Pixmap(doc, smask)
        if m.n != 1:
            m = fitz.Pixmap(fitz.csGRAY, m)
        w, h, s = m.width, m.height, m.samples
        rows = [any(s[r * w + c] > 24 for c in range(0, w, 2)) for r in range(h)]
        cols = [any(s[r * w + c] > 24 for r in range(0, h, 2)) for c in range(w)]
        if not any(rows) or not any(cols):
            return None, 0.0
        r0, r1 = rows.index(True), h - 1 - rows[::-1].index(True)
        c0, c1 = cols.index(True), w - 1 - cols[::-1].index(True)
        visible = sum(1 for r in range(0, h, 4) for c in range(0, w, 4) if s[r * w + c] > 24) / max(1, ((h + 3) // 4) * ((w + 3) // 4))
        sx, sy = (x1 - x0) / w, (y1 - y0) / h  # axis-aligned placements only (checked by the caller)
        return [round(x0 + c0 * sx, 2), round(y0 + r0 * sy, 2), round(x0 + (c1 + 1) * sx, 2), round(y0 + (r1 + 1) * sy, 2)], round(visible, 3)
    except Exception:  # noqa: BLE001
        return [x0, y0, x1, y1], 1.0


def clip(box, rect):
    return [max(box[0], rect.x0), max(box[1], rect.y0), min(box[2], rect.x1), min(box[3], rect.y1)]


def area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def index(pdf, out_dir, force=False):
    os.makedirs(os.path.join(out_dir, "pages"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "assets"), exist_ok=True)
    idx_path = os.path.join(out_dir, "index.json")
    pdf_sha = sha256_file(pdf)
    if not force and os.path.exists(idx_path):
        with open(idx_path) as f:
            old = json.load(f)
        if old.get("pdfSha256") == pdf_sha and old.get("version") == 1 and bool(old.get("ocr")) == (os.environ.get("CATALOGUE_OCR") != "0"):
            print(json.dumps({"index": idx_path, "pages": len(old["pages"]), "cached": True}))
            return
    exe = None if os.environ.get("CATALOGUE_OCR") == "0" else ocr_binary(out_dir)  # CATALOGUE_OCR=0: native text only (tests)
    doc = fitz.open(pdf)
    pages = []
    for pno, page in enumerate(doc):
        rect = page.rect
        native = native_lines(page)
        ocr = run_ocr(exe, page) if exe else []
        preview = f"pages/p{pno + 1:03d}.jpg"
        page.get_pixmap(dpi=PREVIEW_DPI).save(os.path.join(out_dir, preview), jpg_quality=80)
        images = []
        smasks = {img[0]: img[1] for img in page.get_images(full=True)}
        for info in page.get_image_info(xrefs=True):
            xref = info.get("xref") or 0
            if not xref:
                continue
            box = [round(v, 2) for v in info["bbox"]]
            vis = clip(box, rect)
            page_frac = area(vis) / area([rect.x0, rect.y0, rect.x1, rect.y1])
            on_page = area(vis) / max(1e-6, area(box))
            tr = info.get("transform", (1, 0, 0, 1, 0, 0))
            axis_aligned = abs(tr[1]) < 1e-6 and abs(tr[2]) < 1e-6 and tr[0] > 0 and tr[3] > 0
            photo_sized = 0.01 <= page_frac <= 0.6 and on_page >= 0.6
            content, visible = alpha_content_box(doc, info, smasks.get(xref)) if axis_aligned and photo_sized else (box, 1.0)
            entry = {"xref": xref, "box": box, "pageFraction": round(page_frac, 4), "onPage": round(on_page, 3), "width": info["width"], "height": info["height"],
                     "smask": bool(smasks.get(xref)), "axisAligned": axis_aligned, "contentBox": [round(v, 2) for v in clip(content, rect)] if content else None, "visibleFraction": visible}
            # Keep the original asset of photo-sized images (with transparency) for provenance and troubleshooting.
            if photo_sized and content:
                try:
                    pix = fitz.Pixmap(doc, xref)
                    if smasks.get(xref):
                        pix = fitz.Pixmap(pix, fitz.Pixmap(doc, smasks[xref]))
                    if pix.n - pix.alpha >= 4:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    data = pix.tobytes("png")
                    h = hashlib.sha256(data).hexdigest()
                    p = os.path.join(out_dir, "assets", f"{h[:24]}.png")
                    if not os.path.exists(p):
                        with open(p, "wb") as f:
                            f.write(data)
                    entry["asset"] = f"assets/{h[:24]}.png"
                    entry["assetSha256"] = h
                except Exception as e:  # noqa: BLE001
                    entry["assetError"] = str(e)[:120]
            images.append(entry)
        pages.append({"page": pno + 1, "width": round(rect.width, 2), "height": round(rect.height, 2), "preview": preview, "previewDpi": PREVIEW_DPI,
                      "nativeChars": sum(len(l["text"]) for l in native), "lines": native + ocr, "images": images})
        sys.stderr.write(f"\rpage {pno + 1}/{doc.page_count}")
    sys.stderr.write("\n")
    out = {"version": 1, "pdf": os.path.basename(pdf), "pdfSha256": pdf_sha, "pageCount": doc.page_count, "ocr": "macOS Vision (accurate, no language correction)" if exe else None,
           "ocrDpi": OCR_DPI, "pages": pages}
    with open(idx_path + ".tmp", "w") as f:
        json.dump(out, f)
    os.replace(idx_path + ".tmp", idx_path)
    print(json.dumps({"index": idx_path, "pages": len(pages), "cached": False, "ocr": bool(exe)}))


def crop(pdf, requests_path, out_dir):
    os.makedirs(os.path.join(out_dir, "crops"), exist_ok=True)
    with open(requests_path) as f:
        reqs = json.load(f)
    doc = fitz.open(pdf)
    done = []
    for r in reqs:
        page = doc[r["page"] - 1]
        box = fitz.Rect(*r["box"]) & page.rect
        path = os.path.join(out_dir, "crops", f"{r['id']}.png")
        if not os.path.exists(path):
            page.get_pixmap(dpi=min(CROP_DPI, int(r.get("dpi") or CROP_DPI)), clip=box).save(path)  # never above the photo's native density
        done.append({"id": r["id"], "file": f"crops/{r['id']}.png", "box": [round(v, 2) for v in box]})
    print(json.dumps({"crops": len(done)}))


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "index":
        index(sys.argv[2], sys.argv[3], force="--force" in sys.argv)
    elif len(sys.argv) >= 5 and sys.argv[1] == "crop":
        crop(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        sys.stderr.write(__doc__)
        sys.exit(2)
