import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

export type PublicResponse = { status: number; headers: IncomingHttpHeaders; body: IncomingMessage };

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

/**
 * Fetches through the vetted IP address instead of asking the network stack to
 * resolve the host again. This keeps a DNS-rebinding response from redirecting
 * an importer to a private network after validation.
 */
export async function requestPublicUrl(value: string | URL, options: { accept: string; userAgent: string; timeoutMs: number }) {
  const { url, target } = await resolvePublicUrl(value.toString());
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise<PublicResponse>((resolve, reject) => {
    const networkRequest = request({
      protocol: url.protocol,
      hostname: target.address,
      family: target.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.protocol === "https:" && !isIP(url.hostname.replace(/^\[|\]$/g, "")) ? url.hostname.replace(/^\[|\]$/g, "") : undefined,
      headers: { Host: url.host, Accept: options.accept, "User-Agent": options.userAgent },
    }, (response) => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response }));
    networkRequest.setTimeout(options.timeoutMs, () => networkRequest.destroy(new Error("Der externe Server antwortet nicht rechtzeitig.")));
    networkRequest.on("error", reject);
    networkRequest.end();
  });
}

export function responseHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function readResponseBytes(response: PublicResponse, limit: number) {
  const declared = Number(responseHeader(response.headers, "content-length") || 0);
  if (declared > limit) {
    response.body.destroy();
    throw new Error("Die externe Antwort ist zu groß.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > limit) {
      response.body.destroy();
      throw new Error("Die externe Antwort ist zu groß.");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}
