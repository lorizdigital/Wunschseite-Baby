-- Published lists require a separate access code. The code itself is stored
-- only as a bcrypt hash; parent accounts can see whether one is configured,
-- never the hash or the original value.

alter table public.wishlists
  add column if not exists access_code_hash text,
  add column if not exists access_code_version uuid;

alter table public.wishlists
  drop constraint if exists wishlists_access_code_pair_check,
  add constraint wishlists_access_code_pair_check
    check (
      (access_code_hash is null and access_code_version is null)
      or (access_code_hash is not null and access_code_version is not null)
    );

-- Existing authenticated members still need list metadata, but a table-wide
-- SELECT grant would also expose the bcrypt hash to every member.
revoke select on public.wishlists from authenticated;
grant select (
  id,
  title,
  intro,
  owner_user_id,
  published_at,
  archived_at,
  created_at,
  updated_at,
  public_slug,
  visibility,
  delete_after,
  access_code_version
) on public.wishlists to authenticated;

create or replace function public.set_wishlist_access_code_v1(
  p_wishlist_id uuid,
  p_access_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_code text := pg_catalog.btrim(coalesce(p_access_code, ''));
  v_version uuid;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  if pg_catalog.char_length(v_access_code) not between 8 and 64 then
    raise exception 'invalid_access_code' using errcode = '22023';
  end if;

  update public.wishlists as list
  set access_code_hash = extensions.crypt(v_access_code, extensions.gen_salt('bf', 10)),
      access_code_version = extensions.gen_random_uuid(),
      visibility = 'access_code',
      updated_at = pg_catalog.now()
  where list.id = p_wishlist_id
    and list.archived_at is null
  returning list.access_code_version into v_version;

  if not found then
    if exists (select 1 from public.wishlists as list where list.id = p_wishlist_id) then
      raise exception 'wishlist_archived' using errcode = '22023';
    end if;
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  return v_version;
end;
$$;

-- This verifier is callable only with the server-side Supabase key. Rate
-- limiting and the access-session cookie are implemented by the application.
create or replace function public.verify_public_wishlist_access_code_v1(
  p_public_slug text,
  p_access_code text
)
returns table (access_code_version uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_code text := pg_catalog.btrim(coalesce(p_access_code, ''));
begin
  if p_public_slug is null
     or p_public_slug !~ '^[A-Za-z0-9_-]{22,128}$'
     or pg_catalog.char_length(v_access_code) not between 8 and 64 then
    return;
  end if;

  return query
  select list.access_code_version
  from public.wishlists as list
  where list.public_slug = p_public_slug
    and list.visibility = 'access_code'
    and list.access_code_hash is not null
    and list.access_code_version is not null
    and list.published_at is not null
    and list.archived_at is null
    and list.access_code_hash = extensions.crypt(v_access_code, list.access_code_hash);
end;
$$;

-- A valid, signed browser grant is compared to this version on every public
-- page/API request. Changing the code therefore invalidates old grants.
create or replace function public.get_public_wishlist_access_version_v1(
  p_public_slug text
)
returns table (access_code_version uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_public_slug is null
     or p_public_slug !~ '^[A-Za-z0-9_-]{22,128}$' then
    return;
  end if;

  return query
  select list.access_code_version
  from public.wishlists as list
  where list.public_slug = p_public_slug
    and list.visibility = 'access_code'
    and list.access_code_hash is not null
    and list.access_code_version is not null
    and list.published_at is not null
    and list.archived_at is null;
end;
$$;

-- A list cannot accidentally be published with only the unlisted URL. Owners
-- must set an access code first.
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

  update public.wishlists as list
  set published_at = coalesce(list.published_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where list.id = p_wishlist_id
    and list.archived_at is null
  returning list.published_at into v_published_at;

  return v_published_at;
end;
$$;

-- Public-read functions remain service-role-only. They now serve the app after
-- its access-code gate has been checked for code-protected lists.
create or replace function public.get_public_wishlist_context_v1(
  p_public_slug text
)
returns table (
  wishlist_id uuid,
  public_slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_public_slug is null
     or p_public_slug !~ '^[A-Za-z0-9_-]{22,128}$' then
    return;
  end if;

  return query
  select list.id, list.public_slug
  from public.wishlists as list
  where list.public_slug = p_public_slug
    and list.visibility in ('unlisted', 'access_code')
    and list.published_at is not null
    and list.archived_at is null;
end;
$$;

create or replace function public.get_public_wishlist_page_v1(
  p_public_slug text
)
returns table (
  wishlist_id uuid,
  public_slug text,
  title text,
  intro text,
  wishes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_public_slug is null
     or p_public_slug !~ '^[A-Za-z0-9_-]{22,128}$' then
    return;
  end if;

  return query
  select
    list.id,
    list.public_slug,
    list.title,
    coalesce(list.intro, ''),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', wish.id,
          'title', wish.title,
          'description', wish.description,
          'product_url', wish.product_url,
          'image_url', wish.image_url,
          'price_amount', wish.price_amount,
          'currency', wish.currency,
          'shop_name', wish.shop_name
        )
        order by wish.sort_order, wish.id
      ) filter (where wish.id is not null),
      '[]'::jsonb
    )
  from public.wishlists as list
  left join public.wishes as wish
    on wish.wishlist_id = list.id
   and wish.archived_at is null
  where list.public_slug = p_public_slug
    and list.visibility in ('unlisted', 'access_code')
    and list.published_at is not null
    and list.archived_at is null
  group by list.id, list.public_slug, list.title, list.intro;
end;
$$;

create or replace function public.get_published_wishlist_page_v1(
  p_wishlist_id uuid
)
returns table (
  wishlist_id uuid,
  public_slug text,
  title text,
  intro text,
  wishes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.get_public_wishlist_page_v1(
    (
      select list.public_slug
      from public.wishlists as list
      where list.id = p_wishlist_id
        and list.visibility in ('unlisted', 'access_code')
        and list.published_at is not null
        and list.archived_at is null
    )
  );
$$;

create or replace function public.get_public_reservation_status_v1(
  p_wishlist_id uuid
)
returns table (wish_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select reservation.wish_id
  from public.reservations as reservation
  join public.wishes as wish
    on wish.id = reservation.wish_id
  join public.wishlists as list
    on list.id = wish.wishlist_id
  where list.id = p_wishlist_id
    and list.visibility in ('unlisted', 'access_code')
    and list.published_at is not null
    and list.archived_at is null
    and wish.archived_at is null
    and reservation.cancelled_at is null;
$$;

revoke all on function public.set_wishlist_access_code_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.verify_public_wishlist_access_code_v1(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_wishlist_access_version_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_wishlist_context_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_wishlist_page_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_published_wishlist_page_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_reservation_status_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.publish_wishlist_v1(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.set_wishlist_access_code_v1(uuid, text) to authenticated;
grant execute on function public.publish_wishlist_v1(uuid) to authenticated;
grant execute on function public.verify_public_wishlist_access_code_v1(text, text) to service_role;
grant execute on function public.get_public_wishlist_access_version_v1(text) to service_role;
grant execute on function public.get_public_wishlist_context_v1(text) to service_role;
grant execute on function public.get_public_wishlist_page_v1(text) to service_role;
grant execute on function public.get_published_wishlist_page_v1(uuid) to service_role;
grant execute on function public.get_public_reservation_status_v1(uuid) to service_role;
