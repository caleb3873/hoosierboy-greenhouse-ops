-- Full catalog facets for the add-plant door: EVERY supplier + form with counts
-- (the door's 1,000-row search cap silently truncated the supplier dropdown).
create or replace function broker_catalog_facets()
returns table(supplier text, form_class text, n bigint)
language sql stable as $$
  select supplier, form_class, count(*) n
  from broker_prices
  where supplier is not null
  group by supplier, form_class
  order by supplier, form_class
$$;
grant execute on function broker_catalog_facets() to anon, authenticated;
