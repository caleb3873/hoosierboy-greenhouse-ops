create or replace view v_sourcing_prices as
select supplier, form_class, variety_key, match_key, broker,
       (array_agg(variety order by landed))[1] as variety,
       (array_agg(crop order by landed))[1]    as crop,
       min(landed)     as landed,
       min(list_price) as list_price,
       bool_or(coalesce(exclusivity,'') <> '' and lower(exclusivity) not in ('no','none','n')) as has_excl
from broker_prices
where season = '2026-2027' and landed is not null and landed > 0 and form_class <> 'urc_autostix'
group by supplier, form_class, variety_key, match_key, broker;

create or replace view v_sourcing_suppliers as
with vb as (
  select supplier, form_class, variety_key, broker, min(landed) landed
  from broker_prices where season='2026-2027' and landed > 0 and form_class <> 'urc_autostix'
  group by supplier, form_class, variety_key, broker
),
v as (
  select supplier, form_class, variety_key,
         count(*) nbrokers,
         (array_agg(broker order by landed))[1] cheapest_broker,
         min(landed) lo, max(landed) hi
  from vb group by supplier, form_class, variety_key
)
select v.supplier,
  count(*) as variety_count,
  count(*) filter (where nbrokers >= 2) as comparable_count,
  (select array_agg(distinct broker order by broker) from vb b where b.supplier = v.supplier) as brokers,
  mode() within group (order by cheapest_broker) filter (where nbrokers >= 2) as rec_broker,
  round((avg((hi-lo)/nullif(lo,0)) filter (where nbrokers >= 2) * 100)::numeric, 1) as avg_spread_pct
from v group by v.supplier;
