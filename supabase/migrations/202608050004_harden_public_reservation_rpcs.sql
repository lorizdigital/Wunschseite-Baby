-- Phase 6 hardening: keep the public multi-list reservation contract while
-- removing all implicit object resolution from SECURITY DEFINER functions.

create extension if not exists pgcrypto;

create or replace function public.reserve_wish_v2(
  p_wishlist_id uuid,
  p_wish_id uuid,
  p_guest_name text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_guest_name, ''))) not between 1 and 80
     or pg_catalog.char_length(coalesce(p_password, '')) not between 8 and 64 then
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

  insert into public.reservations (wish_id, guest_name, password_hash, manage_token_hash)
  values (
    p_wish_id,
    pg_catalog.left(pg_catalog.btrim(p_guest_name), 80),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    null
  )
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.cancel_reservation_v2(
  p_wishlist_id uuid,
  p_wish_id uuid,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if pg_catalog.char_length(coalesce(p_password, '')) not between 8 and 64 then
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

  update public.reservations as reservation
  set cancelled_at = pg_catalog.now()
  where reservation.wish_id = p_wish_id
    and reservation.cancelled_at is null
    and reservation.password_hash is not null
    and reservation.password_hash = extensions.crypt(p_password, reservation.password_hash);

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.reserve_wish_v2(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_reservation_v2(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_wish_v2(uuid, uuid, text, text) to service_role;
grant execute on function public.cancel_reservation_v2(uuid, uuid, text) to service_role;
