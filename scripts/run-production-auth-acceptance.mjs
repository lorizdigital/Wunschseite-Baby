import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Self-cleaning production smoke test for the complete passwordless app flow.
 * It never sends an email and only deletes records owned by the exact test user
 * created during this run.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const appOrigin = process.env.PRODUCTION_ACCEPTANCE_ORIGIN;
const confirmation = process.env.PRODUCTION_AUTH_ACCEPTANCE_CONFIRMATION;
const expectedProjectRef = "nnrkbdduiiebdahwcofa";
const expectedOrigin = "https://xn--wnschi-3ya.de";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message ?? error ?? "unbekannter Fehler").replaceAll(/[\r\n]+/g, " ").slice(0, 400);
}

async function json(response) {
  return response.json().catch(() => ({}));
}

function requireConfiguration() {
  assert(confirmation === "run-wuenschi-production-auth-acceptance", "Explizite Produktionsbestätigung fehlt.");
  assert(appOrigin === expectedOrigin, `PRODUCTION_ACCEPTANCE_ORIGIN muss exakt ${expectedOrigin} sein.`);
  assert(supabaseUrl && serviceRoleKey, "Supabase-Produktionskonfiguration fehlt.");
  const parsed = new URL(supabaseUrl);
  assert(parsed.protocol === "https:" && parsed.hostname === `${expectedProjectRef}.supabase.co`, "Supabase-Projekt ist nicht das erwartete Produktionsprojekt.");
}

function createCookieJar() {
  const values = new Map();
  return {
    absorb(headers) {
      for (const header of headers.getSetCookie()) {
        const pair = header.slice(0, header.indexOf(";"));
        const separator = pair.indexOf("=");
        if (separator < 1) continue;
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(header)) values.delete(name);
        else values.set(name, value);
      }
    },
    header() {
      return [...values].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    get size() {
      return values.size;
    },
  };
}

