"""Read-only PDF audit (PyMuPDF). Usage: python3 -I pdf_audit.py <out.json> <pdf> [<pdf> ...]

For each PDF: page count, metadata, encryption, per-page text length and embedded-image count, and the
model-like tokens on each page (letters+digits, normalised to A-Z0-9). Nothing is extracted to disk.
"""
import json
import re
import sys

import fitz  # PyMuPDF

TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-/.()'+]{3,40}")
SPEC_WORDS = re.compile(r"\b(model|capacity|btu|watt|kw|rpm|dimensions?|voltage|refrigerant|net weight|litre|liters?)\b", re.I)


def norm(s):
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def tokens(text):
    out = set()
    for raw in TOKEN.findall(text):
        for part in re.split(r"[/]", raw):
            n = norm(part)
            if 5 <= len(n) <= 30 and re.search(r"[A-Z]", n) and re.search(r"\d", n):
                out.add(n)
        n = norm(raw)
        if 5 <= len(n) <= 40 and re.search(r"[A-Z]", n) and re.search(r"\d", n):
            out.add(n)
    return sorted(out)


def audit(path):
    rec = {"path": path, "ok": False}
    try:
        doc = fitz.open(path)
    except Exception as e:  # corrupt / unreadable
        rec["error"] = f"{type(e).__name__}: {e}"
        return rec
    rec["encrypted"] = bool(doc.needs_pass)
    if doc.needs_pass:
        rec["error"] = "password protected"
        return rec
    rec["pageCount"] = doc.page_count
    rec["metadata"] = {k: v for k, v in (doc.metadata or {}).items() if v}
    pages = []
    for i, page in enumerate(doc):
        try:
            text = page.get_text("text") or ""
        except Exception:
            text = ""
        try:
            imgs = len(page.get_images(full=True))
        except Exception:
            imgs = -1
        pages.append({
            "page": i + 1,
            "textChars": len(text.strip()),
            "images": imgs,
            "specWords": len(SPEC_WORDS.findall(text)),
            "tokens": tokens(text),
            "head": re.sub(r"\s+", " ", text.strip())[:160],
        })
    rec["pages"] = pages
    rec["ok"] = True
    doc.close()
    return rec


def main():
    out, paths = sys.argv[1], sys.argv[2:]
    results = []
    for p in paths:
        r = audit(p)
        results.append(r)
        print(f"{'OK ' if r['ok'] else 'ERR'} {r.get('pageCount', '-'):>4}  {p}", file=sys.stderr)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
