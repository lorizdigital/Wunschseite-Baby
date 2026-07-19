alter table public.wishes
  add column if not exists source_provider text,
  add column if not exists source_list_id text,
  add column if not exists source_external_id text,
  add column if not exists source_url text check (source_url is null or source_url ~ '^https?://');

create unique index if not exists wishes_source_identity
  on public.wishes (wishlist_id, source_provider, source_external_id);

update public.wishes
set
  source_provider = 'gowish',
  source_list_id = 'Dh3COe7CvBv2BaD2',
  source_external_id = substring(product_url from '/wish/([A-Za-z0-9_-]+)'),
  source_url = product_url
where product_url like 'https://gowish.com/%/wish/%'
  and source_external_id is null;
