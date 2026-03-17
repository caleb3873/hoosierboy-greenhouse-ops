# Catalog PDF Import — Design Spec

**Date:** 2026-03-17
**Feature:** Import breeder PDF catalogs into the Variety Library using Claude Vision
**Location:** New file `PdfCatalogImport.jsx`, integrated from Variety Library section in Libraries.jsx

## Problem

Breeder catalogs (Dümmen Orange, Syngenta, PanAm, Ball) are distributed as dense PDF documents containing variety identity, cultural data, propagation specs, finish conditions, PGR programs, and pinching notes. Currently, variety data must be entered manually into the Variety Library. This feature automates extraction from PDF catalogs using Claude Vision.

## Current State

There is an existing `PDFUploader` component at Libraries.jsx:505 and a `buildParsePrompt` function at Libraries.jsx:56. The current implementation:
- Reads the PDF as a single base64 document
- Calls the Anthropic API **directly from the browser** using `REACT_APP_ANTHROPIC_API_KEY` with the `anthropic-dangerous-direct-browser-access` header
- Sends the entire PDF in one request (fails on large catalogs that exceed token limits)
- Has no progress tracking, no page-by-page processing, no merge logic
- Extracts to `variety_library` fields but without conflict detection

**This feature replaces the existing `PDFUploader` and `buildParsePrompt`.** The `REACT_APP_ANTHROPIC_API_KEY` direct browser access pattern will be removed in favor of a secure server-side proxy. The existing `buildParsePrompt` field schema is preserved and extended to include `chemSensitivities` and `tempGroup`.

## User Flow

1. **Upload** — User clicks "Import from Catalog PDF" in the Variety Library section (replaces the existing PDFUploader UI). Selects breeder from dropdown, drops a PDF file. Browser renders pages to images via pdf.js.

2. **Extract** — Pages are sent in batches of 5 to `/api/extract-catalog` (Vercel serverless function). Claude Vision extracts variety identity and cultural data using structured prompts. Progress bar shows page-by-page status. Each page receives a confidence score (high/medium/low). Results accumulate progressively — users see varieties appear as each batch completes.

3. **Review** — Extracted varieties displayed in an editable review table. Users can inline-edit any cell, delete junk rows, and re-extract individual pages that parsed poorly. Low-confidence rows highlighted in amber.

4. **Merge** — Extracted varieties are matched against existing `variety_library` entries on `cropName` + `variety` (series name) + `breeder`:
   - **NEW** — No match found. Create new entry.
   - **ENRICHED** — Match found, empty fields in library auto-filled from PDF.
   - **CONFLICT** — Match found, conflicting values. Both values shown side-by-side, user picks.
   - **SKIPPED** — Match found, all fields agree or library data is more complete.
   - Grades (`growerGrade`, `customerGrade`) and manual notes are never overwritten.

5. **Commit** — Save to `variety_library` via upsert. Show summary: "14 new varieties, 8 enriched, 3 conflicts resolved, 2 skipped."

## Architecture

### Data Pipeline

```
PDF file → pdf.js (browser) → page images → /api/extract-catalog → Claude Vision → structured JSON → review table → variety_library
```

### Why Page Images Instead of PDF-as-Document

The existing implementation sends the entire PDF as a single base64 document. This fails on large catalogs (50-200 pages) that exceed Claude's context limits. The page-image approach enables:
- **Batching** — Process any size catalog by sending 5 pages at a time
- **Progress tracking** — Show real-time extraction progress
- **Per-page confidence** — Identify which pages parsed poorly
- **Re-extraction** — Retry individual pages without reprocessing the whole catalog
- **Cost control** — Users can cancel mid-extraction and keep partial results

### Vercel Serverless Function Setup

This is the project's first serverless function. CRA deployed on Vercel supports API routes via an `api/` directory at the project root.

**Directory structure:**
```
hoosierboy-greenhouse-ops/
├── api/
│   └── extract-catalog.js    ← Vercel serverless function
├── src/
│   ├── PdfCatalogImport.jsx  ← New component
│   ├── Libraries.jsx         ← Modified (remove PDFUploader, add import button)
│   └── ...
├── vercel.json               ← New (API route config)
└── package.json              ← Add @anthropic-ai/sdk
```

