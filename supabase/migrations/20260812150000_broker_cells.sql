-- cells-per-tray on quotes: liners/plugs sell by the tray and the cell count is
-- the real unit of comparison ("72 vs 128 pricing"); parsed from the size code.
alter table broker_prices add column if not exists cells int;
