-- Archived sourcing listings — varieties Schlegel will never/unlikely use, hidden from
-- the comparison + matcher so they stop cluttering cleanup. Keyed by the EFFECTIVE
-- (post-override) match group: supplier|form_class|variety_key. Restorable (just delete).
create table if not exists sourcing_archived (
  id uuid primary key default gen_random_uuid(),
  season text not null default '2026-2027',
  supplier text not null,
  form_class text not null,
  variety_key text not null,          -- effective key of the group
  variety text,                       -- display name at time of archiving
  created_at timestamptz default now(),
  created_by text,
  unique (season, supplier, form_class, variety_key)
);
alter table sourcing_archived enable row level security;
drop policy if exists "allow all sourcing_archived" on sourcing_archived;
create policy "allow all sourcing_archived" on sourcing_archived for all to public using (true) with check (true);

-- Rewrite v_sourcing_prices: apply manual match overrides (effective key) AND drop
-- archived groups. All prior filters preserved.
create or replace view v_sourcing_prices as
with bp as (
  select b.supplier, b.form_class, b.variety_key, b.broker, b.variety, b.crop,
         b.landed, b.list_price, b.exclusivity,
         coalesce(o.to_variety_key, b.variety_key) as eff_key,
         o.to_variety as eff_variety
  from broker_prices b
  left join sourcing_overrides o
    on o.season = b.season and o.supplier = b.supplier and o.form_class = b.form_class
       and o.from_variety_key = b.variety_key
       and (o.broker is null or o.broker = b.broker)
  where b.season = '2026-2027' and b.landed is not null and b.landed > 0
    and b.form_class <> 'urc_autostix'
    and not (split_part(b.variety_key,' ',1) in ('geranium','osteospermum','scaevola') and b.form_class <> 'callused')
    and not (split_part(b.variety_key,' ',1) = 'lantana' and b.form_class <> 'callused'
             and exists (select 1 from broker_prices b2 where b2.season = '2026-2027'
                         and b2.supplier = b.supplier and b2.variety_key = b.variety_key and b2.form_class = 'callused'))
    and not exists (select 1 from sourcing_archived ar
                    where ar.season = b.season and ar.supplier = b.supplier and ar.form_class = b.form_class
                      and ar.variety_key = coalesce(o.to_variety_key, b.variety_key))
)
select supplier, form_class, eff_key as variety_key,
       supplier || '|' || form_class || '|' || eff_key as match_key, broker,
       (array_agg(coalesce(eff_variety, variety) order by landed))[1] as variety,
       (array_agg(crop order by landed))[1] as crop,
       min(landed) as landed, min(list_price) as list_price,
       bool_or(coalesce(exclusivity,'') <> '' and lower(exclusivity) not in ('no','none','n')) as has_excl
from bp
group by supplier, form_class, eff_key, broker;

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
  count(*) filter (where nbrokers >= 2) as comparable_count,
  (select array_agg(distinct broker order by broker) from v_sourcing_prices b where b.supplier = v.supplier) as brokers,
  mode() within group (order by cheapest_broker) filter (where nbrokers >= 2) as rec_broker,
  round((avg((hi-lo)/nullif(lo,0)) filter (where nbrokers >= 2) * 100)::numeric, 1) as avg_spread_pct
from v group by v.supplier;
