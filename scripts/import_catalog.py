#!/usr/bin/env python3
"""
Catalog PDF Import Script for Hoosier Boy Greenhouse Ops
=========================================================
Extracts variety data from breeder culture guide PDFs (Ball FloraPlant,
Dümmen Orange, Syngenta, PanAm, etc.) using pdfplumber for text extraction
and Claude for intelligent interpretation.

Usage:
    python scripts/import_catalog.py <pdf_path> [--breeder "Ball FloraPlant"] [--start 6] [--end 170] [--output varieties.json]

Output: JSON file ready for import into the app's review table.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

try:
    import pdfplumber
except ImportError:
    print("Error: pdfplumber not installed. Run: pip install pdfplumber")
    sys.exit(1)


# ── CONFIG ────────────────────────────────────────────────────────────────────
BATCH_SIZE = 10  # pages per Claude call (text is small, can do more than images)
MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 8000
MAX_RETRIES = 3
RETRY_DELAY = 10  # seconds


# ── PROMPT ────────────────────────────────────────────────────────────────────
def build_prompt(breeder_name, page_texts):
    return f"""You are extracting production-relevant variety data from a {breeder_name} breeder catalog.

Rules:
- Extract ONLY production/growing data. Ignore marketing copy, combo recipes, program descriptions, and decorative content.
- One entry per series (e.g. "Cabaret Calibrachoa" = one entry). Do NOT create separate entries for individual colors within a series.
- cropName = the genus or crop type (e.g. "Calibrachoa", "Petunia", "Angelonia")
- variety = the series name only (e.g. "Cabaret", "Wave", "AngelMist Spreading")
- breeder = "{breeder_name}"
- All temperatures in °F. Ranges are fine (e.g. "68-72").
- tempGroup: "cool" for petunias, calibrachoa, pansies, snapdragons, osteospermum, diascia, nemesia; "warm" for angelonia, begonias, vinca, impatiens, celosia, coleus, lantana, pentas, scaevola. Use your horticultural knowledge.
- lightRequirement: use "Full Sun", "Partial Sun/Shade", "Full Shade", or "Sun to Partial Shade" based on the catalog info.
- Extract height and spread into generalNotes if available.
- Do NOT extract or fabricate growerGrade or customerGrade — these are user-assigned ratings only.
- Use null for any field not mentioned or clearly inferrable from the page.
- If a page contains no variety/cultural data (e.g. table of contents, cover page, index, ads, combo recipes), skip it — return nothing for that page.
- Do NOT create entries for combo/mix recipes (MixMasters, FunFusions, etc.) — only individual variety series.

Return ONLY a valid JSON array (no markdown, no backticks, no explanation):
[
  {{
    "cropName": "",
    "variety": "",
    "breeder": "{breeder_name}",
    "type": "Annual",
    "propTraySize": null,
    "propCellCount": null,
    "propWeeks": null,
    "finishWeeks": null,
    "finishTempDay": null,
    "finishTempNight": null,
    "tempGroup": "",
    "lightRequirement": null,
    "spacing": null,
    "fertilizerType": null,
    "fertilizerRate": null,
    "pgrType": null,
    "pgrRate": null,
    "pgrTiming": null,
    "pinchingNotes": null,
    "chemSensitivities": null,
    "generalNotes": "",
    "sourcePageNumber": 0
  }}
]

If no varieties are found on these pages, return an empty array: []

Here is the catalog text:

