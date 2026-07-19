update public.wishes as w
set
  title = v.title,
  shop_name = v.shop_name,
  product_url = v.product_url,
  image_url = v.image_url,
  updated_at = now()
from (values
  ('m9rdeMfU3yYzAgWa', 'Kapuzenbadetuch Grün – Essentials', 'Little Dutch', 'https://little-dutch.com/de-de/products/badecape-grun-essentials', '/products/badetuch-gruen.jpg'),
  ('KViUNJLXLc8qJvFv', 'Badetuch Grün – Blueberry Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/badetuch-grun-essentials-blueberry-leaves-1', '/products/badetuch-blueberry-leaves.jpg'),
  ('m4meTTYXlk76hOXA', 'Walkoverall', 'Ehrenkind', 'https://www.ehrenkind.de/products/walkoverall?variant=46929782178122', '/products/walkoverall.png'),
  ('AF2iSE6GaNDIGfAt', 'Wickeltasche aus Seegras – Beige', 'H&M', 'https://www2.hm.com/de_de/productpage.1209252001.html', '/products/wickeltasche-seegras.jpg'),
  ('8GfMEgfxi5QTX7tJ', 'Kontrastbuch mit Spiegel', 'Amazon', 'https://www.amazon.de/dp/B0F3J8B1R8', '/products/kontrastkarten.jpg'),
  ('D7pE1Cc3fqYSzwat', 'Miffy Schnuffeltuch – Lucky Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/miffy-schnuffeltuch-baby-blau-lucky-leaves', '/products/miffy-schnuffeltuch.jpg'),
  ('C8P9QWc0KdPk0S9I', 'Swaddle – Blueberry Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/swaddle-grun-essentials-blueberry-leaves', '/products/swaddle-blueberry-leaves.jpg'),
  ('habnrbjTeNdwC5uQ', 'Waschlappen-Set – Baby Bunny', 'Little Dutch', 'https://little-dutch.com/de-de/products/waschlappen-set-weiss-newborn-naturals-baby-bunny', '/products/waschlappen-baby-bunny.jpg'),
  ('eNYytppSf9SctllE', 'Waschlappen-Set – Forest Friends', 'Little Dutch', 'https://little-dutch.com/de-de/products/waschlappen-set-blau-forest-friends', '/products/waschlappen-forest-friends.jpg'),
  ('xgobT6FQN38kUytn', 'Wiegendecke – Blueberry Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/wiege-decke-grun-essentials-blueberry-leaves', '/products/wiegen-decke-blueberry-leaves.jpg'),
  ('vVfiWhEIfURVlfN0', 'Aufbewahrungskorb klein – Blueberry Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/aufbewahrungskorb-klein-grun-essentials-blueberry-leaves', '/products/aufbewahrungskorb-klein.jpg'),
  ('suuVyrW5FFoNSbSg', 'Aufbewahrungskorb groß – Blueberry Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/aufbewahrungskorb-gross-grun-essentials-blueberry-leaves', '/products/aufbewahrungskorb-gross.jpg'),
  ('pu4EswteQdoVkVb6', 'Aktivitäten-Spieldecke – Newborn Naturals', 'Little Dutch', 'https://little-dutch.com/de-de/products/aktivitaten-spieldecke-weiss-newborn-naturals', '/products/aktivitaeten-spieldecke.jpg'),
  ('8SjN8bH73ZjrRNqQ', 'Miffy Rassel – Lucky Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/miffy-rassel-blau-lucky-leaves', '/products/miffy-rassel.jpg'),
  ('iiTWg4UKN9ePAewk', 'Miffy Aktivitätswürfel – Lucky Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/miffy-aktivitatswurfel-blau-lucky-leaves', '/products/miffy-aktivitaetswuerfel.jpg'),
  ('rcr2h6IthC5kgZOQ', 'Blumenrassel – Little Farm', 'Little Dutch', 'https://little-dutch.com/de-de/products/rassel-blume-little-farm', '/products/rassel-blume.jpg'),
  ('6IX04MY6ZrJx9Hf4', 'Greifball Grün – Essentials', 'Little Dutch', 'https://little-dutch.com/de-de/products/greifball-grun-essentials', '/products/greifball-gruen.jpg'),
  ('ReffAU7GdkDXxCLn', 'Mundtücher-Set – Blueberry Leaves', 'Little Dutch', 'https://little-dutch.com/de-de/products/monddoekjes-set-grun-essentials-blueberry-leaves', '/products/mundtuecher-blueberry-leaves.jpg'),
  ('jpUjKI2Ef2sBjMYr', 'Tripp Trapp Newborn Set – Vanilla White', 'Stokke', 'https://www.stokke.com/DEU/de-de/accessoires/tripp-trapp-zubehoer/526105.html', '/products/tripp-trapp-newborn-set.jpg'),
  ('4Rag1C8jk6rPYdho', 'Tripp Trapp Stuhl – Vanilla White', 'Stokke', 'https://www.stokke.com/DEU/de-de/hochstuehle/tripp-trapp/100142.html?color=656&pid=100142', '/products/tripp-trapp-stuhl.png'),
  ('8GyjUOOayBsXBbMe', 'Babynest Bouclé – Beige', 'District for Kids', 'https://www.district4kids.com/products/babynestchen-boucle-teddystoff', '/products/babynest-boucle.jpg'),
  ('GgHNKA1q49gZ2sCx', 'Winterfußsack Bouclé – Creme, 80 cm', 'District for Kids', 'https://www.district4kids.com/products/products-winterfusssack-teddy-boucle-kinderwagen', '/products/winterfusssack-boucle.jpg')
) as v(source_external_id, title, shop_name, product_url, image_url)
where w.source_provider = 'gowish'
  and w.source_external_id = v.source_external_id;
