-- Add per-variety Item Min to the sourcing view (keeps the callused-only + autostix rules intact).
create or replace view v_sourcing_prices as
select bp.supplier, bp.form_class, bp.variety_key, bp.match_key, bp.broker,
       (array_agg(bp.variety order by bp.landed))[1] as variety,
       (array_agg(bp.crop order by bp.landed))[1]    as crop,
       min(bp.landed) as landed, min(bp.list_price) as list_price,
       max(bp.item_min) as item_min,
       bool_or(coalesce(bp.exclusivity,'')<>'' and lower(bp.exclusivity) not in ('no','none','n')) as has_excl
from broker_prices bp
where bp.season='2026-2027' and bp.landed is not null and bp.landed>0 and bp.form_class<>'urc_autostix'
  and not (split_part(bp.variety_key,' ',1) in ('geranium','osteospermum','scaevola') and bp.form_class<>'callused')
  and not (split_part(bp.variety_key,' ',1)='lantana' and bp.form_class<>'callused'
           and exists (select 1 from broker_prices b2 where b2.season='2026-2027'
                       and b2.supplier=bp.supplier and b2.variety_key=bp.variety_key and b2.form_class='callused'))
group by bp.supplier, bp.form_class, bp.variety_key, bp.match_key, bp.broker;
