-- Run in the SQL Editor while CPU is high, with Atlas tabs closed.
-- Copy the result as text. Three short columns avoid horizontal clipping.
-- Read-only; no query text, credentials, cancellation or schema changes.
begin transaction read only;
set local statement_timeout = '5s';

with activity as materialized (
  select pid, usename, backend_type, state, query_id, query_start,
         xact_start, state_change, wait_event_type, wait_event,
         pg_catalog.pg_blocking_pids(pid) as blocked_by
  from pg_catalog.pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()
    and (state is distinct from 'idle' or backend_type = 'autovacuum worker')
  order by query_start asc nulls last
  limit 20
), report as (
  select 0 as section, '' as process, 0 as position,
         'capturado_utc' as field,
         to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as value
  union all
  select 1, a.pid::text, fields.position, fields.field, fields.value
  from activity a
  cross join lateral (values
    (1, 'papel', a.usename::text),
    (2, 'tipo', a.backend_type),
    (3, 'estado', a.state),
    (4, 'consulta_id', a.query_id::text),
    (5, 'consulta_s', round(extract(epoch from statement_timestamp() - a.query_start), 1)::text),
    (6, 'transacao_s', round(extract(epoch from statement_timestamp() - a.xact_start), 1)::text),
    (7, 'no_estado_s', round(extract(epoch from statement_timestamp() - a.state_change), 1)::text),
    (8, 'espera', coalesce(a.wait_event_type || ':' || a.wait_event, 'sem espera registrada')),
    (9, 'bloqueado_por', a.blocked_by::text)
  ) as fields(position, field, value)
  union all
  select 2, v.pid::text, 1, 'vacuum_fase', v.phase
  from pg_catalog.pg_stat_progress_vacuum v where v.datname = current_database()
  union all
  select 2, v.pid::text, 2, 'vacuum_blocos', v.heap_blks_scanned::text || '/' || v.heap_blks_total::text
  from pg_catalog.pg_stat_progress_vacuum v where v.datname = current_database()
)
select nullif(process, '') as pid, field as informacao, coalesce(value, '-') as valor
from report
order by section, process, position;

rollback;
