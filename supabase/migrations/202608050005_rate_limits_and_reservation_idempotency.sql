-- Phase 6: durable abuse controls. Neither table is readable or writable by
-- browser roles; only narrowly scoped SECURITY DEFINER functions are exposed.

create table if not exists public.rate_limit_buckets (
  scope text not null check (scope ~ '^[a-z0-9_-]{1,64}$'),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default pg_catalog.now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (scope, key_hash)
);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from public, anon, authenticated, service_role;

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
        when public.rate_limit_buckets.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
          then pg_catalog.now()
        else public.rate_limit_buckets.window_started_at
      end,
      request_count = case
        when public.rate_limit_buckets.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
          then 1
        else public.rate_limit_buckets.request_count + 1
      end,
      updated_at = pg_catalog.now()
  returning bucket.request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit_v1(text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.consume_rate_limit_v1(text, text, integer, integer) to service_role;

create table if not exists public.reservation_idempotency (
  idempotency_key text primary key check (idempotency_key ~ '^[A-Za-z0-9_-]{16,200}$'),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  wish_id uuid not null references public.wishes(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= created_at)
);

create index if not exists reservation_idempotency_completed_at_idx
  on public.reservation_idempotency (completed_at)
  where completed_at is not null;

alter table public.reservation_idempotency enable row level security;
revoke all on table public.reservation_idempotency from public, anon, authenticated, service_role;

create or replace function public.reserve_wish_v3(
  p_wishlist_id uuid,
  p_wish_id uuid,
  p_guest_name text,
  p_password text,
  p_idempotency_key text
)
returns table (reservation_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.reservation_idempotency%rowtype;
  v_inserted_key text;
  v_reservation_id uuid;
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_guest_name, ''))) not between 1 and 80
     or pg_catalog.char_length(coalesce(p_password, '')) not between 8 and 64
     or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{16,200}$' then
    raise exception 'invalid_reservation_data' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.wishes as wish
    join public.wishlists as list on list.id = wish.wishlist_id
    where list.id = p_wishlist_id
      and wish.id = p_wish_id
      and wish.archived_at is null
      and list.published_at is not null
      and list.archived_at is null
  ) then
    raise exception 'wish_not_available' using errcode = 'P0002';
  end if;

  insert into public.reservation_idempotency as request (
    idempotency_key, wishlist_id, wish_id
  )
  values (p_idempotency_key, p_wishlist_id, p_wish_id)
  on conflict (idempotency_key) do nothing
  returning request.idempotency_key into v_inserted_key;

  if v_inserted_key is null then
    select request.* into v_existing
    from public.reservation_idempotency as request
    where request.idempotency_key = p_idempotency_key
    for update;

    if not found
       or v_existing.wishlist_id <> p_wishlist_id
       or v_existing.wish_id <> p_wish_id
       or v_existing.reservation_id is null then
      raise exception 'invalid_idempotency_key' using errcode = '22023';
    end if;

    reservation_id := v_existing.reservation_id;
    replayed := true;
    return next;
    return;
  end if;

  insert into public.reservations (wish_id, guest_name, password_hash, manage_token_hash)
  values (
    p_wish_id,
    pg_catalog.left(pg_catalog.btrim(p_guest_name), 80),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    null
  )
  returning id into v_reservation_id;

  update public.reservation_idempotency as request
  set reservation_id = v_reservation_id,
      completed_at = pg_catalog.now()
  where request.idempotency_key = p_idempotency_key;

  reservation_id := v_reservation_id;
  replayed := false;
  return next;
end;
$$;

revoke all on function public.reserve_wish_v3(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_wish_v3(uuid, uuid, text, text, text) to service_role;
