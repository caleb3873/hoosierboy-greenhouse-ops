create or replace view v_sourcing_prices as
select bp.supplier, bp.form_class, bp.variety_key, bp.match_key, bp.broker,
       (array_agg(bp.variety order by bp.landed))[1] as variety,
       (array_agg(bp.crop order by bp.landed))[1]    as crop,
       min(bp.landed) as landed, min(bp.list_price) as list_price,
       bool_or(coalesce(bp.exclusivity,'')<>'' and lower(bp.exclusivity) not in ('no','none','n')) as has_excl
from broker_prices bp
where bp.season='2026-2027' and bp.landed is not null and bp.landed>0 and bp.form_class<>'urc_autostix'
  and not (split_part(bp.variety_key,' ',1) in ('geranium','osteospermum','scaevola') and bp.form_class<>'callused')
  -- Lantana is bought callused: where a variety HAS a callused listing, show callused only — never
  -- compare URC to callused (apples-to-apples). Lantana with no callused anywhere stays URC.
  and not (split_part(bp.variety_key,' ',1)='lantana' and bp.form_class<>'callused'
           and exists (select 1 from broker_prices b2 where b2.season='2026-2027'
                       and b2.supplier=bp.supplier and b2.variety_key=bp.variety_key and b2.form_class='callused'))
group by bp.supplier, bp.form_class, bp.variety_key, bp.match_key, bp.broker;

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
