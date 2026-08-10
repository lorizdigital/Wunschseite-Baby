-- Every self-service wishlist created by the application starts protected.
-- The legacy v1 creator remains available during the rolling deployment and
-- as an internal building block; publication still rejects unprotected lists.

create or replace function public.create_wishlist_v2(
  p_title text,
  p_intro text,
  p_display_name text,
  p_access_code text
)
returns table (
  wishlist_id uuid,
  public_slug text,
  title text,
  intro text,
  member_role text,
  published_at timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_code text := pg_catalog.btrim(coalesce(p_access_code, ''));
  v_created record;
begin
  if pg_catalog.char_length(v_access_code) not between 8 and 64 then
    raise exception 'invalid_access_code' using errcode = '22023';
  end if;

  select created.*
    into v_created
  from public.create_wishlist_v1(p_title, p_intro, p_display_name) as created;

  if not found or v_created.wishlist_id is null then
    raise exception 'wishlist_creation_failed' using errcode = 'P0001';
  end if;

  perform public.set_wishlist_access_code_v1(v_created.wishlist_id, v_access_code);

  return query
  select
    v_created.wishlist_id::uuid,
    v_created.public_slug::text,
    v_created.title::text,
    v_created.intro::text,
    v_created.member_role::text,
    v_created.published_at::timestamptz,
    v_created.archived_at::timestamptz;
end;
$$;

revoke all on function public.create_wishlist_v2(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_wishlist_v2(text, text, text, text)
  to authenticated;

-- Keep the UI and database publication rules identical: a protected but empty
-- list is still a draft and cannot be shared yet.
create or replace function public.publish_wishlist_v1(p_wishlist_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published_at timestamptz;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  if not exists (
    select 1
    from public.wishlists as list
    where list.id = p_wishlist_id
      and list.archived_at is null
      and list.visibility = 'access_code'
      and list.access_code_hash is not null
      and list.access_code_version is not null
  ) then
    if exists (select 1 from public.wishlists as list where list.id = p_wishlist_id) then
      raise exception 'access_code_required' using errcode = '22023';
    end if;
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.wishes as wish
    where wish.wishlist_id = p_wishlist_id
      and wish.archived_at is null
  ) then
    raise exception 'wishlist_empty' using errcode = '22023';
  end if;

  update public.wishlists as list
  set published_at = coalesce(list.published_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where list.id = p_wishlist_id
    and list.archived_at is null
  returning list.published_at into v_published_at;

  return v_published_at;
end;
$$;

revoke all on function public.publish_wishlist_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_wishlist_v1(uuid) to authenticated;
