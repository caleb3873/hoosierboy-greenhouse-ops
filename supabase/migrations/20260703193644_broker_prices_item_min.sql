-- Per-variety order minimum from the quote line data (Express "Item Min" column, usually 100).
alter table broker_prices add column if not exists item_min integer;