**`vercel.json`:**
```json
{
  "functions": {
    "api/extract-catalog.js": {
      "maxDuration": 60
    }
  }
}
```

**Environment variables (Vercel dashboard):**
- `ANTHROPIC_API_KEY` — server-side only (no `REACT_APP_` prefix, never sent to browser)
- Existing `REACT_APP_ANTHROPIC_API_KEY` can be removed after migration

### API Contract

**Endpoint:** `POST /api/extract-catalog`

**Request:**
```json
{
  "pages": [
    { "pageNumber": 1, "image": "base64..." },
    { "pageNumber": 2, "image": "base64..." }
  ],
  "context": {
    "breederName": "Dümmen Orange",
    "detectedStructure": null
  }
}
```

The `detectedStructure` field is populated by the client after page 1 completes. It carries forward the column/section layout Claude identified on the first page, so subsequent pages can be parsed consistently.

**Processing:**
- First page prompt: identify column/section structure, extract all variety data, return the detected structure alongside items
- Subsequent pages: use `detectedStructure` from context, extract rows consistently
- Smart prompting focuses on production-relevant cultural data, not marketing copy

**Response:**
```json
{
  "items": [
    {
      "cropName": "Calibrachoa",
      "variety": "Cabaret",
      "breeder": "Dümmen Orange",
      "type": "Annual",
      "propTraySize": "288",
      "propCellCount": "288",
      "propWeeks": "4-5",
      "finishWeeks": "8-10",
      "finishTempDay": "68-72",
      "finishTempNight": "58-62",
      "tempGroup": "cool",
      "lightRequirement": "High",
      "spacing": "10-12",
      "fertilizerType": "Peters 20-10-20",
      "fertilizerRate": "150-200",
      "pgrType": "B-Nine + Cycocel",
      "pgrRate": "2500 ppm + 750 ppm",
      "pgrTiming": "Weeks 3-5, spray",
      "pinchingNotes": "Pinch once at week 3",
      "chemSensitivities": "",
      "generalNotes": "Responds well to cool finishing temps",
      "sourcePageNumber": 3
    }
  ],
  "detectedStructure": { "format": "cultural-guide", "sections": ["identity", "propagation", "finish"] },
  "confidence": "high",
  "pageNotes": "Cultural guide format. 3 varieties extracted."
}
```

**Confidence scoring** is ephemeral — used only in the review step to highlight rows that need attention. It is not persisted to the database.

**Error responses:**
- `400` — Invalid request (no pages, bad image format)
- `413` — Payload too large (images exceed 5MB each)
- `429` — Anthropic rate limit hit (frontend retries with exponential backoff)
- `500` — Extraction failed (parsing error, unexpected response)
- `504` — Timeout (frontend shows "This page took too long — try re-extracting")

**Authentication:**
- The endpoint validates the Supabase auth token from the request `Authorization` header
- If the app is in floor-code mode (no Supabase auth), the endpoint checks for a shared secret via `X-App-Token` header
- Unauthorized requests receive `401`

**Guardrails:**
- Max 5 pages per batch (Claude Vision token limits)
- 60-second timeout per batch (Vercel hobby plan limit)
- API key: `ANTHROPIC_API_KEY` env var (server-side only)
- Input validation: reject files over 200 pages, images over 5MB each
- Batching is transparent to user — they upload the full catalog once

### Claude Vision Prompt Strategy

The prompt extends the existing `buildParsePrompt` field schema, adding `chemSensitivities` and `tempGroup`. It instructs Claude to extract only production-relevant data:

- **Identity:** crop genus/species, series name, breeder, annual/perennial
- **Propagation:** tray size, cell count, propagation weeks
- **Finish conditions:** finish weeks, day/night temps, temp group (cool/warm), light, spacing
- **Fertility:** fertilizer type and rate (ppm N)
- **PGR:** type, rate, timing/application method
- **Cultural notes:** pinching, chemical sensitivities, general production notes
- **Meta:** `cultureGuideUrl` auto-populated from the `BREEDERS` config for the selected breeder (not extracted from the PDF itself)

