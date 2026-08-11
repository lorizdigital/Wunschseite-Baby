import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * A destructive-but-self-cleaning acceptance test for the isolated staging
 * project. It deliberately requires explicit environment guards so that a
 * copied production configuration cannot be used by accident.
 *
 * Run with:
 *   npm run test:staging
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const environment = process.env.STAGING_ENVIRONMENT;
const confirmation = process.env.STAGING_ACCEPTANCE_CONFIRMATION;
const stagingProjectRef = process.env.STAGING_SUPABASE_PROJECT_REF;
const stagingDatabaseUrl = process.env.STAGING_DATABASE_URL;
const cleanupConfirmation = process.env.STAGING_CLEANUP_CONFIRMATION;
// The existing Mats project is never an acceptance-test target. Keep this
// project-specific guard even if a staging env file is copied by mistake.
const productionProjectRefs = new Set(["nnrkbdduiiebdahwcofa"]);
const expectedStagingProjectRef = "jmuyamvkiirdxsvglxfa";
const acceptanceEmailDomain = "staging-acceptance.invalid";

// This SQL intentionally contains no interpolated values. The only selector is
// our own account marker plus the reserved test-only email domain, so a stale
// run can be removed before or after every acceptance test without touching
// ordinary staging data.
const cleanupSql = `do $cleanup$
begin
create temporary table staging_acceptance_test_users (
  id uuid primary key
) on commit drop;

insert into staging_acceptance_test_users (id)
select candidate.id
from auth.users as candidate
where lower(candidate.email) ~ '^[^@]+@staging-acceptance[.]invalid$'
  and nullif(candidate.raw_user_meta_data ->> 'staging_acceptance_run', '') is not null
  and candidate.raw_user_meta_data ->> 'staging_acceptance_label' in ('A', 'B', 'C');

create temporary table staging_acceptance_test_wishlists (
  id uuid primary key
) on commit drop;

insert into staging_acceptance_test_wishlists (id)
select distinct list.id
from public.wishlists as list
left join public.wishlist_members as member on member.wishlist_id = list.id
where list.owner_user_id in (select id from staging_acceptance_test_users)
   or member.user_id in (select id from staging_acceptance_test_users);

delete from public.storage_deletion_queue as queue
using staging_acceptance_test_wishlists as list
where queue.object_path like list.id::text || '/%';

delete from public.reservation_idempotency as request
where request.wishlist_id in (select id from staging_acceptance_test_wishlists)
   or request.wish_id in (
     select wish.id
     from public.wishes as wish
     where wish.wishlist_id in (select id from staging_acceptance_test_wishlists)
   );

delete from public.reservations as reservation
using public.wishes as wish
where reservation.wish_id = wish.id
  and wish.wishlist_id in (select id from staging_acceptance_test_wishlists);

delete from public.wishes as wish
where wish.wishlist_id in (select id from staging_acceptance_test_wishlists);

delete from public.wishlist_invitations as invitation
where invitation.wishlist_id in (select id from staging_acceptance_test_wishlists);

delete from public.wishlists as list
where list.id in (select id from staging_acceptance_test_wishlists);

delete from public.profiles as profile
where profile.user_id in (select id from staging_acceptance_test_users);

delete from auth.users as candidate
where candidate.id in (select id from staging_acceptance_test_users);

end
$cleanup$;
`;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function errorSummary(error) {
  return error?.message ? String(error.message).replaceAll(/[\r\n]+/g, " ").slice(0, 300) : "unbekannter Fehler";
}

function requireSuccess(result, label) {
  if (result.error) fail(`${label}: ${errorSummary(result.error)}`);
  return result.data;
}

function requireSingleRow(data, label) {
  assert(Array.isArray(data) && data.length === 1 && data[0], `${label}: genau eine Ergebniszeile erwartet.`);
  return data[0];
}

function validateProjectRef(value) {
  assert(typeof value === "string" && /^[a-z0-9]{20}$/.test(value), "STAGING_SUPABASE_PROJECT_REF ist ungültig.");
  assert(!productionProjectRefs.has(value), "Die konfigurierte Projektkennung gehört zum Produktionsprojekt; Test wird abgebrochen.");
  assert(value === expectedStagingProjectRef, "Der Abnahmetest darf ausschließlich das fest hinterlegte Staging-Projekt verwenden.");
  return value;
}

