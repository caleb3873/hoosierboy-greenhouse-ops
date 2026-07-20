-- Head Grower feature: resistance-management (MOA) tagging on the product library.
-- moa holds the IRAC/FRAC group (e.g. 'IRAC 4A', 'FRAC 11', 'PGR', 'Biological').
alter table chem_products add column if not exists moa text;
