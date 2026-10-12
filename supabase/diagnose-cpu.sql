-- Run in the project's SQL Editor as the project owner while CPU is high.
-- Read-only. Does not display query text, cancel sessions, or modify data.
begin transaction read only;
set local statement_timeout = '5s';

select clock_timestamp() as captured_at,
       backend_type, state, count(*) as connections
from pg_catalog.pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid()
group by backend_type, state
order by connections desc;

select pid, backend_type, usename as database_role, state,
       wait_event_type, wait_event,
       clock_timestamp() - query_start as query_duration,
       pg_catalog.pg_blocking_pids(pid) as blocked_by
from pg_catalog.pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid()
  and state <> 'idle'
order by query_start asc nulls last
limit 20;

select pid, relid::regclass as table_name, phase,
       heap_blks_total, heap_blks_scanned, heap_blks_vacuumed
from pg_catalog.pg_stat_progress_vacuum
where datname = current_database();

rollback;
