-- Seed a stable "last year" (2025) per-size poinsettia price anchor from the current
-- 2026 pre-book prices, so the Winter pricing tool can show Last Year vs This Year without
-- the anchor shifting when this-year prices are edited. Guarded: only seeds if 2025 is empty.
insert into crop_pricing (container_id, variety_id, crop_name, effective_year, price, price_tier, source_doc, notes)
select container_id, variety_id, crop_name, 2025, price, price_tier, source_doc, 'last-year anchor (seeded from 2026 pre-book)'
from crop_pricing
where effective_year = 2026 and upper(crop_name) = 'POINSETTIA' and variety_id is null
  and not exists (
    select 1 from crop_pricing cp2 where cp2.effective_year = 2025 and upper(cp2.crop_name) = 'POINSETTIA'
  );
