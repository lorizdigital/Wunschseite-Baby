export const MAX_PRODUCT_URL_INPUT_LENGTH = 16_384;

const trackingNames = new Set([
  "_branch_match_id",
  "_branch_referrer",
  "aff_id",
  "affiliate",
  "campaignid",
  "clickid",
  "dclid",
  "fbclid",
  "gclid",
  "gbraid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref",
  "ref_",
  "srsltid",
  "twclid",
  "wbraid",
]);

function unwrapRedirect(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parameter =
    ((host === "google.com" || host.endsWith(".google.com")) && url.pathname === "/url" && (url.searchParams.get("url") ?? url.searchParams.get("q"))) ||
    (host === "l.facebook.com" && url.pathname === "/l.php" && url.searchParams.get("u")) ||
    (host === "l.instagram.com" && url.searchParams.get("u")) ||
    (host === "out.reddit.com" && url.searchParams.get("url"));
  return parameter || null;
}

function isTrackingParameter(name: string) {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || key.startsWith("pk_") || trackingNames.has(key);
}

export function normalizeProductUrl(value: string, redirectDepth = 0): string {
  const input = value.trim();
  if (!input || input.length > MAX_PRODUCT_URL_INPUT_LENGTH) {
    throw new Error("Der Produktlink ist zu lang oder leer.");
  }

  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Bitte gib einen öffentlichen HTTP- oder HTTPS-Produktlink ein.");
  }

  const redirectTarget = redirectDepth < 2 ? unwrapRedirect(url) : null;
  if (redirectTarget) return normalizeProductUrl(redirectTarget, redirectDepth + 1);

  const host = url.hostname.toLowerCase();
  const amazonProduct = (host === "amazon.de" || host.endsWith(".amazon.de"))
    ? url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i)
    : null;

  if (amazonProduct) {
    url.pathname = `/dp/${amazonProduct[1].toUpperCase()}`;
    url.search = "";
  } else {
    for (const name of [...url.searchParams.keys()]) {
      if (isTrackingParameter(name)) url.searchParams.delete(name);
    }
  }

  url.hash = "";
  const normalized = url.toString();
  if (normalized.length > 8_192) {
    throw new Error("Der bereinigte Produktlink ist noch zu lang. Bitte öffne das Produkt direkt im Shop und kopiere die Adresszeile erneut.");
  }
  return normalized;
}
