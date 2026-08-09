-- Phase 3: authenticated administration for the multi-wishlist platform.
-- This is deliberately additive: legacy Mats administration, existing wishes,
-- reservations, image URLs, and the two preceding migrations remain untouched.

create extension if not exists pgcrypto;

-- Only owners may change public list copy. Editors can manage wishes but do not
-- control the public identity or lifecycle of a family list.
create or replace function public.update_wishlist_details_v1(
  p_wishlist_id uuid,
  p_title text,
  p_intro text
)
returns table (
  wishlist_id uuid,
  title text,
  intro text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_intro text := pg_catalog.btrim(coalesce(p_intro, ''));
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  if pg_catalog.char_length(v_title) not between 1 and 180
     or pg_catalog.char_length(v_intro) > 2000 then
    raise exception 'invalid_wishlist_data' using errcode = '22023';
  end if;

  update public.wishlists as list
  set title = v_title,
      intro = v_intro,
      updated_at = pg_catalog.now()
  where list.id = p_wishlist_id
  returning list.id, list.title, list.intro, list.updated_at
    into wishlist_id, title, intro, updated_at;

  if not found then
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  return next;
end;
$$;

-- Publishing never silently restores an archived list; restoring/deletion is a
-- separate lifecycle decision that is intentionally not exposed by this RPC.
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

  update public.wishlists as list
  set published_at = coalesce(list.published_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where list.id = p_wishlist_id
    and list.archived_at is null
  returning list.published_at into v_published_at;

  if not found then
    if exists (select 1 from public.wishlists as list where list.id = p_wishlist_id) then
      raise exception 'wishlist_archived' using errcode = '22023';
    end if;
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  return v_published_at;
end;
$$;

-- Archiving is soft deletion. The public route and reservation RPCs already
-- fail closed for archived lists, so this immediately takes the list offline.
create or replace function public.archive_wishlist_v1(p_wishlist_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  update public.wishlists as list
  set archived_at = coalesce(list.archived_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where list.id = p_wishlist_id
  returning list.archived_at into v_archived_at;

  if not found then
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  return v_archived_at;
end;
$$;

-- The share slug is random, URL-safe, and at least 128 bits. The unique index
-- is the final collision guard; retries leave the old slug intact on failure.
create or replace function public.rotate_wishlist_public_slug_v1(p_wishlist_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_public_slug text;
  v_attempt integer;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  perform 1
  from public.wishlists as list
  where list.id = p_wishlist_id
    and list.archived_at is null
  for update;
  if not found then
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  for v_attempt in 1..5 loop
    v_public_slug := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
    begin
      update public.wishlists as list
      set public_slug = v_public_slug,
          updated_at = pg_catalog.now()
      where list.id = p_wishlist_id;
      return v_public_slug;
    exception when unique_violation then
      -- Retry with a new 128-bit value; the row lock keeps this rotation atomic.
    end;
  end loop;

  raise exception 'public_slug_generation_failed' using errcode = 'P0001';
end;
$$;

-- Normalisation lives in the RPC so direct table access cannot bypass the
-- same validation that the application uses for manually created wishes.
create or replace function public.create_wish_v1(
  p_wishlist_id uuid,
  p_title text,
  p_description text default null,
  p_product_url text default null,
  p_image_url text default null,
  p_image_storage_path text default null,
  p_price_amount numeric default null,
  p_currency text default null,
  p_shop_name text default null
)
returns table (
  wish_id uuid,
  sort_order integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_description text := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');
  v_product_url text := nullif(pg_catalog.btrim(coalesce(p_product_url, '')), '');
  v_image_url text := nullif(pg_catalog.btrim(coalesce(p_image_url, '')), '');
  v_image_storage_path text := nullif(pg_catalog.btrim(coalesce(p_image_storage_path, '')), '');
  v_currency text := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency, ''))), '');
  v_shop_name text := nullif(pg_catalog.btrim(coalesce(p_shop_name, '')), '');
  v_sort_order integer;
  v_active_count integer;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner', 'editor']);

  if pg_catalog.char_length(v_title) not between 1 and 180
     or (v_description is not null and pg_catalog.char_length(v_description) > 600)
     or (v_product_url is not null and (pg_catalog.char_length(v_product_url) > 2048 or v_product_url !~ '^https?://'))
     or (v_image_url is not null and (pg_catalog.char_length(v_image_url) > 2048 or v_image_url !~ '^(https?://|/products/)'))
     or (v_image_storage_path is not null and v_image_storage_path !~ ('^' || p_wishlist_id::text || '/'))
     or (p_price_amount is not null and (p_price_amount < 0 or p_price_amount > 999999))
     or (v_currency is not null and v_currency !~ '^[A-Z]{3}$')
     or (v_shop_name is not null and pg_catalog.char_length(v_shop_name) > 100) then
    raise exception 'invalid_wish_data' using errcode = '22023';
  end if;

  -- Lock the parent so concurrent creates and unarchives cannot reuse order
  -- values or make a later reorder ambiguous.
  perform 1
  from public.wishlists as list
  where list.id = p_wishlist_id
    and list.archived_at is null
  for update;
  if not found then
    raise exception 'wishlist_not_available' using errcode = 'P0002';
  end if;

  select count(*) into v_active_count
  from public.wishes as wish
  where wish.wishlist_id = p_wishlist_id
    and wish.archived_at is null;
  if v_active_count >= 200 then
    raise exception 'active_wish_limit_reached' using errcode = '22023';
  end if;

  select coalesce(max(wish.sort_order), 0) + 10
    into v_sort_order
  from public.wishes as wish
  where wish.wishlist_id = p_wishlist_id
    and wish.archived_at is null;

  insert into public.wishes as wish (
    wishlist_id, title, description, product_url, image_url, image_storage_path,
    price_amount, currency, shop_name, sort_order
  )
  values (
    p_wishlist_id, v_title, v_description, v_product_url, v_image_url, v_image_storage_path,
    p_price_amount, v_currency, v_shop_name, v_sort_order
  )
  returning wish.id, wish.sort_order, wish.created_at
    into wish_id, sort_order, created_at;

  return next;
end;
$$;

-- Updating a wish replaces its editable presentation fields but never changes
-- its list, source metadata, reservation history, or current sort position.
create or replace function public.update_wish_v1(
  p_wishlist_id uuid,
  p_wish_id uuid,
  p_title text,
  p_description text default null,
  p_product_url text default null,
  p_image_url text default null,
  p_image_storage_path text default null,
  p_price_amount numeric default null,
  p_currency text default null,
  p_shop_name text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_description text := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');
  v_product_url text := nullif(pg_catalog.btrim(coalesce(p_product_url, '')), '');
  v_image_url text := nullif(pg_catalog.btrim(coalesce(p_image_url, '')), '');
  v_image_storage_path text := nullif(pg_catalog.btrim(coalesce(p_image_storage_path, '')), '');
  v_currency text := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency, ''))), '');
  v_shop_name text := nullif(pg_catalog.btrim(coalesce(p_shop_name, '')), '');
  v_updated_at timestamptz;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner', 'editor']);

  perform 1
  from public.wishlists as list
  where list.id = p_wishlist_id
    and list.archived_at is null
  for update;
  if not found then
    raise exception 'wishlist_not_available' using errcode = 'P0002';
  end if;

  if pg_catalog.char_length(v_title) not between 1 and 180
     or (v_description is not null and pg_catalog.char_length(v_description) > 600)
     or (v_product_url is not null and (pg_catalog.char_length(v_product_url) > 2048 or v_product_url !~ '^https?://'))
     or (v_image_url is not null and (pg_catalog.char_length(v_image_url) > 2048 or v_image_url !~ '^(https?://|/products/)'))
     or (v_image_storage_path is not null and v_image_storage_path !~ ('^' || p_wishlist_id::text || '/'))
     or (p_price_amount is not null and (p_price_amount < 0 or p_price_amount > 999999))
     or (v_currency is not null and v_currency !~ '^[A-Z]{3}$')
     or (v_shop_name is not null and pg_catalog.char_length(v_shop_name) > 100) then
    raise exception 'invalid_wish_data' using errcode = '22023';
  end if;

  update public.wishes as wish
  set title = v_title,
      description = v_description,
      product_url = v_product_url,
      image_url = v_image_url,
      image_storage_path = v_image_storage_path,
      price_amount = p_price_amount,
      currency = v_currency,
      shop_name = v_shop_name,
      updated_at = pg_catalog.now()
  where wish.id = p_wish_id
    and wish.wishlist_id = p_wishlist_id
  returning wish.updated_at into v_updated_at;

  if not found then
    raise exception 'wish_not_found' using errcode = 'P0002';
  end if;

  return v_updated_at;
