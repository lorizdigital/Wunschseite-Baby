-- Storage cannot participate in the database transaction that deletes a list.
-- Keep a durable, service-only queue so a failed storage request leaves an
-- orphan that can be retried, never a still-visible list without its images.

create table if not exists public.storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket = 'product-images'),
  object_path text not null check (length(object_path) between 1 and 1024),
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  unique (bucket, object_path)
);

create index if not exists storage_deletion_queue_pending_idx
  on public.storage_deletion_queue (created_at)
  where completed_at is null;

alter table public.storage_deletion_queue enable row level security;
revoke all on table public.storage_deletion_queue from public, anon, authenticated;

create or replace function public.purge_due_wishlists_v2(p_wishlist_ids uuid[])
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
    insert into public.storage_deletion_queue (bucket, object_path)
    select 'product-images', wish.image_storage_path
    from public.wishes as wish
    where wish.wishlist_id = v_wishlist_id
      and wish.image_storage_path is not null
    on conflict (bucket, object_path) do nothing;

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

revoke all on function public.purge_due_wishlists_v2(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.purge_due_wishlists_v2(uuid[]) to service_role;
