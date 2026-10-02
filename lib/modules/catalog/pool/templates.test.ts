import { describe, expect, it } from "vitest";

import { TEMPLATE_PRIMARY_TAG } from "@/lib/engine/pool/primary";

import { GENRES, TAGS } from "./constants";
import { GAME_POOL_TEMPLATES } from "./templates";

/**
 * Every template names its primary tag, taken from its own name ("Indie Gems"
 * → indie). Two places hold it — the template, and the engine's map that
 * upgrades seasons saved before primary tags existed — and they must agree, or
 * a fresh Horror season and an old one would draw from different pools.
 */
describe("template primary tags", () => {
  it.each(GAME_POOL_TEMPLATES.map((t) => [t.id, t] as const))("%s has one", (_id, tpl) => {
    expect(tpl.filters.primaryTag).toBeTruthy();
  });

  it.each(GAME_POOL_TEMPLATES.map((t) => [t.id, t] as const))("%s agrees with the engine's map", (id, tpl) => {
    expect(TEMPLATE_PRIMARY_TAG[id]).toBe(tpl.filters.primaryTag);
  });

  it("maps no template the catalog does not have", () => {
    const ids = new Set(GAME_POOL_TEMPLATES.map((t) => t.id));
    for (const id of Object.keys(TEMPLATE_PRIMARY_TAG)) expect(ids.has(id), id).toBe(true);
  });

  // A value the editor does not offer could never be chosen back after being
  // cleared, and has no label to show.
  it("uses only values the season editor offers", () => {
    const offered = new Set<string>([...GENRES, ...TAGS].map((o) => o.value));
    for (const tpl of GAME_POOL_TEMPLATES) expect(offered.has(tpl.filters.primaryTag!), tpl.id).toBe(true);
  });

  it("is the category the template is named for", () => {
    const byId = Object.fromEntries(GAME_POOL_TEMPLATES.map((t) => [t.id, t.filters.primaryTag]));
    expect(byId.horror).toBe("horror");
    expect(byId.indie).toBe("indie");
    expect(byId.roguelike).toBe("roguelike");
    // "Cozy & Family": casual, the host's choice — family is a small category everywhere
    expect(byId.cozy).toBe("casual");
  });
});