end;
$$;

-- Reserved wishes remain immutable with respect to archiving, preserving the
-- guest's reservation rather than making it disappear from the public list.
create or replace function public.set_wish_archived_v1(
  p_wishlist_id uuid,
  p_wish_id uuid,
  p_archived boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
  v_sort_order integer;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner', 'editor']);

  perform 1
  from public.wishlists as list
  where list.id = p_wishlist_id
    and list.archived_at is null
  for update;
  if not found then
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  if p_archived and exists (
    select 1
    from public.reservations as reservation
    where reservation.wish_id = p_wish_id
      and reservation.cancelled_at is null
  ) then
    raise exception 'wish_has_open_reservation' using errcode = '23514';
  end if;

  if not p_archived then
    select coalesce(max(wish.sort_order), 0) + 10
      into v_sort_order
    from public.wishes as wish
    where wish.wishlist_id = p_wishlist_id
      and wish.archived_at is null;
  end if;

  update public.wishes as wish
  set archived_at = case when p_archived then coalesce(wish.archived_at, pg_catalog.now()) else null end,
      sort_order = case when p_archived then wish.sort_order else v_sort_order end,
      updated_at = pg_catalog.now()
  where wish.id = p_wish_id
    and wish.wishlist_id = p_wishlist_id
  returning wish.archived_at into v_archived_at;

  if not found then
    raise exception 'wish_not_found' using errcode = 'P0002';
  end if;

  return v_archived_at;
end;
$$;

-- The submitted IDs must be the complete active set for this one list. This
-- prevents cross-list IDs, duplicate IDs, and accidentally dropping wishes.
create or replace function public.reorder_wishes_v1(
  p_wishlist_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_count integer;
  v_unique_count integer;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner', 'editor']);

  perform 1
  from public.wishlists as list
  where list.id = p_wishlist_id
    and list.archived_at is null
  for update;
  if not found then
    raise exception 'wishlist_not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_active_count
  from public.wishes as wish
  where wish.wishlist_id = p_wishlist_id
    and wish.archived_at is null;

  if p_ordered_ids is null then
    raise exception 'invalid_wish_order' using errcode = '22023';
  end if;

  select count(distinct item.id) into v_unique_count
  from unnest(p_ordered_ids) as item(id);

  if cardinality(p_ordered_ids) <> v_active_count
     or v_unique_count <> v_active_count
     or exists (
       select 1
       from unnest(p_ordered_ids) as item(id)
       where not exists (
         select 1
         from public.wishes as wish
         where wish.id = item.id
           and wish.wishlist_id = p_wishlist_id
           and wish.archived_at is null
       )
     ) then
    raise exception 'invalid_wish_order' using errcode = '22023';
  end if;

  update public.wishes as wish
  set sort_order = ordered.position * 10,
      updated_at = pg_catalog.now()
  from unnest(p_ordered_ids) with ordinality as ordered(id, position)
  where wish.id = ordered.id
    and wish.wishlist_id = p_wishlist_id
    and wish.archived_at is null;
end;
$$;

-- Tokens are supplied only as a SHA-256 hash. The application generates and
-- delivers the raw token; no invitation secret is persisted in this database.
create or replace function public.create_wishlist_invitation_v1(
  p_wishlist_id uuid,
  p_email text,
  p_role text,
  p_token_hash bytea,
  p_expires_at timestamptz
)
returns table (
  invitation_id uuid,
  email_normalized text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_email_normalized text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  v_role text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, '')));
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  if (v_email_normalized is not null and (
        pg_catalog.char_length(v_email_normalized) not between 3 and 320
        or v_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ))
     or v_role not in ('owner', 'editor', 'viewer')
     or p_token_hash is null
     or octet_length(p_token_hash) <> 32
     or p_expires_at is null
     or p_expires_at <= pg_catalog.now() then
    raise exception 'invalid_invitation_data' using errcode = '22023';
  end if;

  insert into public.wishlist_invitations as invitation (
    wishlist_id, email_normalized, role, token_hash, invited_by, expires_at
  )
  values (
    p_wishlist_id, v_email_normalized, v_role, p_token_hash, v_actor_user_id, p_expires_at
  )
  returning invitation.id, invitation.email_normalized, invitation.role, invitation.expires_at
    into invitation_id, email_normalized, role, expires_at;

  return next;
