-- Mats keeps the established four-character password minimum while adopting
-- the same durable idempotency protection as every new public list.

create or replace function public.reserve_mats_wish_v2(
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
  v_wishlist_id constant uuid := '3d1f46e6-8e0e-4418-a0da-581be7cf795f'::uuid;
  v_existing public.reservation_idempotency%rowtype;
  v_inserted_key text;
  v_reservation_id uuid;
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_guest_name, ''))) not between 1 and 80
     or pg_catalog.char_length(coalesce(p_password, '')) not between 4 and 64
     or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{16,200}$' then
    raise exception 'invalid_reservation_data' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.wishes as wish
    join public.wishlists as list on list.id = wish.wishlist_id
    where list.id = v_wishlist_id
      and wish.id = p_wish_id
      and wish.archived_at is null
      and list.published_at is not null
      and list.archived_at is null
  ) then
    raise exception 'wish_not_available' using errcode = 'P0002';
  end if;

  insert into public.reservation_idempotency as request (idempotency_key, wishlist_id, wish_id)
  values (p_idempotency_key, v_wishlist_id, p_wish_id)
  on conflict (idempotency_key) do nothing
  returning request.idempotency_key into v_inserted_key;

  if v_inserted_key is null then
    select request.* into v_existing
    from public.reservation_idempotency as request
    where request.idempotency_key = p_idempotency_key
    for update;
    if not found
       or v_existing.wishlist_id <> v_wishlist_id
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

revoke all on function public.reserve_mats_wish_v2(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_mats_wish_v2(uuid, text, text, text) to service_role;
