-- Public list pages are rendered on the application server. The server key must
-- not receive direct SELECT rights on tenant tables, so these functions return
-- only the fields already intended for published public pages.

create or replace function public.get_public_wishlist_context_v1(
  p_public_slug text
)
returns table (
  wishlist_id uuid,
  public_slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_public_slug is null
     or p_public_slug !~ '^[A-Za-z0-9_-]{22,128}$' then
    return;
  end if;

  return query
  select list.id, list.public_slug
  from public.wishlists as list
  where list.public_slug = p_public_slug
    and list.visibility = 'unlisted'
    and list.published_at is not null
    and list.archived_at is null;
end;
$$;

create or replace function public.get_public_wishlist_page_v1(
  p_public_slug text
)
returns table (
  wishlist_id uuid,
  public_slug text,
  title text,
  intro text,
  wishes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_public_slug is null
     or p_public_slug !~ '^[A-Za-z0-9_-]{22,128}$' then
    return;
  end if;

  return query
  select
    list.id,
    list.public_slug,
    list.title,
    coalesce(list.intro, ''),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', wish.id,
          'title', wish.title,
          'description', wish.description,
          'product_url', wish.product_url,
          'image_url', wish.image_url,
          'price_amount', wish.price_amount,
          'currency', wish.currency,
          'shop_name', wish.shop_name
        )
        order by wish.sort_order, wish.id
      ) filter (where wish.id is not null),
      '[]'::jsonb
    )
  from public.wishlists as list
  left join public.wishes as wish
    on wish.wishlist_id = list.id
   and wish.archived_at is null
  where list.public_slug = p_public_slug
    and list.visibility = 'unlisted'
    and list.published_at is not null
    and list.archived_at is null
  group by list.id, list.public_slug, list.title, list.intro;
end;
$$;

create or replace function public.get_published_wishlist_page_v1(
  p_wishlist_id uuid
)
returns table (
  wishlist_id uuid,
  public_slug text,
  title text,
  intro text,
  wishes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.get_public_wishlist_page_v1(
    (
      select list.public_slug
      from public.wishlists as list
      where list.id = p_wishlist_id
        and list.visibility = 'unlisted'
        and list.published_at is not null
        and list.archived_at is null
    )
  );
$$;

create or replace function public.get_public_reservation_status_v1(
  p_wishlist_id uuid
)
returns table (wish_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select reservation.wish_id
  from public.reservations as reservation
  join public.wishes as wish
    on wish.id = reservation.wish_id
  join public.wishlists as list
    on list.id = wish.wishlist_id
  where list.id = p_wishlist_id
    and list.visibility = 'unlisted'
    and list.published_at is not null
    and list.archived_at is null
    and wish.archived_at is null
    and reservation.cancelled_at is null;
$$;

revoke all on function public.get_public_wishlist_context_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_wishlist_page_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_published_wishlist_page_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_reservation_status_v1(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_public_wishlist_context_v1(text) to service_role;
grant execute on function public.get_public_wishlist_page_v1(text) to service_role;
grant execute on function public.get_published_wishlist_page_v1(uuid) to service_role;
grant execute on function public.get_public_reservation_status_v1(uuid) to service_role;
