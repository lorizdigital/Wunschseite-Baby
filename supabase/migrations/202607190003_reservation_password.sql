alter table public.reservations
  add column if not exists password_hash text;

alter table public.reservations
  alter column manage_token_hash drop not null;

-- Alte, nur per Verwaltungslink lösbare Reservierungen werden beim Wechsel
-- freigegeben, damit kein Wunsch ohne Passwort dauerhaft blockiert bleibt.
update public.reservations
set cancelled_at = now()
where cancelled_at is null
  and password_hash is null;

drop function if exists public.reserve_wish(uuid, text);
drop function if exists public.cancel_reservation(text);

create or replace function public.reserve_wish(
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
    or char_length(coalesce(p_password, '')) not between 4 and 64 then
    raise exception 'invalid_reservation_data' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.wishes w
    join public.wishlists l on l.id = w.wishlist_id
    where w.id = p_wish_id
      and w.archived_at is null
      and l.archived_at is null
      and l.published_at is not null
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

create or replace function public.cancel_reservation(
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
  update public.reservations
  set cancelled_at = now()
  where wish_id = p_wish_id
    and cancelled_at is null
    and password_hash is not null
    and password_hash = crypt(p_password, password_hash);

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.reserve_wish(uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_reservation(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_wish(uuid, text, text) to service_role;
grant execute on function public.cancel_reservation(uuid, text) to service_role;