function validateDatabaseUrl(value, projectRef) {
  assert(value, "STAGING_DATABASE_URL fehlt.");
  assert(!/[\u0000-\u001f\u007f\s]/.test(value), "STAGING_DATABASE_URL enthält unzulässige Steuer- oder Leerzeichen.");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("STAGING_DATABASE_URL ist keine gültige PostgreSQL-Verbindungs-URL.");
  }

  assert(["postgres:", "postgresql:"].includes(parsed.protocol), "STAGING_DATABASE_URL muss postgres:// oder postgresql:// verwenden.");
  assert(parsed.password, "STAGING_DATABASE_URL enthält kein Passwort.");
  assert(parsed.pathname === "/postgres", "STAGING_DATABASE_URL darf nur die Datenbank 'postgres' adressieren.");

  const username = decodeURIComponent(parsed.username);
  const directHost = `db.${projectRef}.supabase.co`;
  const isDirectConnection = parsed.hostname === directHost;
  const isPoolerConnection = parsed.hostname.endsWith(".pooler.supabase.com");
  assert(
    isDirectConnection || isPoolerConnection,
    "STAGING_DATABASE_URL muss eine direkte Supabase-DB- oder Pooler-Verbindung verwenden.",
  );
  assert(
    isDirectConnection ? username === "postgres" : username === `postgres.${projectRef}`,
    "STAGING_DATABASE_URL passt nicht zur angegebenen Staging-Projektkennung.",
  );

  return { value, parsed };
}

function validateConfiguration() {
  assert(url, "NEXT_PUBLIC_SUPABASE_URL fehlt.");
  assert(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.");
  assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_SECRET_KEY fehlt.");
  assert(environment === "staging", "STAGING_ENVIRONMENT muss exakt 'staging' sein.");
  assert(
    confirmation === "run-staging-acceptance",
    "STAGING_ACCEPTANCE_CONFIRMATION muss exakt 'run-staging-acceptance' sein.",
  );
  assert(
    cleanupConfirmation === "cleanup-staging-acceptance",
    "STAGING_CLEANUP_CONFIRMATION muss exakt 'cleanup-staging-acceptance' sein.",
  );

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL ist keine gültige URL.");
  }

  assert(parsedUrl.protocol === "https:", "Der Abnahmetest akzeptiert nur eine HTTPS-Staging-URL.");
  const projectRef = validateProjectRef(stagingProjectRef);
  assert(
    parsedUrl.hostname === `${projectRef}.supabase.co` && parsedUrl.pathname === "/",
    "NEXT_PUBLIC_SUPABASE_URL muss exakt zur angegebenen Supabase-Staging-Projektkennung passen.",
  );

  return {
    database: validateDatabaseUrl(stagingDatabaseUrl, projectRef),
    projectRef,
  };
}

async function signInAs(urlValue, key, email, password, label) {
  const client = createClient(urlValue, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user || !result.data.session) {
    fail(`${label}-Anmeldung fehlgeschlagen: ${errorSummary(result.error)}`);
  }
  return client;
}

async function createTestUser(admin, email, password, label, runId) {
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { staging_acceptance_run: runId, staging_acceptance_label: label },
  });
  if (result.error || !result.data.user) fail(`${label}-Testkonto konnte nicht angelegt werden: ${errorSummary(result.error)}`);
  return result.data.user.id;
}

function redactedCliDetail(value, database) {
  const redactions = new Set([database.value, database.parsed.password]);
  try {
    redactions.add(decodeURIComponent(database.parsed.password));
  } catch {
    // The URL constructor already accepted the value. Retain the encoded form.
  }

  let detail = String(value ?? "");
  for (const secret of redactions) {
    if (secret) detail = detail.replaceAll(secret, "[redacted]");
  }
  return detail.replaceAll(/[\r\n]+/g, " ").trim().slice(0, 500);
}

async function runSupabaseDbQuery(database, sqlPath) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      command,
      ["--no-install", "supabase", "db", "query", "--db-url", database.value, "--file", sqlPath, "--output-format", "json"],
      {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-8_192);
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => reject(error));
    child.once("close", (exitCode, signal) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      const detail = redactedCliDetail(
        [stderr, stdout].filter(Boolean).join(" | ") || `Exit-Code ${exitCode ?? "unbekannt"}${signal ? ` (${signal})` : ""}`,
        database,
      );
      reject(new Error(`Postgres-Admin-Bereinigung fehlgeschlagen: ${detail || "unbekannter CLI-Fehler"}`));
    });
  });
}

