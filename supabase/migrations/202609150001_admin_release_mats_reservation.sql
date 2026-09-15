-- Wer sein Reservierungspasswort vergessen hat, kann den Wunsch nicht selbst
-- freigeben. Die Verwaltung braucht dafür einen Notausgang, der ausschließlich
-- offene Reservierungen der Mats-Liste aufhebt und kein Passwort prüft.

create or replace function public.admin_release_mats_reservation_v1(p_wish_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wishlist_id constant uuid := '3d1f46e6-8e0e-4418-a0da-581be7cf795f'::uuid;
  v_released integer;
begin
  if not exists (
    select 1
    from public.wishes as wish
    where wish.id = p_wish_id
      and wish.wishlist_id = v_wishlist_id
  ) then
    raise exception 'wish_not_available' using errcode = 'P0002';
  end if;

  update public.reservations as reservation
  set cancelled_at = pg_catalog.now()
  where reservation.wish_id = p_wish_id
    and reservation.cancelled_at is null;

  get diagnostics v_released = row_count;

  -- Ohne diesen Schritt könnte ein verspäteter Wiederholungsversuch mit altem
  -- Idempotenz-Schlüssel eine längst aufgehobene Reservierung als gültig melden.
  delete from public.reservation_idempotency as request
  where request.wish_id = p_wish_id;

  return v_released > 0;
end;
$$;

revoke all on function public.admin_release_mats_reservation_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_release_mats_reservation_v1(uuid) to service_role;
