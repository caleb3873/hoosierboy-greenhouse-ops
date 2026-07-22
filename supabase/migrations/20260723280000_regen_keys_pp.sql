-- pp26,728-style patent numbers: re-key the 3 broker rows that carry them.
update broker_prices b set variety_key=x.k from (values
  ('b4cae37b-2456-4414-b8ad-e9a8b2f7226c'::uuid,'lavandula blonde plantinum'),
  ('ec52cbeb-424c-455d-b525-0a7157a5976f'::uuid,'helenium n sassy short'),
  ('b4777583-3da2-4832-b7db-884b88f7eea2'::uuid,'veronica seaside')
) as x(id,k) where b.id=x.id;
