import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const expectedWorkerName = "wuenschi";
const expectedZone = "xn--wnschi-3ya.de";
const expectedProjectRef = "nnrkbdduiiebdahwcofa";
const expectedConfirmation = "deploy-wuenschi-production";
const expectedRoutes = new Set(["www.wünschi.de/*", "wünschi.de/*"]);
const preflightOnly = process.argv.slice(2).includes("--preflight-only");

const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== "--preflight-only");
if (unexpectedArguments.length) fail(`Unbekannte Argumente: ${unexpectedArguments.join(", ")}.`);

// These bindings still exist as encrypted Cloudflare bindings. Some contain
// non-secret configuration today; they stay in place during the transition so
// this safety change cannot alter production runtime values.
const requiredRemoteBindings = Object.freeze([
  "ADMIN_IMPORT_SECRET",
  "APP_ORIGIN",
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "INTERNAL_CRON_SECRET",
  "INTERNAL_PROVISIONING_SECRET",
  "LEGACY_MATS_ADMIN_ENABLED",
  "MATS_ACCESS_CODE",
  "MATS_ACCESS_CODE_VERSION",
  "MULTI_WISHLIST_ENABLED",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "PRODUCT_IMPORT_ENABLED",
  "PUBLICATION_ENABLED",
  "PUBLIC_WISHLIST_ACCESS_SESSION_SECRET",
  "SUPABASE_SECRET_KEY",
]);

