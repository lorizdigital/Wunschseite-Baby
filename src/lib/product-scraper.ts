import "server-only";

import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

export type ImportedProduct = {
  title: string;
  description: string;
  imageUrl: string | null;
  price: string | null;
  currency: string | null;
  shop: string;
  sourceUrl: string;
};

function isPrivate(address: string) {
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return isPrivate(value.slice(7));
  if (value.includes(":")) return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("2001:db8:");
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
}

async function readHtml(response: Response) {
  const limit = 3_000_000;
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limit - size;
    if (value.byteLength > remaining) {
      html += decoder.decode(value.subarray(0, remaining), { stream: true });
      await reader.cancel();
      return html + decoder.decode();
    }
    size += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

async function validateUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Nur öffentliche HTTP- und HTTPS-Links sind erlaubt.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) throw new Error("Lokale Adressen sind nicht erlaubt.");
  if (isIP(host)) {
    if (isPrivate(host)) throw new Error("Private Netzwerkadressen sind nicht erlaubt.");
  } else {
    const [v4, v6] = await Promise.all([resolve4(host).catch(() => []), resolve6(host).catch(() => [])]);
    const addresses = [...v4, ...v6];
    if (!addresses.length || addresses.some(isPrivate)) throw new Error("Die Zieladresse konnte nicht sicher aufgelöst werden.");
  }
  url.hash = "";
  return url;
}

async function loadHtml(value: string) {
  let url = await validateUrl(value);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; WunschlistenImporter/1.0)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("Zu viele Weiterleitungen.");
      url = await validateUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Der Shop antwortet mit Status ${response.status}.`);
    if (!(response.headers.get("content-type") ?? "").includes("html")) throw new Error("Der Link verweist nicht auf eine Produktseite.");
    const html = await readHtml(response);
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
