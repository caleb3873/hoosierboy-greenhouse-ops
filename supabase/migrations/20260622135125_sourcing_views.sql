create or replace view v_sourcing_prices as
select supplier, form_class, variety_key, match_key, broker,
       (array_agg(variety order by landed))[1] as variety,
       (array_agg(crop order by landed))[1]    as crop,
       min(landed)     as landed,
       min(list_price) as list_price,
       bool_or(coalesce(exclusivity,'') <> '' and lower(exclusivity) not in ('no','none','n')) as has_excl
from broker_prices
where season = '2026-2027' and landed is not null and landed > 0
group by supplier, form_class, variety_key, match_key, broker;
