-- Phase 6 retention: an owner can schedule deletion only after the list is
-- taken offline. A service-only maintenance job performs the irreversible step
-- after the grace period and only after storage has been removed by the API.

create or replace function public.schedule_wishlist_deletion_v1(p_wishlist_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delete_after timestamptz := pg_catalog.now() + pg_catalog.make_interval(days => 90);
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  update public.wishlists as list
  set archived_at = coalesce(list.archived_at, pg_catalog.now()),
      delete_after = coalesce(list.delete_after, v_delete_after),
      updated_at = pg_catalog.now()
  where list.id = p_wishlist_id
  returning list.delete_after into v_delete_after;

  if not found then
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;
  return v_delete_after;
end;
$$;

-- Deletes expired reservations without retaining guest names or password hashes
-- longer than the documented retention periods.
create or replace function public.purge_expired_operational_data_v1(p_batch_size integer default 1000)
returns table (
  idempotency_keys_deleted integer,
  cancelled_reservations_deleted integer,
  archived_reservations_deleted integer,
  invitations_deleted integer,
  rate_limit_buckets_deleted integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch_size not between 1 and 5000 then
    raise exception 'invalid_batch_size' using errcode = '22023';
  end if;

  delete from public.reservation_idempotency as request
  where request.idempotency_key in (
    select candidate.idempotency_key
    from public.reservation_idempotency as candidate
    where candidate.created_at < pg_catalog.now() - pg_catalog.make_interval(days => 1)
    order by candidate.created_at
    limit p_batch_size
  );
  get diagnostics idempotency_keys_deleted = row_count;

  delete from public.reservations as reservation
  where reservation.id in (
    select candidate.id
    from public.reservations as candidate
    where candidate.cancelled_at < pg_catalog.now() - pg_catalog.make_interval(days => 30)
    order by candidate.cancelled_at
    limit p_batch_size
  );
  get diagnostics cancelled_reservations_deleted = row_count;

  delete from public.reservations as reservation
  using public.wishes as wish, public.wishlists as list
  where reservation.wish_id = wish.id
    and wish.wishlist_id = list.id
    and list.archived_at < pg_catalog.now() - pg_catalog.make_interval(days => 90)
    and reservation.id in (
      select candidate.id
      from public.reservations as candidate
      join public.wishes as candidate_wish on candidate_wish.id = candidate.wish_id
      join public.wishlists as candidate_list on candidate_list.id = candidate_wish.wishlist_id
      where candidate_list.archived_at < pg_catalog.now() - pg_catalog.make_interval(days => 90)
      order by candidate.reserved_at
      limit p_batch_size
    );
  get diagnostics archived_reservations_deleted = row_count;

  delete from public.wishlist_invitations as invitation
  where invitation.id in (
    select candidate.id
    from public.wishlist_invitations as candidate
    where candidate.accepted_at is not null
       or candidate.expires_at < pg_catalog.now() - pg_catalog.make_interval(days => 7)
       or candidate.revoked_at < pg_catalog.now() - pg_catalog.make_interval(days => 7)
    order by candidate.created_at
    limit p_batch_size
  );
  get diagnostics invitations_deleted = row_count;

  delete from public.rate_limit_buckets as bucket
  where bucket.updated_at < pg_catalog.now() - pg_catalog.make_interval(days => 2);
  get diagnostics rate_limit_buckets_deleted = row_count;

  return next;
end;
$$;

-- The storage objects are removed by the protected maintenance endpoint before
-- this function runs. It removes reservation rows first because wishes keep a
-- restrictive foreign key to their reservation history.
create or replace function public.purge_due_wishlists_v1(p_wishlist_ids uuid[])
returns table (wishlist_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wishlist_id uuid;
begin
  if p_wishlist_ids is null or cardinality(p_wishlist_ids) > 100 then
    raise exception 'invalid_wishlist_deletion_batch' using errcode = '22023';
  end if;

  for v_wishlist_id in
    select list.id
    from public.wishlists as list
    where list.id = any(p_wishlist_ids)
      and list.archived_at is not null
      and list.delete_after <= pg_catalog.now()
    for update
  loop
    delete from public.reservation_idempotency as request
    using public.wishes as wish
    where request.wish_id = wish.id
      and wish.wishlist_id = v_wishlist_id;

    delete from public.reservations as reservation
    using public.wishes as wish
    where reservation.wish_id = wish.id
      and wish.wishlist_id = v_wishlist_id;

    delete from public.wishlists as list where list.id = v_wishlist_id;
    wishlist_id := v_wishlist_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.schedule_wishlist_deletion_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.purge_expired_operational_data_v1(integer) from public, anon, authenticated, service_role;
revoke all on function public.purge_due_wishlists_v1(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.schedule_wishlist_deletion_v1(uuid) to authenticated;
grant execute on function public.purge_expired_operational_data_v1(integer) to service_role;
grant execute on function public.purge_due_wishlists_v1(uuid[]) to service_role;
