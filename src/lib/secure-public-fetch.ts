import "server-only";

import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

export type PublicResponse = {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  cancel: () => void;
  finish: () => void;
};

function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  if (value.includes(":")) return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("2001:db8:");
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
}

async function resolvePublicAddress(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) throw new Error("Lokale Zieladressen sind nicht erlaubt.");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Private Netzwerkadressen sind nicht erlaubt.");
    return { address: host, family: host.includes(":") ? 6 : 4 } as const;
  }

  const [v4, v6] = await Promise.all([resolve4(host).catch(() => []), resolve6(host).catch(() => [])]);
  const addresses = [...v4.map((address) => ({ address, family: 4 as const })), ...v6.map((address) => ({ address, family: 6 as const }))];
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Die Zieladresse konnte nicht sicher aufgelöst werden.");
  return addresses[0];
}

/** Validates a public URL and resolves one vetted address for the connection. */
export async function resolvePublicUrl(value: string) {
  const url = new URL(value);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new Error("Nur öffentliche HTTP- und HTTPS-Links sind erlaubt.");
  url.hash = "";
  return { url, target: await resolvePublicAddress(url.hostname) };
}

/** Cloudflare's `global_fetch_strictly_public` flag enforces the same public
 * network boundary during the actual fetch. The explicit lookup keeps invalid
 * and private targets rejected consistently before any request is started. */
export async function requestPublicUrl(value: string | URL, options: { accept: string; userAgent: string; timeoutMs: number }) {
  const { url } = await resolvePublicUrl(value.toString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Der externe Server antwortet nicht rechtzeitig.")), options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: options.accept, "User-Agent": options.userAgent },
    });
    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      cancel() {
        clearTimeout(timeout);
        controller.abort();
        void response.body?.cancel().catch(() => undefined);
      },
      finish() {
        clearTimeout(timeout);
      },
    } satisfies PublicResponse;
  } catch (reason) {
    clearTimeout(timeout);
    throw reason;
  }
}

export function responseHeader(headers: Headers, name: string) {
  return headers.get(name) ?? "";
}

export async function readResponseBytes(response: PublicResponse, limit: number) {
  const declared = Number(responseHeader(response.headers, "content-length") || 0);
  if (declared > limit) {
    response.cancel();
    throw new Error("Die externe Antwort ist zu groß.");
  }
  if (!response.body) {
    response.finish();
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = Buffer.from(value);
      size += bytes.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Die externe Antwort ist zu groß.");
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, size);
  } finally {
    response.finish();
    reader.releaseLock();
  }
}
