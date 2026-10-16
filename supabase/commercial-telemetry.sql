begin;
create table if not exists atlas_commercial.telemetry_daily(day date not null,event text not null,version text not null,count bigint not null default 0,primary key(day,event,version));
create table if not exists atlas_commercial.telemetry_rate(user_id uuid not null references auth.users(id) on delete cascade,day date not null,count integer not null default 0,primary key(user_id,day));
alter table atlas_commercial.telemetry_daily enable row level security;
alter table atlas_commercial.telemetry_rate enable row level security;
revoke all on atlas_commercial.telemetry_daily,atlas_commercial.telemetry_rate from public,anon,authenticated;
commit;
