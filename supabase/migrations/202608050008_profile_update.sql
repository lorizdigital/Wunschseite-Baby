-- Phase 3: profile edits remain self-scoped and never grant access to other
-- profiles. Browser roles still have no direct table mutation privileges.

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

  update public.profiles as profile
  set display_name = v_display_name,
      updated_at = pg_catalog.now()
  where profile.user_id = v_actor_user_id
    and profile.deleted_at is null
  returning profile.display_name, profile.updated_at into display_name, updated_at;

  if not found then
    raise exception 'profile_not_available' using errcode = 'P0002';
  end if;
  return next;
end;
$$;

revoke all on function public.update_my_profile_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.update_my_profile_v1(text) to authenticated;
