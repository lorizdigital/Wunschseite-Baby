export type ArtworkKind = "bag" | "towel" | "thermometer" | "monitor" | "mobile" | "nailfile" | "pram" | "blanket";

export type Wish = {
  id: string;
  title: string;
  price: string;
  shop: string;
  note: string;
  artwork: ArtworkKind;
  palette: "sand" | "blue" | "sage" | "cream" | "rose";
  productUrl: string;
  imageUrl?: string | null;
  sourceId?: string;
};

export const wishlist = {
  title: "Wünsche für Mats",
  intro: "Unser kleiner Schatz kommt im Oktober und wir freuen uns riesig. Hier findet ihr ein paar Dinge, über die wir uns sehr freuen würden.",
  note: "Du brauchst kein Konto. Name und ein einfaches Passwort reichen zum Reservieren.",
};

export const wishes: Wish[] = [
  { id: "92b56cc9-7fda-43f0-a841-fde79b8a2a01", title: "Wickeltasche Sienna", price: "169,00 €", shop: "Maeva Belle", note: "Farbe: Brown · Vorbestellung für August", artwork: "bag", palette: "sand", productUrl: "https://maevabelle.com/products/meava-belle-luiertas-bruin-vegan-leather", imageUrl: "/products/wickeltasche-sienna.png", sourceId: "fHRNy2ViQ0TNepBV" },
  { id: "0a5de9fd-1e31-490c-b749-71fa06103d7f", title: "Kapuzenbadetuch", price: "24,95 €", shop: "Little Dutch", note: "Farbe: Blau · 75 × 75 cm", artwork: "towel", palette: "blue", productUrl: "https://little-dutch.com/de-de/products/kapuzentuch-blau-75-x-75-essentials", imageUrl: "/products/kapuzenbadetuch.jpg", sourceId: "v4jiFTIcIVkxECCE" },
  { id: "6cd5a28b-8771-43e0-b19d-8f353ad25efe", title: "Digitales Babythermometer", price: "12,00 €", shop: "Amazon", note: "Braun Age Precision PRT2000", artwork: "thermometer", palette: "sage", productUrl: "https://www.amazon.de/dp/B00M35Y326", imageUrl: "/products/babythermometer.jpg", sourceId: "YYdQEb2c1RfYaOv3" },
  { id: "dbad8df3-c63f-4caf-a9cc-61fe80a9a887", title: "Babyphone mit Kamera", price: "173,99 €", shop: "Amazon", note: "Philips Avent · mit Nachtsicht, Schlafliedern und Thermometer", artwork: "monitor", palette: "cream", productUrl: "https://www.amazon.de/dp/B0CF6457TN", imageUrl: "/products/babyphone.jpg", sourceId: "B8pJhQBQJr1Wdaqx" },
  { id: "9fdf0f2e-95a8-418f-a9b2-d89ab54586a8", title: "Wolken-Mobile aus Bouclé", price: "52,93 €", shop: "Etsy", note: "Handgemacht · neutrale Naturtöne", artwork: "mobile", palette: "rose", productUrl: "https://www.etsy.com/de/listing/1616986199/boucle-wolken-baby-mobile-handgemacht", imageUrl: "/products/wolken-mobile.jpg", sourceId: "gWvXpQ1nMkjOvAfF" },
  { id: "c10e3668-f47d-432f-a4be-8a70ad86fe1c", title: "Elektrische Babynagelfeile", price: "29,99 €", shop: "Momcozy", note: "Leise und sanft für Neugeborene", artwork: "nailfile", palette: "sage", productUrl: "https://de.momcozy.com/products/momcozy-electric-baby-nail-file?variant=49706498195696", imageUrl: "/products/babynagelfeile.jpg", sourceId: "EmbJqCzVXI6dnYF5" },
  { id: "d64d835b-cfbb-450f-bfb9-fd97326e2244", title: "Wagenspanner", price: "17,95 €", shop: "Little Dutch", note: "Farbe: Beige · Newborn Naturals", artwork: "pram", palette: "sand", productUrl: "https://little-dutch.com/de-de/products/wagenabdeckung-beige-newborn-naturals", imageUrl: "/products/wagenspanner.jpg", sourceId: "nXIa2HPF8X36eLvu" },
  { id: "10ad60f3-cc04-4dc4-9f19-410162578612", title: "Wiegen-Decke", price: "39,95 €", shop: "Little Dutch", note: "Weiß · Baby Bunny", artwork: "blanket", palette: "cream", productUrl: "https://little-dutch.com/de-de/products/wiege-decke-weiss-newborn-naturals-baby-bunny", imageUrl: "/products/wiegen-decke.jpg", sourceId: "Gcs14v3lgIqRuSfF" },
];
