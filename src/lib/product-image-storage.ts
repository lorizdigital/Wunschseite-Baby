import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readResponseBytes, requestPublicUrl, responseHeader, resolvePublicUrl } from "@/lib/secure-public-fetch";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function downloadImage(value: string) {
  let url = (await resolvePublicUrl(value)).url;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await requestPublicUrl(url, { accept: "image/jpeg,image/png,image/webp", userAgent: "Mozilla/5.0 (compatible; WunschlistenBildimport/1.0)", timeoutMs: 12_000 });
    if (response.status >= 300 && response.status < 400) {
      const location = responseHeader(response.headers, "location");
      response.body.destroy();
      if (!location || redirect === 3) throw new Error("Zu viele Bildweiterleitungen.");
      url = (await resolvePublicUrl(new URL(location, url).toString())).url;
      continue;
    }
    if (response.status < 200 || response.status >= 300) { response.body.destroy(); throw new Error(`Das Produktbild antwortet mit Status ${response.status}.`); }
    const contentType = responseHeader(response.headers, "content-type").split(";")[0].toLowerCase();
    const extension = allowedTypes.get(contentType);
    if (!extension) { response.body.destroy(); throw new Error("Das Produktbild hat ein nicht unterstütztes Format."); }
    try { return { bytes: await readResponseBytes(response, MAX_IMAGE_SIZE), contentType, extension }; }
    catch { throw new Error("Das Produktbild ist größer als 5 MB."); }
  }
  throw new Error("Das Produktbild konnte nicht geladen werden.");
}

export async function storeProductImage(wishlistId: string, imageUrl: string | null) {
  if (!imageUrl || imageUrl.startsWith("/")) return { url: imageUrl, path: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase ist noch nicht eingerichtet.");
  const projectHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local").host;
  const parsed = new URL(imageUrl);
  if (parsed.host === projectHost && parsed.pathname.includes("/storage/v1/object/public/product-images/")) return { url: imageUrl, path: null };

  const image = await downloadImage(imageUrl);
  const path = `${wishlistId}/${randomUUID()}.${image.extension}`;
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
