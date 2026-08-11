-- Auth accounts may exist before their first profile/list is created. Treat
-- that as an onboarding state, while deleted profiles remain blocked.

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

  if exists (
    select 1
    from public.profiles as profile
    where profile.user_id = v_actor_user_id
      and profile.deleted_at is not null
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

create or replace function public.update_my_profile_v1(p_display_name text)
returns table (display_name text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_display_name text := pg_catalog.btrim(coalesce(p_display_name, ''));
begin
  if v_actor_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if pg_catalog.char_length(v_display_name) not between 1 and 80 then
    raise exception 'invalid_profile_data' using errcode = '22023';
  end if;

  insert into public.profiles as profile (user_id, display_name)
  values (v_actor_user_id, v_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = pg_catalog.now()
    where profile.deleted_at is null
  returning profile.display_name, profile.updated_at into display_name, updated_at;

  if not found then
    raise exception 'profile_not_available' using errcode = 'P0002';
  end if;
  return next;
end;
$$;

revoke all on function public.update_my_profile_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.update_my_profile_v1(text) to authenticated;
