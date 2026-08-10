-- Stamp the source family on order lines at lock-in — a variety can live in
-- several families (Caldera Hot Pink: 4.5" AND 10" HB), so labeling by variety
-- lookup guessed wrong. The line knows its family from the page that locked it.
alter table purchase_order_lines add column if not exists recipe_id uuid;
