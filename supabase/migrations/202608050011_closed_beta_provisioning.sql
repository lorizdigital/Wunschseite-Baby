-- Closed-beta provisioning is intentionally separate from self-service list
-- creation. It runs only through a server endpoint with its own secret.

create or replace function public.provision_wishlist_v1(
  p_user_id uuid,
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
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_intro text := pg_catalog.btrim(coalesce(p_intro, ''));
  v_display_name text := nullif(pg_catalog.btrim(coalesce(p_display_name, '')), '');
  v_profile_deleted_at timestamptz;
  v_wishlist_id uuid;
  v_public_slug text;
  v_attempt integer;
begin
  if p_user_id is null
     or pg_catalog.char_length(v_title) not between 1 and 180
     or pg_catalog.char_length(v_intro) > 2000
     or v_display_name is null
     or pg_catalog.char_length(v_display_name) not between 1 and 80 then
    raise exception 'invalid_wishlist_data' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, display_name)
  values (p_user_id, v_display_name)
  on conflict (user_id) do nothing;

  select profile.deleted_at
    into v_profile_deleted_at
  from public.profiles as profile
  where profile.user_id = p_user_id
  for key share;
  if not found or v_profile_deleted_at is not null then
    raise exception 'profile_inactive' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );
  if (
    select count(*)
    from public.wishlist_members as member
    join public.wishlists as list on list.id = member.wishlist_id
    where member.user_id = p_user_id
      and list.archived_at is null
  ) >= 3 then
    raise exception 'active_wishlist_limit_reached' using errcode = '22023';
  end if;

  for v_attempt in 1..5 loop
    v_public_slug := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
    insert into public.wishlists (title, intro, owner_user_id, public_slug, visibility)
    values (v_title, v_intro, p_user_id, v_public_slug, 'unlisted')
    on conflict (public_slug) where (public_slug is not null) do nothing
    returning id into v_wishlist_id;
    exit when v_wishlist_id is not null;
  end loop;

  if v_wishlist_id is null then
    raise exception 'public_slug_generation_failed' using errcode = 'P0001';
  end if;

  insert into public.wishlist_members (wishlist_id, user_id, role, created_by)
  values (v_wishlist_id, p_user_id, 'owner', null);

  return query
  select v_wishlist_id, v_public_slug, v_title, v_intro, 'owner'::text, null::timestamptz, null::timestamptz;
end;
$$;

revoke all on function public.provision_wishlist_v1(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.provision_wishlist_v1(uuid, text, text, text) to service_role;
