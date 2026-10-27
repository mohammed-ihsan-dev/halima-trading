"""Read-only catalogue page previews for the pilot review (PyMuPDF).

Usage: python3 render_pages.py <requests.json> <out_dir>
requests.json: [{"id": "...", "pdf": "catalogues-source/x.pdf", "page": 5, "texts": ["ME-25T2", "ME25T2"]}]

For each request: renders the page at 110 dpi to <out_dir>/<id>.jpg with every occurrence of the model text
outlined in green, and reports where the text was found plus the page's embedded raster images (count, sizes).
Nothing is cropped for upload; the PDF is opened read-only.
"""
import json
import sys

import fitz  # PyMuPDF


def main():
    reqs = json.load(open(sys.argv[1], encoding="utf-8"))
    out_dir = sys.argv[2]
    results = []
    docs = {}
    for r in reqs:
        res = {"id": r["id"], "pdf": r["pdf"], "page": r["page"], "ok": False}
        try:
            doc = docs.get(r["pdf"]) or fitz.open(r["pdf"])
            docs[r["pdf"]] = doc
            if r["page"] < 1 or r["page"] > doc.page_count:
                res["error"] = f"page {r['page']} out of range (1-{doc.page_count})"
                results.append(res)
                continue
            page = doc[r["page"] - 1]
            hits = []
            for t in r["texts"]:
                for rect in page.search_for(t):
                    hits.append({"text": t, "box": [round(v, 1) for v in rect]})
            seen, uniq = set(), []
            for h in hits:
                k = tuple(h["box"])
                if k not in seen:
                    seen.add(k)
                    uniq.append(h)
            imgs = []
            for info in page.get_images(full=True):
                imgs.append({"xref": info[0], "width": info[2], "height": info[3]})
            pix = page.get_pixmap(dpi=110)
            path = f"{out_dir}/{r['id']}.png"
            pix.save(path)
            res.update(ok=True, preview=path, textHits=uniq, embeddedImages=imgs, pageWidth=page.rect.width, pageHeight=page.rect.height, dpi=110)
        except Exception as e:  # unreadable page / PDF
            res["error"] = f"{type(e).__name__}: {e}"
        results.append(res)
    json.dump(results, sys.stdout)


if __name__ == "__main__":
    main()
