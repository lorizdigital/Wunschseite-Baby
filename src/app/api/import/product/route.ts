import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { scrapeProduct } from "@/lib/product-scraper";
import { MAX_PRODUCT_URL_INPUT_LENGTH, normalizeProductUrl } from "@/lib/product-url";
import { consumeRateLimit, getRequestClientKey } from "@/lib/rate-limit";

const input = z.object({ url: z.string().trim().url().max(MAX_PRODUCT_URL_INPUT_LENGTH) });
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isAdminRequest(request)) return Response.json({ error: "Der Admin-Code fehlt oder ist falsch." }, { status: 401 });
    const limit = await consumeRateLimit("legacy-product-import", getRequestClientKey(request), 20, 60 * 60);
    if (limit === false) return Response.json({ error: "Bitte versuche es später erneut." }, { status: 429 });
    if (limit === null) return Response.json({ error: "Der Produktimport ist kurzzeitig nicht verfügbar." }, { status: 503 });
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Bitte gib einen vollständigen Produktlink ein." }, { status: 400 });
    return Response.json({ product: await scrapeProduct(normalizeProductUrl(parsed.data.url)) });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Der Link konnte nicht gelesen werden." }, { status: 422 });
  }
}