const runtimeBindingsExcludedFromBuild = new Set([
  ...requiredRemoteBindings,
  "BREVO_INVITATION_TEMPLATE_ID",
  "BREVO_REPLY_TO_EMAIL",
  "SELF_SERVICE_SIGNUP_ENABLED",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

const cloudflareCredentialsExcludedFromBuild = Object.freeze([
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_EMAIL",
]);

function fail(message) {
  throw new Error(message);
}

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} fehlt.`);
  return value;
}

function requireExact(name, expected) {
  const value = requireValue(name);
  if (value !== expected) fail(`${name} hat nicht den freigegebenen Produktionswert.`);
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

async function loadWranglerConfig() {
  const configPath = join(process.cwd(), "wrangler.jsonc");
  try {
    // The repository keeps this JSONC file valid as plain JSON so the deploy
    // guard can inspect the exact configuration without another parser.
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    fail(`wrangler.jsonc konnte nicht eindeutig gelesen werden: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateWranglerTarget(config) {
  if (config.name !== expectedWorkerName) fail("wrangler.jsonc verweist nicht auf den freigegebenen Produktions-Worker.");
  if (config.workers_dev !== false) fail("workers_dev muss für den Produktions-Worker deaktiviert bleiben.");
  if (config.keep_vars !== true) fail("keep_vars muss während der Variablen-Übergangsphase aktiviert bleiben.");

  const configuredRoutes = new Set();
  for (const route of config.routes ?? []) {
    if (route?.zone_name !== expectedZone || typeof route.pattern !== "string") {
      fail("wrangler.jsonc enthält eine nicht freigegebene Produktionsroute.");
    }
    configuredRoutes.add(route.pattern);
  }
  const missingRoutes = setDifference(expectedRoutes, configuredRoutes);
  const unexpectedRoutes = setDifference(configuredRoutes, expectedRoutes);
  if (missingRoutes.length || unexpectedRoutes.length) {
    fail(`Produktionsrouten stimmen nicht exakt: fehlend [${missingRoutes.join(", ")}], unerwartet [${unexpectedRoutes.join(", ")}].`);
  }

  const configuredRequired = new Set(config.secrets?.required ?? []);
  const expectedRequired = new Set(requiredRemoteBindings);
  const missingRequired = setDifference(expectedRequired, configuredRequired);
  const unexpectedRequired = setDifference(configuredRequired, expectedRequired);
  if (missingRequired.length || unexpectedRequired.length) {
    fail(`secrets.required stimmt nicht mit dem Deploy-Guard überein: fehlend [${missingRequired.join(", ")}], unerwartet [${unexpectedRequired.join(", ")}].`);
  }
}

function validatePublicBuildInputs() {
  requireExact("CLOUDFLARE_DEPLOY_TARGET", "production");
  requireExact("CLOUDFLARE_PRODUCTION_DEPLOY_CONFIRMATION", expectedConfirmation);

  let supabaseUrl;
  try {
    supabaseUrl = new URL(requireValue("NEXT_PUBLIC_SUPABASE_URL"));
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL ist ungültig.");
  }
  if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== `${expectedProjectRef}.supabase.co` || supabaseUrl.pathname !== "/") {
    fail("NEXT_PUBLIC_SUPABASE_URL verweist nicht exakt auf das Wünschi-Produktionsprojekt.");
  }
  requireValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

function createCloudflareEnvironment() {
  const env = { ...process.env };
  for (const name of runtimeBindingsExcludedFromBuild) {
    // Empty process values take precedence over Next.js' automatic .env.local
    // loading. This prevents local development secrets from entering a
    // production build even when that file exists in the working directory.
    if (!name.startsWith("NEXT_PUBLIC_")) env[name] = "";
  }
  return env;
}

function createBuildEnvironment(cloudflareEnvironment) {
  const env = { ...cloudflareEnvironment };
  for (const name of cloudflareCredentialsExcludedFromBuild) delete env[name];
  for (const name of Object.keys(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") && /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|ENCRYPTION_KEY|SERVICE_ROLE|DATABASE_URL)/i.test(name)) {
      env[name] = "";
    }
  }
  return env;
}

function runExecutable(executable, args, { captureStdout = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: captureStdout ? ["ignore", "pipe", "inherit"] : "inherit",
      env,
      shell: false,
    });
    let stdout = "";
    if (captureStdout) child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${executable} wurde mit ${signal ? `Signal ${signal}` : `Status ${code}`} beendet.`));
    });
  });
}

async function validateRemoteSecretNames(env) {
  const executable = join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );
  const output = await runExecutable(
    executable,
    ["secret", "list", "--name", expectedWorkerName, "--format", "json"],
    { captureStdout: true, env },
  );

  let bindings;
  try {
    bindings = JSON.parse(output);
  } catch {
    fail("Cloudflare hat keine auswertbare Secret-Namensliste geliefert.");
  }
  if (!Array.isArray(bindings)) fail("Cloudflare hat eine unerwartete Secret-Namensliste geliefert.");

  const remoteNames = new Set(bindings.map((binding) => binding?.name).filter((name) => typeof name === "string"));
  const missing = setDifference(new Set(requiredRemoteBindings), remoteNames);
  if (missing.length) fail(`Am Produktions-Worker fehlen erforderliche Bindings: ${missing.join(", ")}.`);

  const unexpected = setDifference(remoteNames, new Set(requiredRemoteBindings));
  if (unexpected.length) {
    console.warn(`Hinweis: Zusätzliche Remote-Secret-Namen bleiben unverändert erhalten: ${unexpected.join(", ")}.`);
  }
}

function runOpenNext(args, env) {
  const executable = join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "opennextjs-cloudflare.cmd" : "opennextjs-cloudflare",
  );
  return runExecutable(executable, args, { env });
}

const config = await loadWranglerConfig();
validateWranglerTarget(config);
validatePublicBuildInputs();

const cloudflareEnvironment = createCloudflareEnvironment();
const buildEnvironment = createBuildEnvironment(cloudflareEnvironment);
console.log("Produktionsziel bestätigt. Prüfe erforderliche Secret-Namen read-only bei Cloudflare.");
await validateRemoteSecretNames(cloudflareEnvironment);
if (preflightOnly) {
  console.log("Produktions-Preflight erfolgreich. Es wurde weder gebaut noch deployt.");
} else {
  console.log("Remote-Bindings vorhanden. Starte Build nur mit den öffentlichen Supabase-Buildwerten.");
  await runOpenNext(["build"], buildEnvironment);
  console.log("Build abgeschlossen. Deploy mit Erhalt aller bestehenden Cloudflare-Bindings.");
  await runOpenNext(["deploy", "--", "--keep-vars"], cloudflareEnvironment);
}
