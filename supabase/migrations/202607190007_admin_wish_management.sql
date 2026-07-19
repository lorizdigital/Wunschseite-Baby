insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.reorder_wishes(
  p_wishlist_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer;
  v_unique_count integer;
begin
  select count(*) into v_active_count
  from public.wishes
  where wishlist_id = p_wishlist_id
    and archived_at is null;

  select count(distinct item.id) into v_unique_count
  from unnest(p_ordered_ids) as item(id);

  if cardinality(p_ordered_ids) <> v_active_count
    or v_unique_count <> v_active_count
    or exists (
      select 1
      from unnest(p_ordered_ids) as item(id)
      where not exists (
        select 1 from public.wishes
        where id = item.id
          and wishlist_id = p_wishlist_id
          and archived_at is null
      )
    ) then
    raise exception 'invalid_wish_order' using errcode = '22023';
  end if;

  update public.wishes as w
  set sort_order = ordered.position * 10,
      updated_at = now()
  from unnest(p_ordered_ids) with ordinality as ordered(id, position)
  where w.id = ordered.id
    and w.wishlist_id = p_wishlist_id
    and w.archived_at is null;
end;
$$;

revoke all on function public.reorder_wishes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_wishes(uuid, uuid[]) to service_role;
