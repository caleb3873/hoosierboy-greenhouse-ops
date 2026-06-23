create or replace view v_sourcing_prices as
with src as (
  select supplier, form_class, variety_key, broker, variety, crop, landed, list_price, exclusivity
  from broker_prices
  where season='2026-2027' and landed is not null and landed>0 and form_class<>'urc_autostix'
    and not (split_part(variety_key,' ',1) in ('geranium','osteospermum','scaevola') and form_class<>'callused')
),
-- Lantana is bought callused. If ANY broker offers callused for a variety, bucket it as 'callused'
-- and have each broker contribute callused-if-it-has-it, else its URC (Ball/Express w/o callused).
lvar as (select supplier, variety_key, bool_or(form_class='callused') any_cal
         from src where variety_key like 'lantana%' group by supplier, variety_key),
lbp  as (select supplier, variety_key, broker, bool_or(form_class='callused') has_cal
         from src where variety_key like 'lantana%' and form_class in ('callused','urc') group by 1,2,3),
unified as (
  select supplier, form_class, variety_key, broker, variety, crop, landed, list_price, exclusivity
    from src where variety_key not like 'lantana%'
  union all
  select s.supplier, case when lv.any_cal then 'callused' else 'urc' end, s.variety_key, s.broker,
         s.variety, s.crop, s.landed, s.list_price, s.exclusivity
    from src s
    join lvar lv on lv.supplier=s.supplier and lv.variety_key=s.variety_key
    join lbp  bp on bp.supplier=s.supplier and bp.variety_key=s.variety_key and bp.broker=s.broker
    where s.variety_key like 'lantana%' and s.form_class in ('callused','urc')
      and s.form_class = (case when bp.has_cal then 'callused' else 'urc' end)
)
select supplier, form_class, variety_key, supplier||'|'||form_class||'|'||variety_key as match_key, broker,
       (array_agg(variety order by landed))[1] as variety,
       (array_agg(crop order by landed))[1]    as crop,
       min(landed) as landed, min(list_price) as list_price,
       bool_or(coalesce(exclusivity,'')<>'' and lower(exclusivity) not in ('no','none','n')) as has_excl
from unified
group by supplier, form_class, variety_key, broker;

create or replace view v_sourcing_suppliers as
with v as (
  select supplier, form_class, variety_key,
    count(distinct broker) nbrokers,
    (array_agg(broker order by landed))[1] cheapest_broker,
    min(landed) lo, max(landed) hi
  from v_sourcing_prices group by supplier, form_class, variety_key
)
select v.supplier,
  count(*) as variety_count,
  count(*) filter (where nbrokers>=2) as comparable_count,
  (select array_agg(distinct broker order by broker) from v_sourcing_prices b where b.supplier=v.supplier) as brokers,
  mode() within group (order by cheapest_broker) filter (where nbrokers>=2) as rec_broker,
  round((avg((hi-lo)/nullif(lo,0)) filter (where nbrokers>=2)*100)::numeric,1) as avg_spread_pct
from v group by v.supplier;
