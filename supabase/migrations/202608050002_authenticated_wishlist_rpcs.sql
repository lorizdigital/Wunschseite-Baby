-- Phase 2: authenticated, least-privilege wishlist access.
-- This migration does not read or mutate Mats' data and retains all legacy APIs.

create extension if not exists pgcrypto;

-- Browser table mutations are intentionally not an API. Profile and list writes
-- become available only through explicitly checked RPCs below.
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

revoke insert, update, delete, truncate
  on table public.profiles
  from public, anon, authenticated;

revoke insert, update, delete, truncate
  on table public.wishlists, public.wishes, public.reservations,
           public.wishlist_members, public.wishlist_invitations
  from public, anon, authenticated;

create or replace function public.require_wishlist_role_v1(
  p_wishlist_id uuid,
  p_allowed_roles text[]
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_role text;
begin
  if v_actor_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_wishlist_id is null or coalesce(array_length(p_allowed_roles, 1), 0) = 0 then
    raise exception 'invalid_authorization_context' using errcode = '22023';
  end if;

  select member.role
    into v_role
  from public.wishlist_members as member
  where member.wishlist_id = p_wishlist_id
    and member.user_id = v_actor_user_id;

  if v_role is null or not (v_role = any (p_allowed_roles)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

revoke all on function public.require_wishlist_role_v1(uuid, text[])
  from public, anon, authenticated, service_role;

-- The final owner cannot be deleted, demoted, or moved, including through
-- concurrent requests. Cascading deletion after a wishlist was removed remains
-- possible because the parent record no longer exists at that point.
create or replace function public.prevent_last_wishlist_owner_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_exists boolean;
  v_owner_count integer;
begin
  if tg_op = 'UPDATE'
     and old.role = 'owner'
     and new.role = 'owner'
     and new.wishlist_id = old.wishlist_id then
    return new;
  end if;

  if old.role <> 'owner' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select exists (
    select 1 from public.wishlists as list where list.id = old.wishlist_id
  ) into v_parent_exists;

  if not v_parent_exists then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform 1
  from public.wishlists as list
  where list.id = old.wishlist_id
  for update;

  select count(*)
    into v_owner_count
  from public.wishlist_members as member
  where member.wishlist_id = old.wishlist_id
    and member.role = 'owner';

  if v_owner_count <= 1 then
    raise exception 'last_wishlist_owner_required' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.prevent_last_wishlist_owner_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists wishlist_members_prevent_last_owner_v1 on public.wishlist_members;
create trigger wishlist_members_prevent_last_owner_v1
  before delete or update of role, wishlist_id
  on public.wishlist_members
  for each row execute function public.prevent_last_wishlist_owner_v1();

-- Atomically creates a profile where needed, an unpublished list with a 128-bit
-- share slug, and exactly one owner membership for the authenticated caller.
create or replace function public.create_wishlist_v1(
  p_title text,
  p_intro text default '',
  p_display_name text default null
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
  v_actor_user_id uuid := auth.uid();
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_intro text := pg_catalog.btrim(coalesce(p_intro, ''));
  v_display_name text := nullif(pg_catalog.btrim(coalesce(p_display_name, '')), '');
  v_profile_deleted_at timestamptz;
  v_profile_exists boolean;
  v_wishlist_id uuid;
  v_public_slug text;
  v_attempt integer;
begin
  if v_actor_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if pg_catalog.char_length(v_title) not between 1 and 180
     or pg_catalog.char_length(v_intro) > 2000
     or (v_display_name is not null and pg_catalog.char_length(v_display_name) not between 1 and 80) then
    raise exception 'invalid_wishlist_data' using errcode = '22023';
  end if;

  select profile.deleted_at
    into v_profile_deleted_at
  from public.profiles as profile
  where profile.user_id = v_actor_user_id
  for key share;
  v_profile_exists := found;

  if not v_profile_exists then
    if v_display_name is null then
      raise exception 'display_name_required' using errcode = '22023';
    end if;

    insert into public.profiles (user_id, display_name)
    values (v_actor_user_id, v_display_name)
    on conflict (user_id) do nothing;

    select profile.deleted_at
      into v_profile_deleted_at
    from public.profiles as profile
    where profile.user_id = v_actor_user_id
    for key share;

    if not found then
      raise exception 'profile_creation_failed' using errcode = 'P0001';
    end if;
  end if;

  if v_profile_deleted_at is not null then
    raise exception 'profile_inactive' using errcode = '42501';
  end if;

  -- Serialize per user so that the maximum of three active lists cannot be
  -- exceeded by parallel requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_user_id::text, 0)
  );
  if (
    select count(*)
    from public.wishlist_members as member
    join public.wishlists as list on list.id = member.wishlist_id
    where member.user_id = v_actor_user_id
      and list.archived_at is null
  ) >= 3 then
    raise exception 'active_wishlist_limit_reached' using errcode = '22023';
  end if;

  for v_attempt in 1..5 loop
    v_public_slug := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');

    insert into public.wishlists (
      title,
      intro,
      owner_user_id,
      public_slug,
      visibility
    )
    values (
      v_title,
      v_intro,
      v_actor_user_id,
      v_public_slug,
      'unlisted'
    )
    on conflict (public_slug) where (public_slug is not null) do nothing
    returning id into v_wishlist_id;

    exit when v_wishlist_id is not null;
  end loop;

  if v_wishlist_id is null then
    raise exception 'public_slug_generation_failed' using errcode = 'P0001';
  end if;

  insert into public.wishlist_members (wishlist_id, user_id, role, created_by)
  values (v_wishlist_id, v_actor_user_id, 'owner', v_actor_user_id);

  return query
  select v_wishlist_id, v_public_slug, v_title, v_intro,
         'owner'::text, null::timestamptz, null::timestamptz;
end;
$$;

revoke all on function public.create_wishlist_v1(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_wishlist_v1(text, text, text) to authenticated;

-- The only administration list read model. It excludes owner IDs, invitation
-- hashes, reservation details, and every list not owned/shared with the caller.
create or replace function public.get_my_wishlist_context_v1()
returns table (
  wishlist_id uuid,
  title text,
  intro text,
  public_slug text,
  published_at timestamptz,
  archived_at timestamptz,
  member_role text,
  membership_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  if v_actor_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.user_id = v_actor_user_id
      and profile.deleted_at is null
  ) then
    raise exception 'profile_inactive' using errcode = '42501';
  end if;

  return query
  select
    list.id,
    list.title,
    list.intro,
    list.public_slug,
    list.published_at,
    list.archived_at,
    member.role,
    member.created_at
  from public.wishlist_members as member
  join public.wishlists as list on list.id = member.wishlist_id
  where member.user_id = v_actor_user_id
  order by member.created_at desc, list.id;
end;
$$;

revoke all on function public.get_my_wishlist_context_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_wishlist_context_v1() to authenticated;
