-- Manually-locked sourcing: a planner matched a broker quote to this row by hand
-- (family page 🔗). The reprice engine (apply_sourcing_to_plan.js) must REFRESH such a
-- row only from its locked broker/supplier — never re-point it to a name-matched catalog
-- entry — so a hand lock is permanent for future ordering. Pairs with variety_library.match_aliases.
alter table scheduled_crops add column if not exists sourcing_locked boolean default false;
