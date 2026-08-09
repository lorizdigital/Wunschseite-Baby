-- Phase 1: additive foundation for isolated, multi-family wishlists.
-- This migration intentionally leaves all existing Mats wishes, reservations,
-- legacy functions, image URLs, and timestamps untouched.

create extension if not exists pgcrypto;

alter table public.wishlists
  add column if not exists public_slug text,
  add column if not exists visibility text not null default 'unlisted',
  add column if not exists delete_after timestamptz;

alter table public.wishlists
  drop constraint if exists wishlists_visibility_check,
  add constraint wishlists_visibility_check
    check (visibility in ('unlisted', 'access_code')),
  drop constraint if exists wishlists_delete_after_check,
  add constraint wishlists_delete_after_check
    check (delete_after is null or delete_after > created_at),
  drop constraint if exists wishlists_public_slug_format_check,
  add constraint wishlists_public_slug_format_check
    check (public_slug is null or public_slug ~ '^[A-Za-z0-9_-]{22,128}$');

alter table public.wishes
  add column if not exists image_storage_path text;

alter table public.wishes
  drop constraint if exists wishes_image_storage_path_check,
  add constraint wishes_image_storage_path_check
    check (image_storage_path is null or image_storage_path like wishlist_id::text || '/%');

create unique index if not exists wishlists_public_slug_unique
  on public.wishlists (public_slug)
  where public_slug is not null;

create index if not exists wishlists_owner_user_id_idx
  on public.wishlists (owner_user_id)
  where owner_user_id is not null;

-- Mats is the only known pre-existing list. The loop makes the already
-- astronomically unlikely collision explicit and leaves every other field as-is.
do $$
declare
  v_slug text;
begin
  if exists (
    select 1 from public.wishlists
    where id = '3d1f46e6-8e0e-4418-a0da-581be7cf795f'::uuid
      and public_slug is null
  ) then
    loop
      v_slug := encode(gen_random_bytes(16), 'hex');
      begin
        update public.wishlists
        set public_slug = v_slug,
            visibility = 'unlisted'
        where id = '3d1f46e6-8e0e-4418-a0da-581be7cf795f'::uuid
          and public_slug is null;
        exit;
      exception when unique_violation then
        -- Generate another 128-bit value; no data has been changed.
      end;
    end loop;
  end if;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists public.wishlist_members (
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, user_id)
);

create index if not exists wishlist_members_user_wishlist_idx
  on public.wishlist_members (user_id, wishlist_id);

create index if not exists wishlist_members_owner_idx
  on public.wishlist_members (wishlist_id)
  where role = 'owner';

create table if not exists public.wishlist_invitations (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  email_normalized text check (
    email_normalized is null
    or (
      email_normalized = lower(btrim(email_normalized))
      and char_length(email_normalized) between 3 and 320
    )
  ),
  role text not null check (role in ('owner', 'editor', 'viewer')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or (accepted_at >= created_at and accepted_at <= expires_at)),
  check (revoked_at is null or revoked_at >= created_at),
  check (not (accepted_at is not null and revoked_at is not null))
);

create index if not exists wishlist_invitations_pending_expiry_idx
  on public.wishlist_invitations (wishlist_id, expires_at)
  where accepted_at is null and revoked_at is null;

create index if not exists wishlist_invitations_email_idx
  on public.wishlist_invitations (wishlist_id, email_normalized)
  where email_normalized is not null;

alter table public.profiles enable row level security;
alter table public.wishlist_members enable row level security;
alter table public.wishlist_invitations enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishes enable row level security;
alter table public.reservations enable row level security;

create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before insert or update on public.profiles
  for each row execute function public.profiles_set_updated_at();

-- SECURITY DEFINER avoids recursive RLS evaluation in membership policies.
-- The function exposes only a boolean and is not callable by anonymous users.
create or replace function public.has_wishlist_role(
  p_wishlist_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wishlist_members member
    where member.wishlist_id = p_wishlist_id
      and member.user_id = (select auth.uid())
      and member.role = any(p_roles)
  );
