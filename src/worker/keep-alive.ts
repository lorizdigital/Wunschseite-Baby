import { createClient } from "@supabase/supabase-js";
import { PRODUCT_ORIGIN } from "../lib/brand";

export type KeepAliveEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  INTERNAL_CRON_SECRET?: string;
  APP_ORIGIN?: string;
};

export type AppFetch = (request: Request) => Promise<Response>;

/**
 * Supabase pausiert Projekte im Free-Tarif nach sieben Tagen ohne Aktivität.
 * Danach scheitern Mats-Zugang, Reservierungen und Elternbereich, bis das
 * Projekt manuell wiederhergestellt wird. Der tägliche Cron-Lauf des Workers
 * erzeugt deshalb eine minimale Leseabfrage gegen die Produktionsdatenbank.
 *
 * Wirft bei jedem Fehlschlag, damit Cloudflare den Cron-Lauf als fehlgeschlagen
 * protokolliert und der Ausfall nicht unbemerkt bleibt.
 */
export async function keepDatabaseAwake(env: KeepAliveEnv, appFetch: AppFetch) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim();

  if (url && key) {
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await supabase.from("wishlists").select("id", { head: true }).limit(1);
    if (error) throw new Error(`Supabase-Wachhalteabfrage fehlgeschlagen: ${error.message || "unbekannter Fehler"}`);
    return "direct" as const;
  }

  // NEXT_PUBLIC_-Werte können ausschließlich als Build-Variable gesetzt sein und
  // fehlen dann zur Laufzeit. In diesem Fall läuft die Abfrage über den
  // bestehenden, geschützten Health-Endpunkt innerhalb der Next.js-Anwendung.
  // Nicht trimmen: Der Health-Endpunkt vergleicht exakt mit demselben Wert.
  const cronSecret = env.INTERNAL_CRON_SECRET;
  if (cronSecret) {
    const origin = env.APP_ORIGIN?.trim() || PRODUCT_ORIGIN;
    const response = await appFetch(new Request(new URL("/api/internal/health", origin), {
      headers: { authorization: `Bearer ${cronSecret}` },
    }));
    if (!response.ok) throw new Error(`Health-Prüfung meldet HTTP ${response.status}.`);
    return "health" as const;
  }

  throw new Error(
    "Wachhalteabfrage nicht konfiguriert: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY "
    + "oder INTERNAL_CRON_SECRET müssen als Worker-Laufzeitvariablen gesetzt sein.",
  );
}
