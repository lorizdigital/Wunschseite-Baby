import { createClient } from "@supabase/supabase-js";

const expectedProjectRef = "nnrkbdduiiebdahwcofa";
const expectedConfirmation = "inspect-wuenschi-production-read-only";
const matsWishlistId = "3d1f46e6-8e0e-4418-a0da-581be7cf795f";
const pageSize = 1000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message ?? error ?? "unbekannter Fehler").replaceAll(/[\r\n]+/g, " ").slice(0, 300);
}

async function readAll(createQuery, label) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await createQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${safeError(error)}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(process.env.PRODUCTION_WISHLIST_INVENTORY_CONFIRMATION === expectedConfirmation, "Explizite Bestätigung für die read-only Produktionsabfrage fehlt.");
assert(url && serviceRoleKey, "Supabase-Produktionskonfiguration fehlt.");

const parsedUrl = new URL(url);
assert(
  parsedUrl.protocol === "https:" && parsedUrl.hostname === `${expectedProjectRef}.supabase.co` && parsedUrl.pathname === "/",
  "Die Konfiguration verweist nicht exakt auf das erwartete Produktionsprojekt.",
);

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const [lists, activeWishes] = await Promise.all([
  readAll(
    () => supabase.from("wishlists").select("id,visibility,published_at,archived_at,access_code_hash,access_code_version").order("id"),
    "Wunschlisten lesen",
  ),
  readAll(
    () => supabase.from("wishes").select("id,wishlist_id").is("archived_at", null).order("id"),
    "Aktive Wünsche lesen",
  ),
]);

const wishCounts = new Map();
for (const wish of activeWishes) wishCounts.set(wish.wishlist_id, (wishCounts.get(wish.wishlist_id) ?? 0) + 1);
const ordinaryLists = lists.filter((list) => list.id !== matsWishlistId);
const activeOrdinaryLists = ordinaryLists.filter((list) => list.archived_at === null);
const publishedOrdinaryLists = activeOrdinaryLists.filter((list) => list.published_at !== null);
const isProtected = (list) => list.visibility === "access_code"
  && typeof list.access_code_hash === "string"
  && typeof list.access_code_version === "string";

const result = {
  projectVerified: true,
  queryMode: "read-only-selects",
  totalWishlists: lists.length,
  totalWishlistsWithoutCompleteAccessCode: lists.filter((list) => !isProtected(list)).length,
  totalOrdinaryWishlists: ordinaryLists.length,
  activeOrdinaryWishlists: activeOrdinaryLists.length,
  archivedOrdinaryWishlistsWithoutCompleteAccessCode: ordinaryLists.filter((list) => list.archived_at !== null && !isProtected(list)).length,
  publishedOrdinaryWishlists: publishedOrdinaryLists.length,
  publishedOrdinaryWishlistsWithoutCompleteAccessCode: publishedOrdinaryLists.filter((list) => !isProtected(list)).length,
  publishedOrdinaryWishlistsWithoutActiveWishes: publishedOrdinaryLists.filter((list) => (wishCounts.get(list.id) ?? 0) === 0).length,
  activeOrdinaryDraftsWithoutCompleteAccessCode: activeOrdinaryLists.filter((list) => list.published_at === null && !isProtected(list)).length,
  inconsistentAccessCodePairs: lists.filter((list) => (list.access_code_hash === null) !== (list.access_code_version === null)).length,
  matsWishlistPresent: lists.some((list) => list.id === matsWishlistId),
  matsActiveWishes: wishCounts.get(matsWishlistId) ?? 0,
};

console.log(JSON.stringify(result, null, 2));
