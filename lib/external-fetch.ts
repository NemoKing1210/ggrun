import { ProxyAgent } from "undici";

import { getSiteSettings } from "@/lib/repositories/site-settings.repo";

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
 */
export async function fetchExternal(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url: proxyUrl } = await getEffectiveProxy();
  const dispatcher = agentFor(proxyUrl);
  const opts = dispatcher
    ? { ...init, dispatcher, cache: "no-store" as RequestInit["cache"] }
    : init;

  try {
    return await fetch(url, opts as RequestInit);
  } catch (err) {
    // One retry: transient resets are common with flaky proxy backends and
    // keep-alive socket reuse across providers.
    if ((init.method ?? "GET").toUpperCase() === "GET") {
      return await fetch(url, opts as RequestInit);
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