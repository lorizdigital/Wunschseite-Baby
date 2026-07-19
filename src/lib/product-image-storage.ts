import "server-only";

import { randomUUID } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { getSupabaseAdmin, getWishlistId } from "@/lib/supabase-admin";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function isPrivate(address: string) {
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return isPrivate(value.slice(7));
  if (value.includes(":")) return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("2001:db8:");
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
}

async function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Die Bildadresse ist nicht öffentlich erreichbar.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) throw new Error("Lokale Bildadressen sind nicht erlaubt.");
  if (isIP(host)) {
    if (isPrivate(host)) throw new Error("Private Netzwerkadressen sind nicht erlaubt.");
  } else {
    const [v4, v6] = await Promise.all([resolve4(host).catch(() => []), resolve6(host).catch(() => [])]);
    const addresses = [...v4, ...v6];
    if (!addresses.length || addresses.some(isPrivate)) throw new Error("Die Bildadresse konnte nicht sicher aufgelöst werden.");
  }
  url.hash = "";
  return url;
}

async function readImage(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_SIZE) throw new Error("Das Produktbild ist größer als 5 MB.");
  if (!response.body) throw new Error("Das Produktbild ist leer.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMAGE_SIZE) {
      await reader.cancel();
      throw new Error("Das Produktbild ist größer als 5 MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function downloadImage(value: string) {
  let url = await validatePublicUrl(value);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "image/jpeg,image/png,image/webp", "User-Agent": "Mozilla/5.0 (compatible; WunschlistenBildimport/1.0)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("Zu viele Bildweiterleitungen.");
      url = await validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Das Produktbild antwortet mit Status ${response.status}.`);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    const extension = allowedTypes.get(contentType);
    if (!extension) throw new Error("Das Produktbild hat ein nicht unterstütztes Format.");
    return { bytes: await readImage(response), contentType, extension };
  }
  throw new Error("Das Produktbild konnte nicht geladen werden.");
}

export async function storeProductImage(imageUrl: string | null) {
  if (!imageUrl || imageUrl.startsWith("/")) return { url: imageUrl, path: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase ist noch nicht eingerichtet.");
  const projectHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local").host;
  const parsed = new URL(imageUrl);
  if (parsed.host === projectHost && parsed.pathname.includes("/storage/v1/object/public/product-images/")) return { url: imageUrl, path: null };

  const image = await downloadImage(imageUrl);
  const path = `${getWishlistId()}/${randomUUID()}.${image.extension}`;
  const { error } = await supabase.storage.from("product-images").upload(path, image.bytes, {
    contentType: image.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`Das Produktbild konnte nicht gespeichert werden: ${error.message}`);
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function removeStoredProductImage(path: string | null) {
  if (!path) return;
  const supabase = getSupabaseAdmin();
  if (supabase) await supabase.storage.from("product-images").remove([path]);
}
