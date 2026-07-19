#!/usr/bin/env python3
"""Pre-generate aspect-correct renditions (view ~1200px, thumb ~240px) for every shared-gallery
photo, upload them next to the originals, and stamp view/thumb URLs onto the gallery items.
The Supabase render/image endpoint DISTORTS on this project (width-only squishes) — never use it.
   nbenv/bin/python scripts/generate_gallery_renditions.py [--apply]
"""
import io, json, re, sys, os
import requests
from PIL import Image, ImageOps

APPLY = "--apply" in sys.argv
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(root, ".env.local")):
    m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"\'')
URL, KEY = env["REACT_APP_SUPABASE_URL"], env["REACT_APP_SUPABASE_ANON_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

def rendition(img_bytes, max_dim, quality):
    im = Image.open(io.BytesIO(img_bytes))
    im = ImageOps.exif_transpose(im)              # bake orientation
    im.thumbnail((max_dim, max_dim), Image.LANCZOS)  # preserves aspect
    if im.mode != "RGB": im = im.convert("RGB")
    out = io.BytesIO(); im.save(out, "JPEG", quality=quality, optimize=True)
    return out.getvalue(), im.size

def storage_path(url):
    m = re.search(r"/object/public/([^/]+)/(.+)$", url)
    return (m.group(1), m.group(2)) if m else (None, None)

def upload(bucket, path, data):
    r = requests.post(f"{URL}/storage/v1/object/{bucket}/{path}", headers={**H, "Content-Type": "image/jpeg", "x-upsert": "true"}, data=data)
    if r.status_code not in (200, 201): raise RuntimeError(f"upload {path}: {r.status_code} {r.text[:120]}")
    return f"{URL}/storage/v1/object/public/{bucket}/{path}"

gals = requests.get(f"{URL}/rest/v1/shared_galleries?select=id,title,items", headers=H).json()
total = done = skipped = failed = 0
for g in gals:
    items = g.get("items") or []
    changed = False
    for it in items:
        total += 1
        if it.get("view") and it.get("thumb"): skipped += 1; continue
        u = it.get("url") or ""
        bucket, path = storage_path(u)
        if not bucket: skipped += 1; continue
        try:
            raw = requests.get(u, timeout=60); raw.raise_for_status()
            base = re.sub(r"\.[a-zA-Z0-9]+$", "", path)
            view, vs = rendition(raw.content, 1200, 78)
            thumb, ts = rendition(raw.content, 240, 68)
            if APPLY:
                it["view"] = upload(bucket, f"{base}__view.jpg", view)
                it["thumb"] = upload(bucket, f"{base}__thumb.jpg", thumb)
            changed = True; done += 1
            print(f"  ok {vs[0]}x{vs[1]} ({len(view)//1024}KB view, {len(thumb)//1024}KB thumb)  {path[-48:]}")
        except Exception as e:
            failed += 1; print(f"  FAIL {path[-40:] if path else u[:40]}: {e}")
    if APPLY and changed:
        r = requests.patch(f"{URL}/rest/v1/shared_galleries?id=eq.{g['id']}", headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"}, data=json.dumps({"items": items}))
        print(f"gallery '{g.get('title')}' updated: {r.status_code}")
print(f"\n{'APPLIED' if APPLY else 'DRY RUN'} — {done} generated, {skipped} skipped, {failed} failed of {total} items")