exception when unique_violation then
  -- A duplicate token hash must be regenerated by the application; do not
  -- reveal whether a pending invitation exists for any email address.
  raise exception 'invitation_token_collision' using errcode = '23505';
end;
$$;

-- A revoked or accepted invitation is immutable. Returning false lets the API
-- remain idempotent without disclosing invitation details to non-owners.
create or replace function public.revoke_wishlist_invitation_v1(
  p_wishlist_id uuid,
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  update public.wishlist_invitations as invitation
  set revoked_at = pg_catalog.now()
  where invitation.id = p_invitation_id
    and invitation.wishlist_id = p_wishlist_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- Accepting uses the raw token only for the digest comparison. A targeted
-- invitation additionally requires the authenticated user's verified email.
create or replace function public.accept_wishlist_invitation_v1(
  p_invitation_token text,
  p_display_name text default null
)
returns table (
  wishlist_id uuid,
  member_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_display_name text := nullif(pg_catalog.btrim(coalesce(p_display_name, '')), '');
  v_actor_email text;
  v_invitation public.wishlist_invitations%rowtype;
  v_existing_role text;
begin
  if v_actor_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if pg_catalog.char_length(coalesce(p_invitation_token, '')) not between 32 and 512 then
    raise exception 'invalid_invitation_token' using errcode = '22023';
  end if;

  select invitation.* into v_invitation
  from public.wishlist_invitations as invitation
  where invitation.token_hash = extensions.digest(p_invitation_token, 'sha256')
  for update;

  if not found
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= pg_catalog.now() then
    raise exception 'invitation_not_available' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.wishlists as list
    where list.id = v_invitation.wishlist_id
      and list.archived_at is null
  ) then
    raise exception 'wishlist_not_available' using errcode = 'P0002';
  end if;

  if v_invitation.email_normalized is not null then
    select pg_catalog.lower(user_record.email) into v_actor_email
    from auth.users as user_record
    where user_record.id = v_actor_user_id;

    if v_actor_email is distinct from v_invitation.email_normalized then
      raise exception 'invitation_email_mismatch' using errcode = '42501';
    end if;
  end if;

  -- Invited users receive a profile atomically on first acceptance; an
  -- inactive profile can never regain access through an old invitation.
  if not exists (
    select 1 from public.profiles as profile where profile.user_id = v_actor_user_id
  ) then
    if v_display_name is null or pg_catalog.char_length(v_display_name) not between 1 and 80 then
      raise exception 'display_name_required' using errcode = '22023';
    end if;
    insert into public.profiles (user_id, display_name)
    values (v_actor_user_id, v_display_name);
  elsif exists (
    select 1 from public.profiles as profile
    where profile.user_id = v_actor_user_id
      and profile.deleted_at is not null
  ) then
    raise exception 'profile_inactive' using errcode = '42501';
  end if;

  select member.role into v_existing_role
  from public.wishlist_members as member
  where member.wishlist_id = v_invitation.wishlist_id
    and member.user_id = v_actor_user_id
  for update;

  if found then
    -- An older invitation must not silently alter an existing member's role.
    wishlist_id := v_invitation.wishlist_id;
    member_role := v_existing_role;
  else
    insert into public.wishlist_members (wishlist_id, user_id, role, created_by)
    values (v_invitation.wishlist_id, v_actor_user_id, v_invitation.role, v_invitation.invited_by);
    wishlist_id := v_invitation.wishlist_id;
    member_role := v_invitation.role;
  end if;

  update public.wishlist_invitations as invitation
  set accepted_at = pg_catalog.now()
  where invitation.id = v_invitation.id;

  return next;
end;
$$;

-- The existing trigger prevents deletion of the last owner, including when an
-- owner removes themself. This function adds the caller and list checks.
create or replace function public.remove_wishlist_member_v1(
  p_wishlist_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  delete from public.wishlist_members as member
  where member.wishlist_id = p_wishlist_id
    and member.user_id = p_user_id;

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

-- Owners can change member roles. The existing last-owner trigger protects a
-- final owner from demotion and serializes that invariant across requests.
create or replace function public.change_wishlist_member_role_v1(
  p_wishlist_id uuid,
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, '')));
  v_changed_role text;
