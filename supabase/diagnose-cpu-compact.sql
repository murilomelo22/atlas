-- Run in the SQL Editor while CPU is high, with Atlas tabs closed.
-- Copy the result as text. Three short columns avoid horizontal clipping.
-- Read-only; no query text, credentials, cancellation or schema changes.
begin transaction read only;
set local statement_timeout = '5s';

with activity as materialized (
  select row_number() over (order by (state = 'active') desc nulls last, query_start asc nulls last) as priority,
         pid, usename, backend_type, state, query_id, query_start,
         xact_start, state_change, wait_event_type, wait_event,
         pg_catalog.pg_blocking_pids(pid) as blocked_by
  from pg_catalog.pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()
    and (state is distinct from 'idle' or backend_type = 'autovacuum worker')
  order by (state = 'active') desc nulls last, query_start asc nulls last
  limit 10
), vacuum as materialized (
  select pid, phase, heap_blks_scanned, heap_blks_total
  from pg_catalog.pg_stat_progress_vacuum
  where datname = current_database()
  order by pid
  limit 3
), report as (
  select 0 as section, 0::bigint as priority, '' as process, 0 as position,
         'capturado_utc' as field,
         to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as value
  union all
  select 1, a.priority, a.pid::text, fields.position, fields.field, fields.value
  from activity a
  cross join lateral (values
    (1, 'estado', a.state),
    (2, 'no_estado_s', round(extract(epoch from statement_timestamp() - a.state_change), 1)::text),
    (3, 'transacao_s', round(extract(epoch from statement_timestamp() - a.xact_start), 1)::text),
    (4, 'espera', coalesce(a.wait_event_type || ':' || a.wait_event, 'sem espera registrada')),
    (5, 'bloqueado_por', a.blocked_by::text),
    (6, 'consulta_s', round(extract(epoch from statement_timestamp() - a.query_start), 1)::text),
    (7, 'papel', a.usename::text),
    (8, 'tipo', a.backend_type),
    (9, 'consulta_id', a.query_id::text)
  ) as fields(position, field, value)
  union all
  select 2, v.pid::bigint, v.pid::text, 1, 'vacuum_fase', v.phase
  from vacuum v
  union all
  select 2, v.pid::bigint, v.pid::text, 2, 'vacuum_blocos', v.heap_blks_scanned::text || '/' || v.heap_blks_total::text
  from vacuum v
)
select nullif(process, '') as pid, field as informacao, coalesce(value, '-') as valor
from report
order by section, priority, position;

rollback;
