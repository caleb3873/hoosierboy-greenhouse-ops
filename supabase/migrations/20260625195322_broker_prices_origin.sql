-- Farm/origin (country) for each broker price row, parsed from the quote filename.
-- Drives farm separation, the origin map, and per-farm order minimums.
alter table broker_prices add column if not exists origin text;
