-- PostgreSQL requires the INSERT target alias inside ON CONFLICT DO UPDATE.
-- The original function qualified the table with its schema, which causes
-- every caller to fail before a limit can be evaluated.

create or replace function public.consume_rate_limit_v1(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_scope !~ '^[a-z0-9_-]{1,64}$'
     or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit_context' using errcode = '22023';
  end if;

  insert into public.rate_limit_buckets as bucket (
    scope, key_hash, window_started_at, request_count, updated_at
  )
  values (p_scope, p_key_hash, pg_catalog.now(), 1, pg_catalog.now())
  on conflict (scope, key_hash) do update
  set window_started_at = case
        when bucket.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
          then pg_catalog.now()
        else bucket.window_started_at
      end,
      request_count = case
        when bucket.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
          then 1
        else bucket.request_count + 1
      end,
      updated_at = pg_catalog.now()
  returning bucket.request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit_v1(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_rate_limit_v1(text, text, integer, integer) to service_role;
