-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTION PLANNING — PHASE 1
-- Foundation for the four-tier waterfall:
--   Tier 1 (master):  variety_library, containers, spacing_profiles  [existing]
--   Tier 2 (plans):   production_plans                                [new]
--   Tier 3 (blocks):  scheduled_crops                                 [new]
--   Tier 4 (tasks):   tasks, manual_tasks, watering_tasks             [existing]
--   Physical layer:   benches, bench_container_capacity               [new]
--
-- Phase 1 is data plumbing only. The compatibility / no-mix checker activates
-- in Phase 2 once care_profile data is populated from the culture corpus.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. VARIETY LIBRARY: enrichment for the compatibility checker ────────────
ALTER TABLE variety_library
  ADD COLUMN IF NOT EXISTS series             TEXT,
  ADD COLUMN IF NOT EXISTS typical_color      TEXT,
  ADD COLUMN IF NOT EXISTS culture_source_id  UUID,           -- soft FK to culture_guides_public.id (other project)
  ADD COLUMN IF NOT EXISTS care_profile       JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_variety_library_series          ON variety_library (series);
CREATE INDEX IF NOT EXISTS idx_variety_library_culture_source  ON variety_library (culture_source_id);


-- ── 2. PRODUCTION PLANS (Tier 2 — blueprint container) ──────────────────────
CREATE TABLE IF NOT EXISTS production_plans (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,                       -- "Poinsettia 2025", "Fall 2025 Baseline"
  season               TEXT,                                -- Spring|Summer|Fall|Winter|Holiday
  year                 INT  NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft',       -- draft|active|archived
  cloned_from          UUID REFERENCES production_plans(id),
  target_total_volume  INT,                                 -- baseline for 15% reduction floor
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  created_by           TEXT,
  updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_production_plans_season_year ON production_plans (season, year);
CREATE INDEX IF NOT EXISTS idx_production_plans_status     ON production_plans (status);


-- ── 3. BENCHES (physical layer) ─────────────────────────────────────────────
-- code = canonical short identifier (EQ0401 = "Even" Quonset 04, bench 01).
-- E is a sort-order prefix only — applies to even AND odd houses.
-- Position 1..4 maps to left-to-right going in the door:
--   1: 4-ft wall bench (left)
--   2: 8-ft mid bench
--   3: 8-ft mid bench
--   4: 4-ft wall bench (right)
CREATE TABLE IF NOT EXISTS benches (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                   TEXT UNIQUE NOT NULL,
  zone_type              TEXT NOT NULL,                     -- 'quonset'|'main_range'|'pad'|'outdoor'
  zone_label             TEXT NOT NULL,                     -- "Bluff Quonset 04", "Bluff Main Range", "Bluff South East Pad"
  zone_id                UUID,                              -- optional FK target (when wired to houses/pads)
  position               INT,                               -- 1..N within zone
  length_ft              NUMERIC,
  width_ft               NUMERIC,
  bench_area_sqft        NUMERIC GENERATED ALWAYS AS (COALESCE(length_ft, 0) * COALESCE(width_ft, 0)) STORED,
  watering_capability    TEXT DEFAULT 'tube',               -- what's *available* on this bench: tube|overhead|hand|flood
  default_container_id   UUID REFERENCES containers(id),
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_benches_zone ON benches (zone_type, zone_label);


-- ── 4. BENCH × CONTAINER CAPACITY (the hard physical rule) ──────────────────
-- "Bench EQ0402 (8-ft mid) holds 180 of a 9-inch pan" → one row here.
-- packing_pattern lets us record both tight (early prop) and finished spacing.
CREATE TABLE IF NOT EXISTS bench_container_capacity (
  bench_id         UUID REFERENCES benches(id) ON DELETE CASCADE,
  container_id     UUID REFERENCES containers(id),
  packing_pattern  TEXT NOT NULL DEFAULT 'finish',           -- tight|spaced|finish
  pots_per_bench   INT NOT NULL,
  source           TEXT,                                     -- measured|calculated|manual
  notes            TEXT,
  PRIMARY KEY (bench_id, container_id, packing_pattern)
);


-- ── 5. SCHEDULED CROPS (Tier 3 — crop blocks) ───────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_crops (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id                UUID NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  variety_id             UUID NOT NULL REFERENCES variety_library(id),
  container_id           UUID NOT NULL REFERENCES containers(id),
  color                  TEXT,                              -- soft-canonical UPPERCASE (auto-normalized below)
  qty_pots               INT  NOT NULL,
  ppp                    INT  DEFAULT 1,
  qty_plants_ordered     INT,                               -- from supplier order (acknowledgment)
  qty_plants_confirmed   INT,                               -- from supplier confirmation
  ship_week              INT  NOT NULL,
  ship_year              INT  NOT NULL,
  plant_week             INT,                               -- manual for now; Phase 2 can auto-fill from variety.finish_weeks
  plant_year             INT,
  prop_method            TEXT,                              -- LINER|PLUG|URC|SEED
  broker                 TEXT,
  bench_id               UUID REFERENCES benches(id),
  watering_method        TEXT,                              -- what's *actually used* on this block: tube|overhead|hand
  status                 TEXT NOT NULL DEFAULT 'planned',   -- planned|sown|growing|shipped|cancelled
  group_number           INT,
  is_combo_component     BOOLEAN DEFAULT false,
  combo_parent_id        UUID REFERENCES scheduled_crops(id),
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_crops_plan         ON scheduled_crops (plan_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_crops_bench_week   ON scheduled_crops (bench_id, ship_year, ship_week);
CREATE INDEX IF NOT EXISTS idx_scheduled_crops_variety      ON scheduled_crops (variety_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_crops_ship         ON scheduled_crops (ship_year, ship_week);
CREATE INDEX IF NOT EXISTS idx_scheduled_crops_status       ON scheduled_crops (status);


-- ── 6. COLOR NORMALIZATION TRIGGER (soft-canonical UPPERCASE) ───────────────
CREATE OR REPLACE FUNCTION normalize_scheduled_crops_color() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.color IS NOT NULL THEN
    NEW.color := UPPER(TRIM(NEW.color));
    IF NEW.color = '' THEN NEW.color := NULL; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_color ON scheduled_crops;
CREATE TRIGGER trg_normalize_color
  BEFORE INSERT OR UPDATE ON scheduled_crops
  FOR EACH ROW EXECUTE FUNCTION normalize_scheduled_crops_color();


-- ── 7. COLOR CANON VIEW (for UI autocomplete) ───────────────────────────────
CREATE OR REPLACE VIEW color_canon AS
SELECT color, count(*) AS usage_count
FROM scheduled_crops
WHERE color IS NOT NULL
GROUP BY color
ORDER BY count(*) DESC;


-- ── 8. RLS — match existing anon-CRUD pattern ───────────────────────────────
ALTER TABLE production_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE benches                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bench_container_capacity  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_crops           ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_plans_anon_all          ON production_plans         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY benches_anon_all                   ON benches                  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY bench_container_capacity_anon_all  ON bench_container_capacity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY scheduled_crops_anon_all           ON scheduled_crops          FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON production_plans          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON benches                   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bench_container_capacity  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_crops           TO anon, authenticated;
GRANT SELECT                         ON color_canon               TO anon, authenticated;
