-- Owners may deliberately skip the 90-day grace period. Database deletion is
-- atomic; product images are durably queued because Storage is not part of the
-- PostgreSQL transaction.

create or replace function public.delete_wishlist_immediately_v1(
  p_wishlist_id uuid,
  p_expected_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  select list.title
    into v_title
  from public.wishlists as list
  where list.id = p_wishlist_id
  for update;

  if not found then
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;
  if p_expected_title is null or pg_catalog.btrim(p_expected_title) <> v_title then
    raise exception 'wishlist_title_mismatch' using errcode = '22023';
  end if;

  perform 1
  from public.wishes as wish
  where wish.wishlist_id = p_wishlist_id
  for update;

  insert into public.storage_deletion_queue (bucket, object_path)
  select 'product-images', wish.image_storage_path
  from public.wishes as wish
  where wish.wishlist_id = p_wishlist_id
    and wish.image_storage_path is not null
  on conflict (bucket, object_path) do nothing;

  delete from public.reservation_idempotency as request
  where request.wishlist_id = p_wishlist_id;

  delete from public.reservations as reservation
  using public.wishes as wish
  where reservation.wish_id = wish.id
    and wish.wishlist_id = p_wishlist_id;

  delete from public.wishlists as list
  where list.id = p_wishlist_id;

  return p_wishlist_id;
end;
$$;

revoke all on function public.delete_wishlist_immediately_v1(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_wishlist_immediately_v1(uuid, text)
  to authenticated;
