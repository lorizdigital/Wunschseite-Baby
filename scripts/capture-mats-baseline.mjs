import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const MATS_WISHLIST_ID = "3d1f46e6-8e0e-4418-a0da-581be7cf795f";
const EXPECTED_WISH_COUNT = 30;
const EXPECTED_RESERVATION_COUNT = 9;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function parseArguments(values) {
  const args = { compare: null, output: null, includeRecords: false };
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--compare") args.compare = values[++index] ?? null;
    else if (values[index] === "--out") args.output = values[++index] ?? null;
    else if (values[index] === "--include-records") args.includeRecords = true;
    else throw new Error(`Unbekanntes Argument: ${values[index]}`);
  }
  return args;
}

function classifyImage(imageUrl, storagePath) {
  if (storagePath) return "supabase-storage";
  if (!imageUrl) return "missing";
  if (imageUrl.startsWith("/products/")) return "local-product";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return "external-url";
  return "other";
}

async function inspectLocalProductImage(imageUrl) {
  if (!imageUrl?.startsWith("/products/")) return null;
  const relativePath = imageUrl.slice("/products/".length);
  if (!relativePath || relativePath.includes("..") || relativePath.includes("\\")) return { path: imageUrl, exists: false };
  const productRoot = resolve("public", "products");
  const candidate = resolve(productRoot, relativePath);
  if (!candidate.startsWith(`${productRoot}/`)) return { path: imageUrl, exists: false };
  try {
    await access(candidate);
    return { path: imageUrl, exists: true };
  } catch {
    return { path: imageUrl, exists: false };
  }
}

