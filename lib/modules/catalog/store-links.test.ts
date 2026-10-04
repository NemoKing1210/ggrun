import { describe, expect, it } from "vitest";

import { buildStoreLinks } from "./store-links";

describe("buildStoreLinks", () => {
  it("keeps provider stores first, normalised and http(s)-only", () => {
    const links = buildStoreLinks({
      title: "Hades",
      platform: "pc",
      stores: [
        { store: "  Steam  ", url: " https://store.steampowered.com/app/1145360 " },
        { store: "Broken", url: "ftp://example.com/game" },
        { store: "Blank", url: "   " },
        { store: "", url: "https://example.com/game" },
        { store: "GOG", url: null },
      ],
    });

    expect(links[0]).toEqual({ store: "Steam", url: "https://store.steampowered.com/app/1145360" });
    expect(links.some((l) => l.url.startsWith("ftp"))).toBe(false);
    expect(links.filter((l) => l.url === "https://example.com/game")).toEqual([]);
  });

  it("offers the PC storefronts for a pc game", () => {
    const links = buildStoreLinks({ title: "Hades", platform: "pc" });

    expect(links.map((l) => l.store)).toEqual(["Steam", "GOG", "Epic"]);
  });

  it("offers itch.io for a web game", () => {
    const links = buildStoreLinks({ title: "Hades", platform: "web" });

    expect(links).toHaveLength(1);
    expect(links[0]!.store).toBe("itch.io");
  });

  it("offers the console storefront for each console platform", () => {
    expect(buildStoreLinks({ title: "Game", platform: "nintendo-switch" }).map((l) => l.store)).toEqual([
      "Nintendo eShop",
    ]);
    expect(buildStoreLinks({ title: "Game", platform: "playstation5" }).map((l) => l.store)).toEqual([
      "PlayStation Store",
    ]);
    expect(buildStoreLinks({ title: "Game", platform: "xbox-series-x" }).map((l) => l.store)).toEqual(["Xbox"]);
    expect(buildStoreLinks({ title: "Game", platform: "ios" }).map((l) => l.store)).toEqual(["App Store"]);
    expect(buildStoreLinks({ title: "Game", platform: "android" }).map((l) => l.store)).toEqual(["Google Play"]);
  });

  it("treats a custom platform as PC, using the fallbacks whose first match is pc", () => {
    const links = buildStoreLinks({ title: "Game", platform: "custom" });

    expect(links.map((l) => l.store)).toEqual(["GOG", "Epic"]);
  });

  it("adds no fallback for a platform it does not know", () => {
    expect(buildStoreLinks({ title: "Game", platform: "sega-saturn" })).toEqual([]);
  });

  it("adds the generic PC stores only when there is no platform and no store", () => {
    expect(buildStoreLinks({ title: "Game" }).map((l) => l.store)).toEqual(["Steam", "GOG", "Epic"]);

    const withStore = buildStoreLinks({
      title: "Game",
      stores: [{ store: "Indie", url: "https://example.com/game" }],
    });
    expect(withStore).toEqual([{ store: "Indie", url: "https://example.com/game" }]);
  });

  it("dedupes a fallback that collides with a provider store", () => {
    const links = buildStoreLinks({
      title: "Hades",
      platform: "pc",
      stores: [{ store: "Steam", url: "https://store.steampowered.com/search/?term=Hades" }],
    });

    expect(links.filter((l) => l.store === "Steam")).toHaveLength(1);
    expect(links.map((l) => l.store)).toEqual(["Steam", "GOG", "Epic"]);
  });

  it("encodes the title, collapsing whitespace and trimming", () => {
    const links = buildStoreLinks({ title: "  Ori   and the Blind Forest  ", platform: "pc" });

    expect(links[0]!.url).toBe("https://store.steampowered.com/search/?term=Ori%20and%20the%20Blind%20Forest");
    expect(links[0]!.url).not.toContain("+");
  });
});