begin
  perform public.require_wishlist_role_v1(p_wishlist_id, array['owner']);

  if v_role not in ('owner', 'editor', 'viewer') then
    raise exception 'invalid_member_role' using errcode = '22023';
  end if;

  update public.wishlist_members as member
  set role = v_role
  where member.wishlist_id = p_wishlist_id
    and member.user_id = p_user_id
  returning member.role into v_changed_role;

  if not found then
    raise exception 'wishlist_member_not_found' using errcode = 'P0002';
  end if;

  return v_changed_role;
end;
$$;

revoke all on function public.update_wishlist_details_v1(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.publish_wishlist_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.archive_wishlist_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.rotate_wishlist_public_slug_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_wish_v1(uuid, text, text, text, text, text, numeric, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_wish_v1(uuid, uuid, text, text, text, text, text, numeric, text, text) from public, anon, authenticated, service_role;
revoke all on function public.set_wish_archived_v1(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.reorder_wishes_v1(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.create_wishlist_invitation_v1(uuid, text, text, bytea, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.revoke_wishlist_invitation_v1(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_wishlist_invitation_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.remove_wishlist_member_v1(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.change_wishlist_member_role_v1(uuid, uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.update_wishlist_details_v1(uuid, text, text) to authenticated;
grant execute on function public.publish_wishlist_v1(uuid) to authenticated;
grant execute on function public.archive_wishlist_v1(uuid) to authenticated;
grant execute on function public.rotate_wishlist_public_slug_v1(uuid) to authenticated;
grant execute on function public.create_wish_v1(uuid, text, text, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.update_wish_v1(uuid, uuid, text, text, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.set_wish_archived_v1(uuid, uuid, boolean) to authenticated;
grant execute on function public.reorder_wishes_v1(uuid, uuid[]) to authenticated;
grant execute on function public.create_wishlist_invitation_v1(uuid, text, text, bytea, timestamptz) to authenticated;
grant execute on function public.revoke_wishlist_invitation_v1(uuid, uuid) to authenticated;
grant execute on function public.accept_wishlist_invitation_v1(text, text) to authenticated;
grant execute on function public.remove_wishlist_member_v1(uuid, uuid) to authenticated;
grant execute on function public.change_wishlist_member_role_v1(uuid, uuid, text) to authenticated;