async function listStorageObjects(supabase, folder = "") {
  const objects = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from("product-images").list(folder, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Storage-Manifest konnte nicht gelesen werden: ${error.message}`);
    for (const entry of data ?? []) {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.id) {
        objects.push({ path, id: entry.id, createdAt: entry.created_at ?? null, updatedAt: entry.updated_at ?? null, metadata: entry.metadata ?? null });
      } else {
        objects.push(...await listStorageObjects(supabase, path));
      }
    }
    if (!data || data.length < 1000) return objects;
    offset += data.length;
  }
}

function toLegacyList(row) {
  return {
    id: row.id,
    title: row.title,
    intro: row.intro,
    owner_user_id: row.owner_user_id,
    published_at: row.published_at,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toLegacyWish(row) {
  return {
    id: row.id,
    wishlist_id: row.wishlist_id,
    title: row.title,
    description: row.description,
    product_url: row.product_url,
    image_url: row.image_url,
    price_amount: row.price_amount,
    currency: row.currency,
    shop_name: row.shop_name,
    sort_order: row.sort_order,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    source_provider: row.source_provider,
    source_list_id: row.source_list_id,
    source_external_id: row.source_external_id,
    source_url: row.source_url,
  };
}

function toLegacyReservation(row) {
  return {
    id: row.id,
    wish_id: row.wish_id,
    guest_name: row.guest_name,
    manage_token_hash: row.manage_token_hash,
    password_hash: row.password_hash,
    reserved_at: row.reserved_at,
    cancelled_at: row.cancelled_at,
    fulfilled_at: row.fulfilled_at,
  };
}

async function capture(includeRecords) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL und ein serverseitiger Supabase-Secret-Key sind erforderlich.");
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const [{ data: list, error: listError }, { data: wishes, error: wishesError }] = await Promise.all([
    supabase.from("wishlists").select("id,title,intro,owner_user_id,published_at,archived_at,created_at,updated_at").eq("id", MATS_WISHLIST_ID).maybeSingle(),
    supabase.from("wishes").select("id,wishlist_id,title,description,product_url,image_url,price_amount,currency,shop_name,sort_order,archived_at,created_at,updated_at,source_provider,source_list_id,source_external_id,source_url").eq("wishlist_id", MATS_WISHLIST_ID).order("sort_order"),
  ]);
  if (listError) throw new Error(`Mats’ Liste konnte nicht geladen werden (${listError.code || listError.message || "unbekannter Fehler"}).`);
  if (!list) throw new Error("Mats’ Liste mit der erwarteten UUID wurde nicht gefunden.");
  if (wishesError) throw new Error(`Mats’ Wünsche konnten nicht geladen werden (${wishesError.code || wishesError.message || "unbekannter Fehler"}).`);

  const wishIds = (wishes ?? []).map((wish) => wish.id);
  const { data: reservations, error: reservationsError } = wishIds.length
    ? await supabase.from("reservations").select("id,wish_id,guest_name,manage_token_hash,password_hash,reserved_at,cancelled_at,fulfilled_at").in("wish_id", wishIds).order("id")
    : { data: [], error: null };
  if (reservationsError) throw new Error("Mats’ Reservierungen konnten nicht geladen werden.");

  const storageManifest = await listStorageObjects(supabase);
  const legacyList = toLegacyList(list);
  const legacyWishes = (wishes ?? []).map(toLegacyWish).sort((left, right) => left.id.localeCompare(right.id));
  const legacyReservations = (reservations ?? []).map(toLegacyReservation).sort((left, right) => left.id.localeCompare(right.id));
  const imageReferences = (wishes ?? []).map((wish) => ({
    wishId: wish.id,
    imageUrl: wish.image_url ?? null,
    storagePath: null,
    kind: classifyImage(wish.image_url, null),
  })).sort((left, right) => left.wishId.localeCompare(right.wishId));
  const localProductFiles = (await Promise.all((wishes ?? []).map((wish) => inspectLocalProductImage(wish.image_url)))).filter(Boolean);

  const baseline = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    matsWishlistId: MATS_WISHLIST_ID,
    expectedPlanReference: { wishes: EXPECTED_WISH_COUNT, reservations: EXPECTED_RESERVATION_COUNT },
    observed: {
      counts: { wishes: legacyWishes.length, reservations: legacyReservations.length },
      wishStatus: {
        active: legacyWishes.filter((wish) => wish.archived_at === null).length,
        archived: legacyWishes.filter((wish) => wish.archived_at !== null).length,
      },
      reservationStatus: {
        open: legacyReservations.filter((reservation) => reservation.cancelled_at === null).length,
        cancelled: legacyReservations.filter((reservation) => reservation.cancelled_at !== null).length,
        fulfilled: legacyReservations.filter((reservation) => reservation.fulfilled_at !== null).length,
      },
      wishIds: legacyWishes.map((wish) => wish.id),
      reservationIds: legacyReservations.map((reservation) => reservation.id),
      imageReferences,
      localProductFiles,
      missingLocalProductFiles: localProductFiles.filter((entry) => !entry.exists).length,
      storageObjectCount: storageManifest.length,
    },
    fingerprints: {
      wishlist: digest(legacyList),
      wishes: digest(legacyWishes),
      reservations: digest(legacyReservations),
      imageReferences: digest(imageReferences),
      localProductFiles: digest(localProductFiles),
      storageManifest: digest(storageManifest),
    },
  };
  if (includeRecords) {
    baseline.records = {
      wishlist: legacyList,
      wishes: legacyWishes,
      reservations: legacyReservations,
      storageManifest,
    };
  }
  return baseline;
}

function compareBaseline(before, after) {
  const keys = Object.keys(before.fingerprints);
  return keys.filter((key) => before.fingerprints[key] !== after.fingerprints[key]);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const baseline = await capture(args.includeRecords);
  const defaultName = `mats-baseline-${baseline.generatedAt.replace(/[:.]/g, "-")}.json`;
  const outputPath = resolve(args.output ?? `.baseline/${defaultName}`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600 });

  const expectedCountsMatch = baseline.observed.counts.wishes === EXPECTED_WISH_COUNT
    && baseline.observed.counts.reservations === EXPECTED_RESERVATION_COUNT
    && baseline.observed.missingLocalProductFiles === 0;
  console.log(JSON.stringify({ outputPath, counts: baseline.observed.counts, wishStatus: baseline.observed.wishStatus, missingLocalProductFiles: baseline.observed.missingLocalProductFiles, expectedCountsMatch, fingerprints: baseline.fingerprints }, null, 2));

  if (args.compare) {
    const previous = JSON.parse(await readFile(resolve(args.compare), "utf8"));
    const changed = compareBaseline(previous, baseline);
    if (changed.length) {
      console.error(`Mats-Regression: abweichende Fingerprints: ${changed.join(", ")}`);
      process.exitCode = 2;
    }
  }
  if (!expectedCountsMatch) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Baseline konnte nicht erstellt werden.");
  process.exitCode = 1;
});
