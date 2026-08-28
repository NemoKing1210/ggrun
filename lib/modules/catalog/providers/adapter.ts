import { fetchExternal } from "@/lib/infrastructure/http/external-fetch";

export type ProviderFetchOptions = {
  cacheTtlHours?: number;
  retries?: number;
};

export async function providerFetch(
  url: string,
  opts: ProviderFetchOptions = {},
): Promise<Response | null> {
  const { cacheTtlHours = 24, retries = 1 } = opts;
  const fetchOpts: RequestInit & { next?: { revalidate?: number } } =
    cacheTtlHours === 0 ? { cache: "no-store" } : { next: { revalidate: Math.max(60, cacheTtlHours * 3600) } };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchExternal(url, fetchOpts);
      if (!res.ok) {
        console.warn(`[providerFetch] ${url} failed ${res.status}`);
        if (res.status >= 500 && attempt < retries) continue;
        return null;
      }
      return res;
    } catch (e) {
      console.warn(`[providerFetch] network error ${url}`, e);
      if (attempt < retries) continue;
      return null;
    }
  }
  return null;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
