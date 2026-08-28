import { ProxyAgent, fetch as undiciFetch } from "undici";

import { getSiteSettings } from "@/lib/modules/site-settings/repository/site-settings";

export type ProxyConfig = {
  url: string | null;
  enabled: boolean;
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

/**
 * Effective outbound proxy: DB wins when enabled and a URL is set, otherwise
 * PROXY_URL from env (presence implies enabled). Genuinely useful in
 * datacenter/CI setups where game APIs are only reachable via a gateway.
 */
export async function getEffectiveProxy(): Promise<ProxyConfig> {
  let dbEnabled = false;
  let dbUrl: string | null = null;
  try {
    const settings = (await getSiteSettings()) as unknown as Record<string, unknown>;
    dbEnabled = Boolean(settings.proxyEnabled);
    dbUrl = trimOrNull(settings.proxyUrl);
  } catch {
    // DB unreachable — fall through to env only.
  }
  const envProxy = trimOrNull(process.env.PROXY_URL);
  const url = dbEnabled && dbUrl ? dbUrl : envProxy ?? null;
  const enabled = url !== null;
  return { url, enabled };
}

/** True when outbound requests should currently be routed through a proxy. */
export async function isProxyEnabled(): Promise<boolean> {
  return (await getEffectiveProxy()).enabled;
}

let cachedAgent: ProxyAgent | null = null;
let cachedAgentUrl: string | null = null;

function agentFor(url: string | null): ProxyAgent | undefined {
  if (!url) return undefined;
  if (cachedAgent && cachedAgentUrl === url) return cachedAgent;
  if (cachedAgent) cachedAgent.close?.().catch(() => undefined);
  cachedAgent = new ProxyAgent(url);
  cachedAgentUrl = url;
  return cachedAgent;
}

/**
 * fetch() that honors the admin-configured proxy (undici ProxyAgent) and
 * retries idempotent GETs once on network errors. Used by all external
 * game providers; leave alone for internal/DB traffic.
 *
 * Important: global fetch (Node internal undici) and npm undici's
 * ProxyAgent are incompatible ("invalid onRequestStart" error). When a
 * proxy is active we must use undici's own fetch together with its
 * ProxyAgent; otherwise we keep Next.js global fetch (so `next:
 * { revalidate }` caching still works).
 */
export async function fetchExternal(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url: proxyUrl } = await getEffectiveProxy();
  if (proxyUrl) {
    const dispatcher = agentFor(proxyUrl);
    // Next.js fetch extensions (next/cache) are not understood by
    // undici's fetch — strip them for the proxied path.
    const { next: _next, cache: _cache, ...rest } = init as Record<string, unknown>;
    const opts = { ...rest, dispatcher } as RequestInit & { dispatcher: unknown };
    try {
      return (await undiciFetch(url, opts as unknown as Parameters<typeof undiciFetch>[1])) as unknown as Response;
    } catch (err) {
      if ((init.method ?? "GET").toUpperCase() === "GET") {
        return (await undiciFetch(url, opts as unknown as Parameters<typeof undiciFetch>[1])) as unknown as Response;
      }
      throw err;
    }
  }
  // No proxy — use Next.js global fetch (supports `next: { revalidate }`).
  try {
    return await fetch(url, init);
  } catch (err) {
    if ((init.method ?? "GET").toUpperCase() === "GET") {
      return await fetch(url, init);
    }
    throw err;
  }
}

/** Clears the cached ProxyAgent (used when the proxy config changes). */
export function resetProxyAgent(): void {
  if (cachedAgent) cachedAgent.close?.().catch(() => undefined);
  cachedAgent = null;
  cachedAgentUrl = null;
}