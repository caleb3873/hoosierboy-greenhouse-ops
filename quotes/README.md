# Broker quote drop zone

Drag these here from the Desktop (macOS blocks the app's Desktop access):

- `Ball Quotes/`  ·  `EHR Quotes/`  ·  `Express Quotes/`  (the whole folders)
- any loose WebTrack exports (e.g. `PRODUCT_SEARCH_RESULTS_*.xlsx`)

Then run `node scripts/sync_quotes.js` (or ask the assistant — this folder is
readable by both). The parse prefers this folder and falls back to the Desktop.
Git ignores everything in here except this README.
