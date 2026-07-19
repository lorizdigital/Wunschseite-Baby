alter table public.wishes
  drop constraint if exists wishes_image_url_check;

alter table public.wishes
  add constraint wishes_image_url_check
  check (image_url is null or image_url ~ '^(https?://|/)');

update public.wishes
set image_url = case id
  when '92b56cc9-7fda-43f0-a841-fde79b8a2a01' then '/products/wickeltasche-sienna.png'
  when '0a5de9fd-1e31-490c-b749-71fa06103d7f' then '/products/kapuzenbadetuch.jpg'
  when '6cd5a28b-8771-43e0-b19d-8f353ad25efe' then '/products/babythermometer.jpg'
  when 'dbad8df3-c63f-4caf-a9cc-61fe80a9a887' then '/products/babyphone.jpg'
  when '9fdf0f2e-95a8-418f-a9b2-d89ab54586a8' then '/products/wolken-mobile.jpg'
  when 'c10e3668-f47d-432f-a4be-8a70ad86fe1c' then '/products/babynagelfeile.jpg'
  when 'd64d835b-cfbb-450f-bfb9-fd97326e2244' then '/products/wagenspanner.jpg'
  when '10ad60f3-cc04-4dc4-9f19-410162578612' then '/products/wiegen-decke.jpg'
end
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