$$;

revoke all on function public.has_wishlist_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.has_wishlist_role(uuid, text[]) to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists wishlists_read_as_member on public.wishlists;
create policy wishlists_read_as_member on public.wishlists
  for select to authenticated
  using (public.has_wishlist_role(id, array['owner', 'editor', 'viewer']));

drop policy if exists wishes_read_as_member on public.wishes;
create policy wishes_read_as_member on public.wishes
  for select to authenticated
  using (public.has_wishlist_role(wishlist_id, array['owner', 'editor', 'viewer']));

drop policy if exists wishlist_members_read_as_member on public.wishlist_members;
create policy wishlist_members_read_as_member on public.wishlist_members
  for select to authenticated
  using (public.has_wishlist_role(wishlist_id, array['owner', 'editor', 'viewer']));

drop policy if exists wishlist_invitations_read_as_owner on public.wishlist_invitations;
create policy wishlist_invitations_read_as_owner on public.wishlist_invitations
  for select to authenticated
  using (public.has_wishlist_role(wishlist_id, array['owner']));

grant select, insert, update on public.profiles to authenticated;
grant select on public.wishlists, public.wishes, public.wishlist_members to authenticated;
revoke all on public.wishlist_invitations from public, anon, authenticated;
grant select (id, wishlist_id, email_normalized, role, invited_by, expires_at, accepted_at, revoked_at, created_at)
  on public.wishlist_invitations to authenticated;
grant all on public.profiles, public.wishlist_members, public.wishlist_invitations to service_role;

-- No direct write policies are introduced for wishlists, memberships,
-- invitations, wishes, or reservations. Their future mutations are performed
-- through narrowly scoped, user-checked RPCs. Reservations remain inaccessible
-- to clients so guest names and password hashes can never be selected.

create or replace function public.reserve_wish_v2(
  p_wishlist_id uuid,
  p_wish_id uuid,
  p_guest_name text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_reservation_id uuid;
begin
  if char_length(trim(coalesce(p_guest_name, ''))) not between 1 and 80
    or char_length(coalesce(p_password, '')) not between 8 and 64 then
    raise exception 'invalid_reservation_data' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.wishes wish
    join public.wishlists list on list.id = wish.wishlist_id
    where list.id = p_wishlist_id
      and wish.id = p_wish_id
      and wish.archived_at is null
      and list.published_at is not null
      and list.archived_at is null
  ) then
    raise exception 'wish_not_available' using errcode = 'P0002';
  end if;

  insert into public.reservations (wish_id, guest_name, password_hash, manage_token_hash)
  values (
    p_wish_id,
    left(trim(p_guest_name), 80),
    crypt(p_password, gen_salt('bf', 10)),
    null
  )
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.cancel_reservation_v2(
  p_wishlist_id uuid,
  p_wish_id uuid,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_updated integer;
begin
  if char_length(coalesce(p_password, '')) not between 8 and 64 then
    raise exception 'invalid_reservation_data' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.wishes wish
    join public.wishlists list on list.id = wish.wishlist_id
    where list.id = p_wishlist_id
      and wish.id = p_wish_id
      and wish.archived_at is null
      and list.published_at is not null
      and list.archived_at is null
  ) then
    raise exception 'wish_not_available' using errcode = 'P0002';
  end if;

  update public.reservations reservation
  set cancelled_at = now()
  where reservation.wish_id = p_wish_id
    and reservation.cancelled_at is null
    and reservation.password_hash is not null
    and reservation.password_hash = crypt(p_password, reservation.password_hash);

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.reserve_wish_v2(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_reservation_v2(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_wish_v2(uuid, uuid, text, text) to service_role;
grant execute on function public.cancel_reservation_v2(uuid, uuid, text) to service_role;