{page_texts}"""


# ── API CALL ──────────────────────────────────────────────────────────────────
def call_claude(prompt, api_key):
    """Call Claude API and return parsed JSON array."""
    body = json.dumps({
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }
    )

    for attempt in range(MAX_RETRIES):
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            data = json.loads(resp.read().decode("utf-8"))
            text = data["content"][0]["text"]

            # Parse JSON
            clean = text.replace("```json", "").replace("```", "").strip()
            return json.loads(clean)

        except urllib.error.HTTPError as e:
            if e.code == 429:
                delay = RETRY_DELAY * (2 ** attempt)
                print(f"    Rate limited — waiting {delay}s (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(delay)
                continue
            raise
        except json.JSONDecodeError as e:
            print(f"    JSON parse error: {e}")
            print(f"    Raw response: {text[:200]}")
            return []

    print("    Max retries exceeded")
    return []


# ── DEDUP ─────────────────────────────────────────────────────────────────────
def dedup_varieties(varieties):
    """Remove duplicate varieties (same cropName + variety + breeder)."""
    seen = set()
    unique = []
    dupes = 0
    for v in varieties:
        key = (
            (v.get("cropName") or "").lower().strip(),
            (v.get("variety") or "").lower().strip(),
            (v.get("breeder") or "").lower().strip(),
        )
        if key in seen:
            dupes += 1
            continue
        seen.add(key)
        unique.append(v)
    return unique, dupes


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Extract variety data from breeder catalog PDFs")
    parser.add_argument("pdf_path", help="Path to the PDF catalog")
    parser.add_argument("--breeder", default="", help="Breeder name (e.g. 'Ball FloraPlant')")
    parser.add_argument("--start", type=int, default=1, help="Start page (default: 1)")
    parser.add_argument("--end", type=int, default=0, help="End page (default: last page)")
    parser.add_argument("--output", default="", help="Output JSON file path")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Pages per API call (default: {BATCH_SIZE})")
    parser.add_argument("--api-key", default="", help="Anthropic API key (or set ANTHROPIC_API_KEY env var)")
    args = parser.parse_args()

    # Get API key
    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("REACT_APP_ANTHROPIC_API_KEY", "")
    if not api_key:
        print("Error: No API key. Set ANTHROPIC_API_KEY env var or pass --api-key")
        sys.exit(1)

    # Open PDF
    if not os.path.exists(args.pdf_path):
        print(f"Error: File not found: {args.pdf_path}")
        sys.exit(1)

    pdf = pdfplumber.open(args.pdf_path)
    total_pages = len(pdf.pages)
    start_page = max(1, args.start)
    end_page = min(total_pages, args.end if args.end > 0 else total_pages)
    batch_size = args.batch_size

    # Default output path
    if not args.output:
        base = os.path.splitext(os.path.basename(args.pdf_path))[0]
        args.output = os.path.join(os.path.dirname(args.pdf_path) or ".", f"{base}_varieties.json")

    # Auto-detect breeder from filename if not specified
    breeder = args.breeder
    if not breeder:
        fname = os.path.basename(args.pdf_path).lower()
        if "bfp" in fname or "ball" in fname or "floraplant" in fname:
            breeder = "Ball FloraPlant"
        elif "dummen" in fname or "dümmen" in fname:
            breeder = "Dümmen Orange"
        elif "syngenta" in fname:
            breeder = "Syngenta"
        elif "panam" in fname or "panamerican" in fname:
            breeder = "PanAmerican Seed"
        elif "proven" in fname:
            breeder = "Proven Winners"
        else:
            breeder = "Unknown"
            print("Warning: Could not detect breeder from filename. Use --breeder flag.")

    print(f"")
    print(f"  Catalog PDF Import")
    print(f"  {'=' * 40}")
    print(f"  File:    {os.path.basename(args.pdf_path)}")
    print(f"  Breeder: {breeder}")
    print(f"  Pages:   {start_page} to {end_page} of {total_pages}")
    print(f"  Batch:   {batch_size} pages per API call")
    print(f"  Output:  {args.output}")
    print(f"")

    all_varieties = []
    pages_processed = 0
    batches_total = (end_page - start_page + 1 + batch_size - 1) // batch_size

    start_time = time.time()

    for batch_start in range(start_page - 1, end_page, batch_size):
        batch_end = min(batch_start + batch_size, end_page)
        batch_num = (batch_start - start_page + 1) // batch_size + 1

        # Extract text from batch pages
        page_texts = []
        for i in range(batch_start, batch_end):
            page = pdf.pages[i]
            text = page.extract_text() or ""
            if len(text.strip()) > 30:  # Skip near-empty pages
                page_texts.append(f"[Page {i + 1}]\n{text}")

        if not page_texts:
            print(f"  [{batch_num}/{batches_total}] Pages {batch_start + 1}-{batch_end}: skipped (no text)")
            pages_processed += (batch_end - batch_start)
            continue

        combined = "\n\n".join(page_texts)
        print(f"  [{batch_num}/{batches_total}] Pages {batch_start + 1}-{batch_end}: {len(combined)} chars... ", end="", flush=True)

        # Call Claude
        prompt = build_prompt(breeder, combined)
        varieties = call_claude(prompt, api_key)

        if varieties:
            # Add source page numbers if not set
            for v in varieties:
                if not v.get("sourcePageNumber"):
                    v["sourcePageNumber"] = batch_start + 1
            all_varieties.extend(varieties)
            print(f"{len(varieties)} varieties found")
        else:
            print(f"no varieties (non-variety pages)")

        pages_processed += (batch_end - batch_start)

    pdf.close()

    elapsed = time.time() - start_time

    # Dedup
    unique_varieties, dupes_removed = dedup_varieties(all_varieties)

    # Save
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(unique_varieties, f, indent=2, ensure_ascii=False)

    print(f"")
    print(f"  Results")
    print(f"  {'=' * 40}")
    print(f"  Pages processed: {pages_processed}")
    print(f"  Varieties found: {len(all_varieties)}")
    print(f"  Duplicates removed: {dupes_removed}")
    print(f"  Unique varieties: {len(unique_varieties)}")
    print(f"  Time: {elapsed:.1f}s ({elapsed/pages_processed:.1f}s/page)")
    print(f"  Saved to: {args.output}")
    print(f"")

    # Show summary by crop
    crops = {}
    for v in unique_varieties:
        crop = v.get("cropName", "Unknown")
        crops[crop] = crops.get(crop, 0) + 1

    if crops:
        print(f"  By Crop:")
        for crop in sorted(crops.keys()):
            print(f"    {crop}: {crops[crop]} series")
        print()


if __name__ == "__main__":
    main()
