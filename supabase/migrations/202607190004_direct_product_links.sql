update public.wishes
set product_url = case id
  when '92b56cc9-7fda-43f0-a841-fde79b8a2a01' then 'https://maevabelle.com/products/meava-belle-luiertas-bruin-vegan-leather'
  when '0a5de9fd-1e31-490c-b749-71fa06103d7f' then 'https://little-dutch.com/de-de/products/kapuzentuch-blau-75-x-75-essentials'
  when '6cd5a28b-8771-43e0-b19d-8f353ad25efe' then 'https://www.amazon.de/dp/B00M35Y326'
  when 'dbad8df3-c63f-4caf-a9cc-61fe80a9a887' then 'https://www.amazon.de/dp/B0CF6457TN'
  when '9fdf0f2e-95a8-418f-a9b2-d89ab54586a8' then 'https://www.etsy.com/de/listing/1616986199/boucle-wolken-baby-mobile-handgemacht'
  when 'c10e3668-f47d-432f-a4be-8a70ad86fe1c' then 'https://de.momcozy.com/products/momcozy-electric-baby-nail-file?variant=49706498195696'
  when 'd64d835b-cfbb-450f-bfb9-fd97326e2244' then 'https://little-dutch.com/de-de/products/wagenabdeckung-beige-newborn-naturals'
  when '10ad60f3-cc04-4dc4-9f19-410162578612' then 'https://little-dutch.com/de-de/products/wiege-decke-weiss-newborn-naturals-baby-bunny'
  else product_url
end,
shop_name = case id
  when '92b56cc9-7fda-43f0-a841-fde79b8a2a01' then 'Maeva Belle'
  when '0a5de9fd-1e31-490c-b749-71fa06103d7f' then 'Little Dutch'
  when '6cd5a28b-8771-43e0-b19d-8f353ad25efe' then 'Amazon'
  when 'dbad8df3-c63f-4caf-a9cc-61fe80a9a887' then 'Amazon'
  else shop_name
end,
updated_at = now()
where id in (
  '92b56cc9-7fda-43f0-a841-fde79b8a2a01',
  '0a5de9fd-1e31-490c-b749-71fa06103d7f',
  '6cd5a28b-8771-43e0-b19d-8f353ad25efe',
  'dbad8df3-c63f-4caf-a9cc-61fe80a9a887',
  '9fdf0f2e-95a8-418f-a9b2-d89ab54586a8',
  'c10e3668-f47d-432f-a4be-8a70ad86fe1c',
  'd64d835b-cfbb-450f-bfb9-fd97326e2244',
  '10ad60f3-cc04-4dc4-9f19-410162578612'
);