The prompt explicitly instructs Claude not to extract or fabricate grade values (`growerGrade`, `customerGrade`) — these are user-assigned ratings only.

One variety entry per series (not per color). If a catalog page shows "Cabaret Calibrachoa" with 12 colors listed, that produces one entry for the Cabaret series. This matches the existing variety library convention.

Dense multi-crop table pages (10+ series with abbreviated data) are handled by instructing Claude to return one item per row, using the detected column headers for consistent field mapping.

## Frontend Components

### PdfCatalogImport.jsx (new file)

Extracted into its own file to manage codebase size (Libraries.jsx is already ~3400 lines). Imports `useVarieties` from `./supabase` and the `BREEDERS` constant from `./Libraries` (requires adding a named export: `export const BREEDERS = [...]` — this does not affect the existing default export).

Main wizard component with 4 steps:

- **Step 1 (Upload):** Breeder selector dropdown (using existing `BREEDERS` list), PDF drop zone. Accepts `.pdf` only. Loads pdf.js via CDN (same pattern as SheetJS for Excel import).
- **Step 2 (Extracting):** Progress bar with page count. Running total of varieties found. Per-page confidence indicators (green/amber/red dots). Results appear progressively as batches complete. Cancel button preserves partial results.
- **Step 3 (Review):** Editable table with all extracted varieties. Columns: Crop, Series, Breeder, Finish Wks, Temps, Light, PGR, Confidence. Inline edit on cell click. Bulk delete via checkboxes. Filter by crop, search by name. "Re-extract page X" button on low-confidence rows (uses `sourcePageNumber` to identify which pages to resend). Re-extraction replaces all items from that page.
- **Step 4 (Merge & Commit):** Merge preview showing NEW/ENRICHED/CONFLICT/SKIPPED counts. Conflict resolution UI: side-by-side comparison with radio buttons (keep yours / use PDF). Commit button with summary.

### Batch Processing State

- Results accumulate progressively as each batch of 5 pages completes
- If a batch fails, it is marked as failed and the user can retry just that batch from the review step
- If the user cancels mid-extraction, all results collected so far are preserved and shown in the review table
- Each extracted item carries `sourcePageNumber` so failed pages can be re-extracted individually

### Integration Point

The existing `PDFUploader` component and `buildParsePrompt` function in Libraries.jsx are removed. The `VarietyLibrary` component gets an "Import from Catalog PDF" button in its header that sets `view` to `"pdf-import"` and renders `<PdfCatalogImport />`. The `BREEDERS` constant is exported from Libraries.jsx for use in the new file.

## Dependencies

- **pdf.js** — loaded via CDN (`<script>` tag, same pattern as SheetJS/XLSX). Renders PDF pages to canvas, which are then converted to base64 PNG images.
- **@anthropic-ai/sdk** — added to `package.json`, used server-side only in the Vercel function.
- No other new dependencies.

## Files Changed

- `src/PdfCatalogImport.jsx` — New file. PDF import wizard component.
- `src/Libraries.jsx` — Remove `PDFUploader` component and `buildParsePrompt` function. Export `BREEDERS` constant. Add "Import from Catalog PDF" button to `VarietyLibrary` header. Add `view === "pdf-import"` render path.
- `api/extract-catalog.js` — New Vercel serverless function for Claude Vision extraction.
- `vercel.json` — New. API route configuration with 60s max duration.
- `package.json` — Add `@anthropic-ai/sdk` dependency.

## Not In Scope

- MinerU preprocessing (can be added later if accuracy on scanned PDFs is insufficient)
- Automatic linking of imported varieties to broker_catalogs pricing
- Batch import of multiple PDFs at once
- OCR for scanned/photographed catalogs (Claude Vision handles printed PDFs well; handwritten or very poor scans are out of scope)
- Cost estimation display (can be added later if API costs become a concern)
