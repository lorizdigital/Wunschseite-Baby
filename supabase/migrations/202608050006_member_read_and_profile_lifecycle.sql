-- Phase 6: owner-visible member names and a reversible, privacy-preserving
-- deletion request. Irreversible Auth deletion remains an explicit scheduled
-- server operation after the retention window.

alter table public.profiles
  add column if not exists delete_after timestamptz;

alter table public.profiles
  drop constraint if exists profiles_delete_after_check,
  add constraint profiles_delete_after_check
    check (delete_after is null or (deleted_at is not null and delete_after > deleted_at));

-- Owner-only member read model. It does not expose email addresses, invitation
-- hashes, reservations, or members from any other list.
create or replace function public.get_wishlist_members_v1(p_wishlist_id uuid)
returns table (
  user_id uuid,
  display_name text,
  member_role text,
  membership_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  return query
  select
    member.user_id,
    profile.display_name,
    member.role,
    member.created_at
  from public.wishlist_members as member
  join public.profiles as profile on profile.user_id = member.user_id
  where member.wishlist_id = p_wishlist_id
    and profile.deleted_at is null
  order by case member.role when 'owner' then 0 when 'editor' then 1 else 2 end,
           member.created_at,
           member.user_id;
end;
$$;

-- A user can request deletion only after they have transferred ownership for
-- every list for which they are the final owner. Lists that retain a second
-- owner continue, while the departing account loses every membership.
create or replace function public.request_profile_deletion_v1()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_delete_after timestamptz := pg_catalog.now() + pg_catalog.make_interval(days => 30);
begin
  if v_actor_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform 1
  from public.profiles as profile
  where profile.user_id = v_actor_user_id
    and profile.deleted_at is null
  for update;
  if not found then
    raise exception 'profile_not_available' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.wishlist_members as member
    join public.wishlists as list on list.id = member.wishlist_id
    where member.user_id = v_actor_user_id
      and member.role = 'owner'
      and not exists (
        select 1
        from public.wishlist_members as other_owner
        where other_owner.wishlist_id = member.wishlist_id
          and other_owner.role = 'owner'
          and other_owner.user_id <> v_actor_user_id
      )
  ) then
    raise exception 'active_last_wishlist_owner' using errcode = '23514';
  end if;

  -- Keep legacy owner_user_id coherent where another owner remains.
  update public.wishlists as list
  set owner_user_id = (
        select other_owner.user_id
        from public.wishlist_members as other_owner
        where other_owner.wishlist_id = list.id
          and other_owner.role = 'owner'
          and other_owner.user_id <> v_actor_user_id
        order by other_owner.created_at, other_owner.user_id
        limit 1
      ),
      updated_at = pg_catalog.now()
  where list.owner_user_id = v_actor_user_id
    and exists (
      select 1
      from public.wishlist_members as other_owner
      where other_owner.wishlist_id = list.id
        and other_owner.role = 'owner'
        and other_owner.user_id <> v_actor_user_id
    );

  delete from public.wishlist_members as member
  where member.user_id = v_actor_user_id;

  update public.profiles as profile
  set deleted_at = pg_catalog.now(),
      delete_after = v_delete_after,
      updated_at = pg_catalog.now()
  where profile.user_id = v_actor_user_id;

  return v_delete_after;
end;
$$;

revoke all on function public.get_wishlist_members_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_profile_deletion_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_wishlist_members_v1(uuid) to authenticated;
grant execute on function public.request_profile_deletion_v1() to authenticated;
