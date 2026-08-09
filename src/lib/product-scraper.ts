import "server-only";

import { readResponseBytes, requestPublicUrl, responseHeader, resolvePublicUrl } from "@/lib/secure-public-fetch";

export type ImportedProduct = {
  title: string;
  description: string;
  imageUrl: string | null;
  price: string | null;
  currency: string | null;
  shop: string;
  sourceUrl: string;
};

async function loadHtml(value: string) {
  let url = (await resolvePublicUrl(value)).url;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await requestPublicUrl(url, { accept: "text/html,application/xhtml+xml", userAgent: "Mozilla/5.0 (compatible; WunschlistenImporter/1.0)", timeoutMs: 8_000 });
    if (response.status >= 300 && response.status < 400) {
      const location = responseHeader(response.headers, "location");
      response.body.destroy();
      if (!location || redirect === 3) throw new Error("Zu viele Weiterleitungen.");
      url = (await resolvePublicUrl(new URL(location, url).toString())).url;
      continue;
    }
    if (response.status < 200 || response.status >= 300) { response.body.destroy(); throw new Error(`Der Shop antwortet mit Status ${response.status}.`); }
    if (!responseHeader(response.headers, "content-type").includes("html")) { response.body.destroy(); throw new Error("Der Link verweist nicht auf eine Produktseite."); }
    const html = (await readResponseBytes(response, 3_000_000)).toString("utf8");
    return { html, url };
  }
  throw new Error("Die Produktseite konnte nicht geladen werden.");
}

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) => {
      const point = Number.parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/&#([0-9]+);/g, (match, code: string) => {
      const point = Number.parseInt(code, 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyFirst = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i");
  return decodeHtml(propertyFirst.exec(html)?.[1] ?? contentFirst.exec(html)?.[1] ?? "");
}

function documentTitle(html: string) {
  return decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
}

function tagAttribute(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(new RegExp(`\\b${escaped}=["']([^"']*)["']`, "i").exec(tag)?.[1] ?? "");
}

function amazonProductTitle(html: string) {
  const value = /<span[^>]*\bid=["']productTitle["'][^>]*>([\s\S]{0,1000}?)<\/span>/i.exec(html)?.[1] ?? "";
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function amazonProductImage(html: string) {
  const tag = /<img[^>]*\bid=["']landingImage["'][^>]*>/i.exec(html)?.[0] ?? "";
  if (!tag) return "";
  const highResolution = tagAttribute(tag, "data-old-hires");
  if (highResolution) return highResolution;
  const dynamic = tagAttribute(tag, "data-a-dynamic-image");
  try {
    const candidates = Object.entries(JSON.parse(dynamic) as Record<string, [number, number]>);
    candidates.sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
    return candidates[0]?.[0] ?? "";
  } catch {
    return "";
  }
}

function amazonProductPrice(html: string) {
  return /"priceAmount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(html)?.[1] ?? "";
}

function findProduct(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findProduct(item); if (found) return found; }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return record;
  return findProduct(record["@graph"]);
}

export async function scrapeProduct(value: string): Promise<ImportedProduct> {
  const { html, url } = await loadHtml(value);
  const host = url.hostname.toLowerCase();
  const isAmazonDe = host === "amazon.de" || host.endsWith(".amazon.de");
  let product: Record<string, unknown> | null = null;
  const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdPattern)) {
    try { product = findProduct(JSON.parse(match[1])); } catch { /* Open Graph fallback */ }
    if (product) break;
  }
  const record = product as Record<string, unknown> | null;
  const offers = record?.offers;
  const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
  const images = record?.image;
  const image = clean(Array.isArray(images) ? images[0] : images, 2000) || clean(metaContent(html, "og:image"), 2000) || (isAmazonDe ? clean(amazonProductImage(html), 2000) : "");
  const title = clean(record?.name, 180) || clean(metaContent(html, "og:title"), 180) || (isAmazonDe ? clean(amazonProductTitle(html), 180) : "") || clean(documentTitle(html), 180);
  if (!title) throw new Error("Es wurde kein Produkttitel gefunden.");
  let imageUrl: string | null = null;
  try { imageUrl = image ? new URL(image, url).toString() : null; } catch { imageUrl = null; }
  return {
    title,
    description: clean(record?.description, 600) || clean(metaContent(html, "og:description"), 600),
    imageUrl,
    price: clean(offer?.price, 40) || clean(metaContent(html, "product:price:amount"), 40) || (isAmazonDe ? clean(amazonProductPrice(html), 40) : "") || null,
    currency: clean(offer?.priceCurrency, 8) || clean(metaContent(html, "product:price:currency"), 8) || (isAmazonDe ? "EUR" : null),
    shop: url.hostname.replace(/^www\./, ""),
    sourceUrl: url.toString(),
  };
}
