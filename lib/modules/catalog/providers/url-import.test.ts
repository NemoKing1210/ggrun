import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/http/external-fetch", () => ({
  fetchExternal: vi.fn(),
}));

import { fetchExternal } from "@/lib/infrastructure/http/external-fetch";

import { resolveGameFromUrl } from "./url-import";

const fetchMock = vi.mocked(fetchExternal);

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function htmlRes(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveGameFromUrl", () => {
  it("rejects a string that is not a URL", async () => {
    await expect(resolveGameFromUrl("not a url")).rejects.toThrow("Invalid URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) protocol", async () => {
    await expect(resolveGameFromUrl("ftp://example.com/game")).rejects.toThrow("must be http(s)");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a Steam app through the store API", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        "1145360": {
          success: true,
          data: {
            name: "Hades",
            short_description: "A <b>roguelike</b> dungeon crawler",
            header_image: "https://cdn.example/hades.jpg",
            genres: [{ description: "Action" }, { description: "  RPG  " }],
            categories: [{ description: "Single-player" }],
            metacritic: { score: 93 },
            website: "https://supergiantgames.com",
          },
        },
      }),
    );

    const result = await resolveGameFromUrl("https://store.steampowered.com/app/1145360/Hades/");

    expect(result).toMatchObject({
      title: "Hades",
      platform: "steam",
      detectedProvider: "steam",
      coverUrl: "https://cdn.example/hades.jpg",
      description: "A roguelike dungeon crawler",
      genres: ["action", "rpg"],
      tags: ["single-player"],
      metacritic: 93,
      rating: null,
      website: "https://supergiantgames.com",
      externalId: "steam:1145360",
      stores: [{ store: "Steam", url: "https://store.steampowered.com/app/1145360/Hades/" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the page metadata when the Steam API has no entry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ "1145360": { success: false } }))
      .mockResolvedValueOnce(
        htmlRes("<html><head><title>Hades on Steam</title></head></html>"),
      );

    const result = await resolveGameFromUrl("https://store.steampowered.com/app/1145360/Hades/");

    expect(result.title).toBe("Hades");
    expect(result.detectedProvider).toBe("steam");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cleans GOG titles and labels the store", async () => {
    fetchMock.mockResolvedValue(
      htmlRes(
        '<html><head><title>-70% Hades - GOG.com</title>' +
          '<meta property="og:image" content="/img/hades.jpg">' +
          '<meta property="og:description" content="An &amp; excellent game"></head></html>',
      ),
    );

    const result = await resolveGameFromUrl("https://www.gog.com/en/game/hades");

    expect(result.title).toBe("Hades");
    expect(result.detectedProvider).toBe("gog");
    expect(result.platform).toBe("gog");
    expect(result.stores).toEqual([{ store: "GOG", url: "https://www.gog.com/en/game/hades" }]);
    // relative og:image is resolved against the page
    expect(result.coverUrl).toBe("https://www.gog.com/img/hades.jpg");
    expect(result.description).toBe("An & excellent game");
  });

  it("cleans the Epic Games Store suffix", async () => {
    fetchMock.mockResolvedValue(
      htmlRes("<title>Hades | Download and Buy Today - Epic Games Store</title>"),
    );

    const result = await resolveGameFromUrl("https://store.epicgames.com/en-US/p/hades");

    expect(result.title).toBe("Hades");
    expect(result.stores[0]!.store).toBe("Epic Games");
  });

  it("cleans the itch.io suffix", async () => {
    fetchMock.mockResolvedValue(htmlRes("<title>Hades · itch.io</title>"));

    const result = await resolveGameFromUrl("https://somebody.itch.io/hades");

    expect(result.title).toBe("Hades");
    expect(result.stores[0]!.store).toBe("itch.io");
  });

  it("labels a humble bundle page", async () => {
    fetchMock.mockResolvedValue(htmlRes("<title>Some Bundle</title>"));

    const result = await resolveGameFromUrl("https://www.humblebundle.com/games/some-bundle");

    expect(result.detectedProvider).toBe("humble");
    expect(result.platform).toBe("humble");
    expect(result.stores[0]!.store).toBe("Humble");
  });

  it("labels an unknown store with the bare hostname", async () => {
    fetchMock.mockResolvedValue(htmlRes("<title>Some Game</title>"));

    const result = await resolveGameFromUrl("https://www.example-store.com/games/some-game");

    expect(result.detectedProvider).toBe("generic");
    expect(result.platform).toBeNull();
    expect(result.stores[0]!.store).toBe("example-store.com");
  });

  it("reads the title tag and the reverse-order image meta", async () => {
    fetchMock.mockResolvedValue(
      htmlRes(
        '<head><title> Chrono Trigger </title>' +
          '<meta content="https://cdn.example/ct.jpg" property="og:image"></head>',
      ),
    );

    const result = await resolveGameFromUrl("https://example.com/chrono");

    expect(result.title).toBe("Chrono Trigger");
    expect(result.coverUrl).toBe("https://cdn.example/ct.jpg");
  });

  it("falls back to twitter:image and twitter:description", async () => {
    fetchMock.mockResolvedValue(
      htmlRes(
        '<title>Game</title>' +
          '<meta name="twitter:image" content="https://cdn.example/tw.jpg">' +
          '<meta name="twitter:description" content="from twitter">',
      ),
    );

    const result = await resolveGameFromUrl("https://example.com/game");

    expect(result.coverUrl).toBe("https://cdn.example/tw.jpg");
    expect(result.description).toBe("from twitter");
  });

  it("rejects a page that carries no usable title", async () => {
    fetchMock.mockResolvedValue(htmlRes("<html><body>no metadata here</body></html>"));

    await expect(resolveGameFromUrl("https://example.com/game")).rejects.toThrow("Could not detect game title");
  });

  it("rejects a title shorter than two characters", async () => {
    fetchMock.mockResolvedValue(htmlRes("<title>A</title>"));

    await expect(resolveGameFromUrl("https://example.com/game")).rejects.toThrow("Could not detect game title");
  });

  it("reports the HTTP status when the page cannot be fetched", async () => {
    fetchMock.mockResolvedValue(htmlRes("whatever", 404));

    await expect(resolveGameFromUrl("https://example.com/game")).rejects.toThrow(
      "Could not load URL: Failed to fetch page (HTTP 404)",
    );
  });

  it("names the Steam page when a Steam URL is unreachable", async () => {
    fetchMock
      .mockResolvedValueOnce(htmlRes("", 500))
      .mockResolvedValueOnce(htmlRes("down", 503));

    await expect(resolveGameFromUrl("https://store.steampowered.com/app/1/X/")).rejects.toThrow(
      "Steam page unreachable",
    );
  });

  it("rejects an empty body", async () => {
    fetchMock.mockResolvedValue(htmlRes(""));

    await expect(resolveGameFromUrl("https://example.com/game")).rejects.toThrow("Empty response from store");
  });

  it("caps a long description at 700 characters", async () => {
    const long = "x".repeat(900);
    fetchMock.mockResolvedValue(
      htmlRes(`<title>Game</title><meta property="og:description" content="${long}">`),
    );

    const result = await resolveGameFromUrl("https://example.com/game");

    expect(result.description).toHaveLength(700);
  });
});
