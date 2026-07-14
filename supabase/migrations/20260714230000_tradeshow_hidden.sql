-- Super-users (Paul 9999999, Mario) can hide a trade-show session from everyone else.
alter table tradeshow_sessions add column if not exists hidden boolean default false;
