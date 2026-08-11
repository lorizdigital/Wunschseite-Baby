import { spawn } from "node:child_process";
import { join } from "node:path";

const expectedOrigin = "https://xn--wnschi-3ya.de";
const expectedProjectRef = "nnrkbdduiiebdahwcofa";
const expectedConfirmation = "deploy-wuenschi-production";

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

function validateProductionTarget() {
  requireExact("CLOUDFLARE_DEPLOY_TARGET", "production");
  requireExact("CLOUDFLARE_PRODUCTION_DEPLOY_CONFIRMATION", expectedConfirmation);

  let origin;
  let supabaseUrl;
  try {
    origin = new URL(requireValue("APP_ORIGIN")).origin;
    supabaseUrl = new URL(requireValue("NEXT_PUBLIC_SUPABASE_URL"));
  } catch {
    fail("APP_ORIGIN oder NEXT_PUBLIC_SUPABASE_URL ist ungültig.");
  }
  if (origin !== expectedOrigin) fail("APP_ORIGIN verweist nicht exakt auf Wünschi-Produktion.");
  if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== `${expectedProjectRef}.supabase.co` || supabaseUrl.pathname !== "/") {
    fail("NEXT_PUBLIC_SUPABASE_URL verweist nicht exakt auf das Wünschi-Produktionsprojekt.");
  }

  requireValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!process.env.SUPABASE_SECRET_KEY?.trim() && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    fail("SUPABASE_SECRET_KEY oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }
  for (const secret of [
    "ADMIN_IMPORT_SECRET",
    "PUBLIC_WISHLIST_ACCESS_SESSION_SECRET",
    "MATS_ACCESS_CODE",
    "MATS_ACCESS_CODE_VERSION",
    "INTERNAL_CRON_SECRET",
    "INTERNAL_PROVISIONING_SECRET",
    "BREVO_API_KEY",
  ]) requireValue(secret);

  // Authentication emails are always rendered inline, even when invitations
  // use a Brevo template. A verified sender is therefore mandatory in prod.
  requireValue("BREVO_SENDER_EMAIL");
  requireExact("MULTI_WISHLIST_ENABLED", "true");
  requireExact("PUBLICATION_ENABLED", "true");
  requireExact("PRODUCT_IMPORT_ENABLED", "true");
  requireExact("LEGACY_MATS_ADMIN_ENABLED", "true");
}

function runOpenNext(args) {
  const executable = join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "opennextjs-cloudflare.cmd" : "opennextjs-cloudflare",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", env: process.env, shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`OpenNext wurde mit ${signal ? `Signal ${signal}` : `Status ${code}`} beendet.`));
    });
  });
}

validateProductionTarget();
console.log("Produktionsziel und erforderliche Variablennamen sind eindeutig bestätigt. Starte geprüften Build.");
await runOpenNext(["build"]);
console.log("Build abgeschlossen. Deploy mit Erhalt der Cloudflare-Dashboard-Variablen.");
await runOpenNext(["deploy", "--", "--keep-vars"]);