async function main() {
  requireConfiguration();
  const runId = randomUUID();
  const email = `codex-auth-${runId}@production-acceptance.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let userId = null;
  let createdWishlistId = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { production_acceptance_run: runId },
    });
    if (created.error || !created.data.user) throw new Error(`Testkonto: ${safeError(created.error)}`);
    userId = created.data.user.id;

    const userClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const signedIn = await userClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error(`Direkte Testanmeldung: ${safeError(signedIn.error)}`);

    const emptyContext = await userClient.rpc("get_my_wishlist_context_v1");
    if (emptyContext.error) throw new Error(`RPC für neues Konto: ${safeError(emptyContext.error)}`);
    assert(Array.isArray(emptyContext.data) && emptyContext.data.length === 0, "Ein neues Testkonto darf keine vorhandenen Listen sehen.");

    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appOrigin}/auth/callback` },
    });
    const tokenHash = generated.data?.properties?.hashed_token;
    if (generated.error || !tokenHash) throw new Error(`Magic-Link-Erzeugung: ${safeError(generated.error)}`);

    const cookies = createCookieJar();
    const callbackUrl = new URL("/auth/callback", appOrigin);
    callbackUrl.searchParams.set("token_hash", tokenHash);
    callbackUrl.searchParams.set("type", "magiclink");
    const callback = await fetch(callbackUrl, { redirect: "manual" });
    cookies.absorb(callback.headers);
    assert([303, 307].includes(callback.status) && callback.headers.get("location") === `${appOrigin}/app`, `Callback lieferte ${callback.status} ohne Weiterleitung auf /app.`);
    assert(cookies.size > 0, "Callback hat keine Sitzungscookies gesetzt.");

    const withSession = (path, init = {}) => fetch(new URL(path, appOrigin), {
      ...init,
      redirect: init.redirect ?? "manual",
      headers: { Cookie: cookies.header(), ...(init.headers ?? {}) },
    });

    const appPage = await withSession("/app");
    const appHtml = await appPage.text();
    assert(appPage.status === 200, `/app lieferte ${appPage.status}.`);
    assert(appHtml.includes("Lege deine erste Wunschliste an"), "Leerer Konto-Zustand wird auf /app nicht korrekt angezeigt.");

    const apiContext = await withSession("/api/app/wishlists");
    const apiContextBody = await json(apiContext);
    assert(apiContext.status === 200 && Array.isArray(apiContextBody.lists) && apiContextBody.lists.length === 0, `Listen-API für neues Konto lieferte ${apiContext.status}.`);

    const profile = await withSession("/api/app/account/profile", {
      method: "PATCH",
      headers: { Origin: appOrigin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Codex Abnahmetest" }),
    });
    const profileBody = await json(profile);
    assert(profile.status === 200 && profileBody.profile?.display_name === "Codex Abnahmetest", `Profil-Speichern lieferte ${profile.status}.`);

    const createList = await withSession("/api/app/wishlists", {
      method: "POST",
      headers: { Origin: appOrigin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Codex Produktions-Abnahmetest", intro: "Automatisch angelegt und direkt wieder entfernt.", displayName: "Codex Abnahmetest", accessCode: "Familie-Codex-2026" }),
    });
    const createListBody = await json(createList);
    createdWishlistId = createListBody.list?.wishlist_id ?? null;
    assert(createList.status === 201 && createdWishlistId, `Listenerstellung lieferte ${createList.status}: ${safeError(createListBody.error)}.`);

    const productImport = await withSession(`/api/app/wishlists/${createdWishlistId}/product-import`, {
      method: "POST",
      headers: { Origin: appOrigin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.apple.com/de/iphone/" }),
    });
    const productImportBody = await json(productImport);
    assert(
      productImport.status === 200 && productImportBody.draft?.title && productImportBody.draft?.imageUrl,
      `Produktimport lieferte ${productImport.status}: ${safeError(productImportBody.error)}.`,
    );

    const createWish = await withSession(`/api/app/wishlists/${createdWishlistId}/wishes`, {
      method: "POST",
      headers: { Origin: appOrigin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: productImportBody.draft.title,
        description: productImportBody.draft.description ?? "",
        productUrl: productImportBody.draft.sourceUrl,
        imageUrl: productImportBody.draft.imageUrl,
        priceAmount: null,
        currency: "EUR",
        shopName: productImportBody.draft.shop,
      }),
    });
    const createWishBody = await json(createWish);
    assert(
      createWish.status === 201 && createWishBody.wish?.wish_id && createWishBody.wish?.image_url?.includes("/product-images/"),
      `Wunsch- und Bildspeicherung lieferte ${createWish.status}: ${safeError(createWishBody.error)}.`,
    );
    const storedWish = await admin
      .from("wishes")
      .select("image_storage_path")
      .eq("id", createWishBody.wish.wish_id)
      .single();
    if (storedWish.error || !storedWish.data?.image_storage_path) throw new Error(`Produktbildpfad fehlt: ${safeError(storedWish.error)}.`);
    const storedImagePath = storedWish.data.image_storage_path;

    const publish = await withSession(`/api/app/wishlists/${createdWishlistId}/publish`, {
      method: "POST",
      headers: { Origin: appOrigin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: "{}",
    });
    const publishBody = await json(publish);
    assert(publish.status === 200 && publishBody.publishedAt, `Veröffentlichung lieferte ${publish.status}.`);

    const populatedPage = await withSession("/app");
    const populatedHtml = await populatedPage.text();
    assert(populatedPage.status === 200 && populatedHtml.includes("Codex Produktions-Abnahmetest"), "Angelegte Liste erscheint nicht in /app.");

    const immediateDelete = await withSession(`/api/app/wishlists/${createdWishlistId}/deletion?mode=immediate`, {
      method: "POST",
      headers: { Origin: appOrigin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_immediately", expectedTitle: "Codex Produktions-Abnahmetest" }),
    });
    const immediateDeleteBody = await json(immediateDelete);
    assert(immediateDelete.status === 200 && immediateDeleteBody.deleted === true, `Sofortlöschung lieferte ${immediateDelete.status}: ${safeError(immediateDeleteBody.error ?? JSON.stringify(immediateDeleteBody))}.`);

    const deletedList = await admin.from("wishlists").select("id").eq("id", createdWishlistId).maybeSingle();
    if (deletedList.error) throw new Error(`Kontrolle der Sofortlöschung: ${safeError(deletedList.error)}.`);
    assert(!deletedList.data, "Die sofort gelöschte Liste ist noch in der Datenbank vorhanden.");
    const deletedImage = await admin.storage.from("product-images").download(storedImagePath);
    assert(Boolean(deletedImage.error), "Das Produktbild der sofort gelöschten Liste ist noch im Storage vorhanden.");
    await admin.from("storage_deletion_queue").delete().eq("object_path", storedImagePath).not("completed_at", "is", null);

    const afterDeletePage = await withSession("/app");
    const afterDeleteHtml = await afterDeletePage.text();
    assert(afterDeletePage.status === 200 && !afterDeleteHtml.includes("Codex Produktions-Abnahmetest"), "Die sofort gelöschte Liste erscheint weiterhin im Dashboard.");

    const logout = await withSession("/auth/logout", {
      method: "POST",
      headers: { Origin: appOrigin, "Sec-Fetch-Site": "same-origin" },
    });
    cookies.absorb(logout.headers);
    assert(logout.status === 303 && logout.headers.get("location")?.endsWith("/login?logged_out=1"), `Logout lieferte ${logout.status}.`);

    const afterLogout = await withSession("/app");
    assert([303, 307, 308].includes(afterLogout.status) && afterLogout.headers.get("location")?.includes("/login"), "Sitzung ist nach dem Logout weiterhin aktiv.");

    const wwwOrigin = "https://www.xn--wnschi-3ya.de";
    const wwwLogin = await fetch(`${wwwOrigin}/login`, { redirect: "manual" });
    assert(wwwLogin.status === 308 && wwwLogin.headers.get("location") === `${appOrigin}/login`, "www wird nicht kanonisch auf die Hauptdomain umgeleitet.");
    const wwwLogout = await fetch(`${wwwOrigin}/auth/logout`, {
      method: "POST",
      redirect: "manual",
      headers: { Origin: wwwOrigin, "Sec-Fetch-Site": "same-origin" },
    });
    assert(wwwLogout.status === 303 && wwwLogout.headers.get("location")?.endsWith("/login?logged_out=1"), "Ein vorhandener www-Logout wird nicht sicher verarbeitet.");

    console.log("PASS: Magic Link, Pflichtcode, Produktbild, Veröffentlichung, Dashboard, Sofortlöschung und Logout funktionieren in Produktion.");
  } finally {
    if (userId) {
      const owned = await admin.from("wishlists").select("id").eq("owner_user_id", userId);
      if (owned.error) throw new Error(`Cleanup-Listenabfrage: ${safeError(owned.error)}`);
      for (const list of owned.data ?? []) {
        const storedImages = await admin.from("wishes").select("image_storage_path").eq("wishlist_id", list.id).not("image_storage_path", "is", null);
        if (storedImages.error) throw new Error(`Cleanup-Bildabfrage: ${safeError(storedImages.error)}`);
        const paths = (storedImages.data ?? []).map((wish) => wish.image_storage_path).filter(Boolean);
        if (paths.length) {
          const removedImages = await admin.storage.from("product-images").remove(paths);
          if (removedImages.error) throw new Error(`Cleanup-Produktbilder: ${safeError(removedImages.error)}`);
        }
        const removed = await admin.from("wishlists").delete().eq("id", list.id).eq("owner_user_id", userId);
        if (removed.error) throw new Error(`Cleanup-Liste ${list.id}: ${safeError(removed.error)}`);
      }
      const removedUser = await admin.auth.admin.deleteUser(userId);
      if (removedUser.error) throw new Error(`Cleanup-Testkonto: ${safeError(removedUser.error)}`);
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${safeError(error)}`);
  process.exitCode = 1;
});
