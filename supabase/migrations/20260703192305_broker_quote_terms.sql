-- Per-quote order/variety minimums parsed from the quote sheets (Express Summary, EHR MINIMUM row,
-- Ball Terms sheet). Minimums vary by supplier, farm (origin) and form — feeds the Origins view's
-- below-minimum flags with real thresholds instead of a flat assumption.
create table if not exists broker_quote_terms (
  id            bigint generated always as identity primary key,
  season        text not null,
  broker        text,              -- Ball | EHR | Express
  supplier      text,              -- breeder (Dummen, Danziger, Beekenkamp, ...)
  origin        text,              -- farm country when named in the quote
  urc_order_min integer,           -- cuttings per order for URC/AutoStix
  cc_order_min  integer,           -- cuttings per order for Callused (usually lower)
  per_variety_min integer,         -- cuttings per variety (usually 100)
  min_unit      text,              -- cuttings | trays | usd | box
  below_min_fee text,              -- raw fee schedule
  min_statement text,              -- full raw minimum text (for verification)
  source_file   text,
  created_at    timestamptz default now()
);
alter table broker_quote_terms enable row level security;
drop policy if exists "allow all broker_quote_terms" on broker_quote_terms;
create policy "allow all broker_quote_terms" on broker_quote_terms for all to public using (true) with check (true);
create index if not exists idx_bqt_supplier on broker_quote_terms(season, supplier);
