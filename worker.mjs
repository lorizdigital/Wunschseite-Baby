// Eigener Worker-Einstieg für Cloudflare. Der von OpenNext erzeugte Worker
// beantwortet weiterhin alle HTTP-Anfragen unverändert; ergänzt wird nur der
// tägliche Cron-Lauf aus wrangler.jsonc, der die Supabase-Datenbank aktiv hält.
import openNextWorker from "./.open-next/worker.js";
import { keepDatabaseAwake } from "./src/worker/keep-alive.ts";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const worker = {
  fetch: openNextWorker.fetch,
  async scheduled(_controller, env, ctx) {
    const mode = await keepDatabaseAwake(env, (request) => openNextWorker.fetch(request, env, ctx));
    console.log(`Supabase-Wachhalteabfrage erfolgreich (${mode}).`);
  },
};

export default worker;
