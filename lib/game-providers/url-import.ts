import { fetchExternal } from "@/lib/external-fetch";

export type UrlImportResult = {
  title: string;
  coverUrl: string | null;
  description: string | null;
  platform: string | null;
  genres: string[];
  tags: string[];
  metacritic: number | null;
  rating: number | null;
  website: string | null;
  stores: Array<{ store: string; url: string }>;
  detectedProvider: string; // steam | gog | epic | itch | generic
  sourceUrl: string;
  externalId?: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function parseOpenGraph(html: string): {
  title: string | null;
  image: string | null;
  description: string | null;
  siteName: string | null;
} {
  const getMeta = (prop: string): string | null => {
    // property="og:..." or name="og:..." or property='og:...'
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i",
    );
    const m1 = html.match(re1);
    if (m1?.[1]) return decodeEntities(m1[1].trim());
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*?(?:property|name)=["']${prop}["'][^>]*>`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return decodeEntities(m2[1].trim());
    return null;
  };
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
  return {
    title: getMeta("og:title") ?? titleTag ? decodeEntities(titleTag ?? "") : null,
    image: getMeta("og:image") ?? getMeta("twitter:image") ?? null,
    description:
      getMeta("og:description") ??
      getMeta("description") ??
      getMeta("twitter:description") ??
      null,
    siteName: getMeta("og:site_name") ?? null,
  };
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

async function fetchSteamApp(appId: string, sourceUrl: string): Promise<UrlImportResult | null> {
  // Steam Store API is public, no key, returns JSON
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english`;
  try {
    const res = await fetchExternal(url, {
      headers: { "User-Agent": "Mozilla/5.0 GGRunBot/1.0" },
      cache: "no-store",
    } as never);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<
      string,
      { success: boolean; data?: Record<string, unknown> }
    >;
    const entry = json[appId];
    if (!entry?.success || !entry.data) return null;
    const d = entry.data as {
      name?: string;
      short_description?: string;
      detailed_description?: string;
      header_image?: string;
      genres?: Array<{ description: string }>;
      categories?: Array<{ description: string }>;
      metacritic?: { score?: number };
      website?: string | null;
    };
    const title = typeof d.name === "string" ? d.name.trim() : null;
    if (!title) return null;
    const genres =
      (d.genres ?? []).map((g) => g.description.toLowerCase().trim()).filter(Boolean).slice(0, 6) ?? [];
    const tags =
      (d.categories ?? []).map((c) => c.description.toLowerCase().trim()).filter(Boolean).slice(0, 6) ?? [];
    return {
      title,
      coverUrl: typeof d.header_image === "string" ? d.header_image : null,
      description:
        typeof d.short_description === "string" && d.short_description.trim()
          ? stripHtml(d.short_description)
          : typeof d.detailed_description === "string"
            ? stripHtml(d.detailed_description).slice(0, 600)
            : null,
      platform: "steam",
      genres,
      tags,
      metacritic: d.metacritic?.score ?? null,
      rating: null,
      website: typeof d.website === "string" && d.website ? d.website : null,
      stores: [{ store: "Steam", url: sourceUrl }],
      detectedProvider: "steam",
      sourceUrl,
      externalId: `steam:${appId}`,
    };
  } catch {
    return null;
  }
}

function detectProvider(host: string, href: string): { provider: string; platform: string | null } {
  const h = host.toLowerCase();
  if (h.includes("steampowered.com") || h.includes("steamcommunity.com")) return { provider: "steam", platform: "steam" };
  if (h.includes("gog.com")) return { provider: "gog", platform: "gog" };
  if (h.includes("epicgames.com")) return { provider: "epic", platform: "epic" };
  if (h.includes("itch.io")) return { provider: "itch", platform: "itch.io" };
  if (h.includes("humblebundle.com")) return { provider: "humble", platform: "humble" };
  if (h.includes("store.steampowered")) return { provider: "steam", platform: "steam" };
  // fallback: try path hints
  if (href.includes("steampowered.com/app")) return { provider: "steam", platform: "steam" };
  return { provider: "generic", platform: null };
}

export async function resolveGameFromUrl(rawUrl: string): Promise<UrlImportResult> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid URL — must start with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must be http(s)://");
  }
  const href = url.href;
  const host = url.hostname;
  const { provider, platform: detectedPlatform } = detectProvider(host, href);

  // Steam fast path
  if (provider === "steam") {
    const appMatch = href.match(/store\.steampowered\.com\/app\/(\d+)/i);
    if (appMatch?.[1]) {
      const steam = await fetchSteamApp(appMatch[1], href);
      if (steam) return steam;
      // fall through to OG if API fails
    }
  }

  // For GOG / Epic / itch / generic: fetch OG tags
  let html: string | null = null;
  try {
    const res = await fetchExternal(href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 GGRun/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
      },
      cache: "no-store",
      // steam pages want cookie? not needed
    } as never);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Failed to fetch page (HTTP ${res.status})${text.slice(0, 120) ? `: ${text.slice(0, 120)}` : ""}`,
      );
    }
    html = await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (provider === "steam") throw new Error(`Steam page unreachable: ${msg}`);
    throw new Error(`Could not load URL: ${msg}`);
  }

  if (!html) throw new Error("Empty response from store");

  const og = parseOpenGraph(html);
  let title = og.title?.trim() ?? null;
  // Clean title: Steam appends " on Steam", GOG appends " - GOG.com", often with sale prefix "-70%"
  if (title) {
    title = title
      .replace(/^\s*-?\s*\d+%\s*/i, "")
      .replace(/\s+on\s+Steam\s*$/i, "")
      .replace(/\s*[-–—]\s*GOG\.com\s*$/i, "")
      .replace(/\s*·\s*itch\.io\s*$/i, "")
      .trim();
    // Epic titles often have " | Download and Buy Today - Epic Games Store"
    title = title.replace(/\s*\|\s*Download.*Epic.*$/i, "").trim();
  }
  if (!title || title.length < 2) {
    throw new Error("Could not detect game title on this page — check that the URL is a store product page.");
  }

  // Try to infer cover: og:image may be relative
  let coverUrl: string | null = og.image;
  if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
    try {
      coverUrl = new URL(coverUrl, href).href;
    } catch {
      coverUrl = null;
    }
  }

  const description = og.description ? stripHtml(og.description).slice(0, 700) : null;

  // Heuristic genres/tags from OG description? leave empty, user can edit
  const platform = detectedPlatform;

  // Store label
  const storeLabel =
    provider === "gog"
      ? "GOG"
      : provider === "epic"
        ? "Epic Games"
        : provider === "itch"
          ? "itch.io"
          : provider === "humble"
            ? "Humble"
            : provider === "steam"
              ? "Steam"
              : host.replace(/^www\./, "");

  return {
    title,
    coverUrl,
    description,
    platform,
    genres: [],
    tags: [],
    metacritic: null,
    rating: null,
    website: null,
    stores: [{ store: storeLabel, url: href }],
    detectedProvider: provider,
    sourceUrl: href,
  };
}
