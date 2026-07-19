create extension if not exists pgcrypto;

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  intro text not null default '',
  owner_user_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  description text,
  product_url text check (product_url is null or product_url ~ '^https?://'),
  image_url text check (image_url is null or image_url ~ '^https?://'),
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  shop_name text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid not null references public.wishes(id) on delete restrict,
  guest_name text check (guest_name is null or char_length(guest_name) <= 80),
  manage_token_hash bytea not null unique,
  reserved_at timestamptz not null default now(),
  cancelled_at timestamptz,
  fulfilled_at timestamptz
);

create unique index one_open_reservation_per_wish
  on public.reservations (wish_id)
  where cancelled_at is null;

create index wishes_by_list_order
  on public.wishes (wishlist_id, sort_order)
  where archived_at is null;

alter table public.wishlists enable row level security;
alter table public.wishes enable row level security;
alter table public.reservations enable row level security;

-- Guests never write directly to tables. The Next.js server calls these
-- functions with the server-only service role after validating the request.
create or replace function public.reserve_wish(
  p_wish_id uuid,
  p_guest_name text default null
)
returns table (reservation_id uuid, manage_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_manage_token text := encode(gen_random_bytes(32), 'hex');
  v_reservation_id uuid;
begin
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

  insert into public.reservations (wish_id, guest_name, manage_token_hash)
  values (
    p_wish_id,
    nullif(left(trim(coalesce(p_guest_name, '')), 80), ''),
    digest(v_manage_token, 'sha256')
  )
  returning id into v_reservation_id;

  return query select v_reservation_id, v_manage_token;
end;
$$;

create or replace function public.cancel_reservation(p_manage_token text)
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
  where manage_token_hash = digest(p_manage_token, 'sha256')
    and cancelled_at is null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.reserve_wish(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_reservation(text) from public, anon, authenticated;
grant execute on function public.reserve_wish(uuid, text) to service_role;
grant execute on function public.cancel_reservation(text) to service_role;

insert into public.wishlists (id, title, intro, published_at)
values (
  '3d1f46e6-8e0e-4418-a0da-581be7cf795f',
  'Wünsche für Mats',
  'Unser kleiner Schatz kommt im Oktober und wir freuen uns riesig.',
  now()
);

insert into public.wishes
  (id, wishlist_id, title, description, product_url, price_amount, currency, shop_name, sort_order)
values
  ('92b56cc9-7fda-43f0-a841-fde79b8a2a01', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Wickeltasche Sienna', 'Farbe: Brown · Vorbestellung für August', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/fHRNy2ViQ0TNepBV', 169.00, 'EUR', 'Studio Noos', 10),
  ('0a5de9fd-1e31-490c-b749-71fa06103d7f', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Kapuzenbadetuch', 'Farbe: Blau · 75 × 75 cm', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/v4jiFTIcIVkxECCE', 24.95, 'EUR', 'Jollein', 20),
  ('6cd5a28b-8771-43e0-b19d-8f353ad25efe', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Digitales Babythermometer', 'Age Precision PRT2000', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/YYdQEb2c1RfYaOv3', 12.00, 'EUR', 'Braun', 30),
  ('dbad8df3-c63f-4caf-a9cc-61fe80a9a887', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Babyphone mit Kamera', 'Mit Nachtsicht, Schlafliedern und Thermometer', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/B8pJhQBQJr1Wdaqx', 173.99, 'EUR', 'Philips Avent', 40),
  ('9fdf0f2e-95a8-418f-a9b2-d89ab54586a8', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Wolken-Mobile aus Bouclé', 'Handgemacht · neutrale Naturtöne', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/gWvXpQ1nMkjOvAfF', 52.93, 'EUR', 'Etsy', 50),
  ('c10e3668-f47d-432f-a4be-8a70ad86fe1c', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Elektrische Babynagelfeile', 'Leise und sanft für Neugeborene', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/EmbJqCzVXI6dnYF5', 29.99, 'EUR', 'Momcozy', 60),
  ('d64d835b-cfbb-450f-bfb9-fd97326e2244', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Wagenspanner', 'Farbe: Beige · Newborn Naturals', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/nXIa2HPF8X36eLvu', 17.95, 'EUR', 'Little Dutch', 70),
  ('10ad60f3-cc04-4dc4-9f19-410162578612', '3d1f46e6-8e0e-4418-a0da-581be7cf795f', 'Wiegen-Decke', 'Weiß · Baby Bunny', 'https://gowish.com/de/wishlists/Dh3COe7CvBv2BaD2/wish/Gcs14v3lgIqRuSfF', 39.95, 'EUR', 'Little Dutch', 80);