async function cleanupStagingAcceptanceData(database) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "wishlist-staging-acceptance-"));
  const sqlPath = join(tempDirectory, "cleanup.sql");
  try {
    await writeFile(sqlPath, cleanupSql, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await runSupabaseDbQuery(database, sqlPath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function run() {
  const configuration = validateConfiguration();

  const runId = `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const password = `Staging-${randomUUID()}-9`;
  const emailA = `wishlist-a-${runId}@${acceptanceEmailDomain}`;
  const emailB = `wishlist-b-${runId}@${acceptanceEmailDomain}`;
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  let primaryError;

  console.log(`Staging-Abnahmetest gestartet (${runId}).`);

  try {
    await cleanupStagingAcceptanceData(configuration.database);
    await createTestUser(admin, emailA, password, "A", runId);
    await createTestUser(admin, emailB, password, "B", runId);
    const userC = await createTestUser(
      admin,
      `wishlist-c-${runId}@${acceptanceEmailDomain}`,
      password,
      "C",
      runId,
    );
    const provisionedList = requireSingleRow(
      requireSuccess(
        await admin.rpc("provision_wishlist_v1", {
          p_user_id: userC,
          p_title: `Beta-Abnahme ${runId}`,
          p_intro: "Automatischer Closed-Beta-Regressionsfall.",
          p_display_name: "Abnahme Elternteil C",
        }),
        "Closed-Beta-Liste über provision_wishlist_v1 anlegen",
      ),
      "Closed-Beta-Liste über provision_wishlist_v1 anlegen",
    );
    assert(
      typeof provisionedList.public_slug === "string" && provisionedList.public_slug.length >= 22,
      "Die Closed-Beta-Liste hat keinen sicheren öffentlichen Slug.",
    );
    const [clientA, clientB] = await Promise.all([
      signInAs(url, publishableKey, emailA, password, "A"),
      signInAs(url, publishableKey, emailB, password, "B"),
    ]);

    const rejectedUnprotectedList = await clientA.rpc("create_wishlist_v2", {
      p_title: `Ungeschuetzte Abnahme ${runId}`,
      p_intro: "Dieser Aufruf muss atomar abgelehnt werden.",
      p_display_name: "Abnahme Elternteil A",
      p_access_code: "zu-kurz",
    });
    assert(Boolean(rejectedUnprotectedList.error), "create_wishlist_v2 akzeptiert einen zu kurzen Zugangscode.");
    const contextAfterRejectedCreation = requireSuccess(
      await clientA.rpc("get_my_wishlist_context_v1"),
      "Listen-Kontext nach abgelehntem Pflichtcode",
    );
    assert(
      Array.isArray(contextAfterRejectedCreation) && contextAfterRejectedCreation.length === 0,
      "Der abgelehnte Pflichtcode hat dennoch eine Liste oder Mitgliedschaft angelegt.",
    );

    const listA = requireSingleRow(
      requireSuccess(
        await clientA.rpc("create_wishlist_v2", {
          p_title: `Abnahme A ${runId}`,
          p_intro: "Automatischer Staging-Abnahmetest.",
          p_display_name: "Abnahme Elternteil A",
          p_access_code: `Abnahme-A-${runId}`,
        }),
        "Geschützte Liste A über create_wishlist_v2 anlegen",
      ),
      "Geschützte Liste A über create_wishlist_v2 anlegen",
    );

    const listB = requireSingleRow(
      requireSuccess(
        await clientB.rpc("create_wishlist_v2", {
          p_title: `Abnahme B ${runId}`,
          p_intro: "Automatischer Staging-Abnahmetest.",
          p_display_name: "Abnahme Elternteil B",
          p_access_code: `Abnahme-B-${runId}`,
        }),
        "Geschützte Liste B über create_wishlist_v2 anlegen",
      ),
      "Geschützte Liste B über create_wishlist_v2 anlegen",
    );
    assert(typeof listA.public_slug === "string" && listA.public_slug.length >= 22, "Liste A hat keinen sicheren öffentlichen Slug.");
    assert(typeof listB.public_slug === "string" && listB.public_slug.length >= 22, "Liste B hat keinen sicheren öffentlichen Slug.");
    const protectionA = requireSingleRow(
      requireSuccess(
        await clientA.from("wishlists").select("visibility,access_code_version").eq("id", listA.wishlist_id),
        "Pflichtschutz von Liste A lesen",
      ),
      "Pflichtschutz von Liste A lesen",
    );
    assert(
      protectionA.visibility === "access_code" && typeof protectionA.access_code_version === "string",
      "create_wishlist_v2 hat Liste A nicht vollständig mit einem Zugangscode geschützt.",
    );

    const draftPublicContext = requireSuccess(
      await admin.rpc("get_public_wishlist_context_v1", { p_public_slug: listA.public_slug }),
      "Entwurfsstatus über get_public_wishlist_context_v1 prüfen",
    );
    assert(Array.isArray(draftPublicContext) && draftPublicContext.length === 0, "Eine unveröffentlichte Liste ist öffentlich lesbar.");

    const wishA = requireSingleRow(
      requireSuccess(
        await clientA.rpc("create_wish_v1", {
          p_wishlist_id: listA.wishlist_id,
          p_title: `Reservierungswunsch ${runId}`,
          p_description: "Nur Staging-Testdaten.",
        }),
        "Wunsch A anlegen",
      ),
      "Wunsch A anlegen",
    );
    requireSingleRow(
      requireSuccess(
        await clientB.rpc("create_wish_v1", {
          p_wishlist_id: listB.wishlist_id,
          p_title: `Isolationswunsch ${runId}`,
        }),
        "Wunsch B anlegen",
      ),
      "Wunsch B anlegen",
    );

    const [contextA, contextB] = await Promise.all([
      clientA.rpc("get_my_wishlist_context_v1"),
      clientB.rpc("get_my_wishlist_context_v1"),
    ]);
    const ownListsA = requireSuccess(contextA, "Listen-Kontext A");
    const ownListsB = requireSuccess(contextB, "Listen-Kontext B");
    assert(ownListsA.some((list) => list.wishlist_id === listA.wishlist_id), "A sieht die eigene Liste nicht.");
    assert(!ownListsA.some((list) => list.wishlist_id === listB.wishlist_id), "A sieht die Liste von B im eigenen Kontext.");
    assert(ownListsB.some((list) => list.wishlist_id === listB.wishlist_id), "B sieht die eigene Liste nicht.");
    assert(!ownListsB.some((list) => list.wishlist_id === listA.wishlist_id), "B sieht die Liste von A im eigenen Kontext.");

    const [foreignList, foreignWishes, foreignMembers, foreignMemberRpc, foreignMutation] = await Promise.all([
      clientA.from("wishlists").select("id").eq("id", listB.wishlist_id),
      clientA.from("wishes").select("id").eq("wishlist_id", listB.wishlist_id),
      clientA.from("wishlist_members").select("user_id").eq("wishlist_id", listB.wishlist_id),
      clientA.rpc("get_wishlist_members_v1", { p_wishlist_id: listB.wishlist_id }),
      clientA.rpc("update_wishlist_details_v1", {
        p_wishlist_id: listB.wishlist_id,
        p_title: "Unzulässiger Mandantenwechsel",
        p_intro: "",
      }),
    ]);
    assert(!foreignList.error && (foreignList.data ?? []).length === 0, "A kann die Liste von B direkt lesen.");
    assert(!foreignWishes.error && (foreignWishes.data ?? []).length === 0, "A kann Wünsche von B direkt lesen.");
    assert(!foreignMembers.error && (foreignMembers.data ?? []).length === 0, "A kann Mitglieder von B direkt lesen.");
    assert(Boolean(foreignMemberRpc.error), "A kann die Mitglieder-RPC für B ausführen.");
    assert(Boolean(foreignMutation.error), "A kann die Liste von B verändern.");

    requireSuccess(
      await clientA.rpc("publish_wishlist_v1", { p_wishlist_id: listA.wishlist_id }),
      "Liste A veröffentlichen",
    );
    const publicPage = requireSingleRow(
      requireSuccess(
        await admin.rpc("get_public_wishlist_page_v1", { p_public_slug: listA.public_slug }),
        "Öffentliche Seite über get_public_wishlist_page_v1 laden",
      ),
      "Öffentliche Seite über get_public_wishlist_page_v1 laden",
    );
    assert(publicPage.wishlist_id === listA.wishlist_id, "Die öffentliche RPC löst die falsche Liste auf.");
    assert(Array.isArray(publicPage.wishes) && publicPage.wishes.length === 1, "Die öffentliche RPC liefert nicht genau den aktiven Wunsch von A.");
    assert(publicPage.wishes[0]?.id === wishA.wish_id, "Die öffentliche RPC liefert einen falschen Wunsch.");
    assert(!Object.hasOwn(publicPage.wishes[0], "wishlist_id"), "Die öffentliche RPC gibt den internen Mandantenschlüssel eines Wunsches aus.");
    const idempotencyKey = `staging-${runId}-${randomUUID().replaceAll("-", "")}`;
    const firstReservation = requireSingleRow(
      requireSuccess(
        await admin.rpc("reserve_wish_v3", {
          p_wishlist_id: listA.wishlist_id,
          p_wish_id: wishA.wish_id,
          p_guest_name: "Staging Gast",
          p_password: password,
          p_idempotency_key: idempotencyKey,
        }),
        "Öffentliche Reservierung über reserve_wish_v3",
      ),
      "Öffentliche Reservierung über reserve_wish_v3",
    );
    assert(firstReservation.replayed === false, "Die erste Reservierung wurde fälschlich als Wiederholung markiert.");
    const reservedStatus = requireSuccess(
      await admin.rpc("get_public_reservation_status_v1", { p_wishlist_id: listA.wishlist_id }),
      "Öffentlichen Reservierungsstatus prüfen",
    );
    assert(
      Array.isArray(reservedStatus) && reservedStatus.some((reservation) => reservation.wish_id === wishA.wish_id),
      "Der öffentliche Reservierungsstatus enthält den reservierten Wunsch nicht.",
    );

    const repeatedReservation = requireSingleRow(
      requireSuccess(
        await admin.rpc("reserve_wish_v3", {
          p_wishlist_id: listA.wishlist_id,
          p_wish_id: wishA.wish_id,
          p_guest_name: "Staging Gast",
          p_password: password,
          p_idempotency_key: idempotencyKey,
        }),
        "Reservierung mit gleichem Idempotency-Key wiederholen",
      ),
      "Reservierung mit gleichem Idempotency-Key wiederholen",
    );
    assert(
      repeatedReservation.replayed === true && repeatedReservation.reservation_id === firstReservation.reservation_id,
      "Der Idempotency-Key liefert nicht dieselbe Reservierung zurück.",
    );

    const competingReservation = await admin.rpc("reserve_wish_v3", {
      p_wishlist_id: listA.wishlist_id,
      p_wish_id: wishA.wish_id,
      p_guest_name: "Zweiter Staging Gast",
      p_password: password,
      p_idempotency_key: `staging-${runId}-${randomUUID().replaceAll("-", "")}`,
    });
    assert(Boolean(competingReservation.error), "Eine zweite offene Reservierung für denselben Wunsch wurde zugelassen.");

    const cancelled = requireSuccess(
      await admin.rpc("cancel_reservation_v2", {
        p_wishlist_id: listA.wishlist_id,
        p_wish_id: wishA.wish_id,
        p_password: password,
      }),
      "Öffentliche Reservierung über cancel_reservation_v2 freigeben",
    );
    assert(cancelled === true, "Die Reservierung ließ sich mit dem korrekten Passwort nicht freigeben.");
    const releasedStatus = requireSuccess(
      await admin.rpc("get_public_reservation_status_v1", { p_wishlist_id: listA.wishlist_id }),
      "Freigegebenen öffentlichen Reservierungsstatus prüfen",
    );
    assert(
      Array.isArray(releasedStatus) && !releasedStatus.some((reservation) => reservation.wish_id === wishA.wish_id),
      "Der öffentliche Reservierungsstatus enthält einen bereits freigegebenen Wunsch.",
    );

    console.log("Staging-Abnahmetest erfolgreich: Schema/RPCs, Mandantentrennung, öffentliche Lesestrecke und Reservierungsablauf bestätigt.");
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error("Unbekannter Testfehler.");
  } finally {
    try {
      await cleanupStagingAcceptanceData(configuration.database);
      console.log("Temporäre und verwaiste Staging-Testdaten wurden per Postgres-Admin entfernt.");
    } catch (cleanupError) {
      const detail = cleanupError instanceof Error ? cleanupError.message : "Unbekannter Aufräumfehler.";
      primaryError = primaryError ? new Error(`${primaryError.message} | ${detail}`) : new Error(detail);
    }
  }

  if (primaryError) fail(primaryError.message);
}

run().catch((error) => {
  console.error(`Staging-Abnahmetest fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler."}`);
  process.exitCode = 1;
});
