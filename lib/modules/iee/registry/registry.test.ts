import { describe, expect, it, vi } from "vitest";

import { NO_ART, type EntryArt } from "@/lib/engine";
import { CORE_DOCS, CORE_ENTRY_IDS } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { coreCatalog } from "./catalog.test-helpers";

const play = vi.hoisted(() => ({ loadPlaySet: vi.fn() }));
vi.mock("../catalog/repository", () => play);

const { buildRegistry, compileCached, coreRegistry, entryTuning, getSeasonRegistry, registryFromPlaySet } = await import(
  "./index"
);

const registry = coreRegistry();
const docOf = (key: keyof typeof CORE_ENTRY_IDS) => CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!;

/** The play set a season with these catalog rows would load. */
const playSet = (
  rows: ReturnType<typeof coreCatalog>,
  held: { entryId: string; revisionId: string; doc: unknown }[] = [],
  art: Record<string, EntryArt> = {},
) => ({
  catalog: rows.map((row) => ({ row, doc: CORE_DOCS.find((d) => d.revisionId === row.revisionId)!.doc })),
  held,
  art,
});

describe("the fixture registry — the system pack, every entry attached at its defaults", () => {
  it("compiles once per process", () => {
    expect(coreRegistry()).toBe(registry);
    expect(registry.set.entries).toHaveLength(CORE_DOCS.length);
    expect(registry.set.failures).toEqual([]);
  });

  it("finds an entry by key, entry id or revision id, and only by those", () => {
    const byKey = registry.get("hex_scroll")!;
    expect(registry.get(CORE_ENTRY_IDS.hex_scroll)).toBe(byKey);
    expect(registry.get(byKey.revisionId)).toBe(byKey);
    expect(registry.get("no_such_entry")).toBeNull();
    expect(registry.item("hex_scroll")?.kind).toBe("item");
    expect(registry.item("swamp")).toBeNull();
    expect(registry.effect("swamp")?.kind).toBe("effect");
    expect(registry.effect("hex_scroll")).toBeNull();
    expect(registry.items()).toHaveLength(CORE_DOCS.filter((d) => d.doc.kind === "item").length);
    expect(registry.effects()).toHaveLength(CORE_DOCS.filter((d) => d.doc.kind === "effect").length);
    expect(registry.facts(CORE_ENTRY_IDS.swamp)?.slug).toBe("swamp");
    expect(registry.facts("nope")).toBeNull();
  });

  it("attaches every entry enabled, on the pool its character says, at its rarity's weight", () => {
    expect(registry.tuning(CORE_ENTRY_IDS.poison)).toMatchObject({ enabled: true, pool: "penalty", rarity: null, weight: 40 });
    expect(registry.tuning(CORE_ENTRY_IDS.speed_boots)).toMatchObject({ pool: "bonus", weight: 100 });
    expect(registry.tuning("nope")).toBeNull();
  });

  it("offers the wheel every entry, with its pool, rarity tier, stacking and tags", () => {
    const byKey = Object.fromEntries(registry.candidates().map((c) => [c.key, c]));
    expect(Object.keys(byKey).sort()).toEqual([...registry.set.byKey.keys()].sort());
    expect(byKey.hex_scroll).toEqual({ kind: "item", key: "hex_scroll", polarity: "positive", tier: 0, tags: ["directed"], character: "bonus" });
    expect(byKey.swamp).toEqual({
      kind: "effect",
      key: "swamp",
      polarity: "negative",
      tier: 0,
      stacking: "refresh",
      tags: ["movement"],
      character: "penalty",
    });
    expect(byKey.ward).toMatchObject({ polarity: "positive", tier: 1, stacking: "stack" });
  });

  it("draws the system pack with the artwork shipped with the game", () => {
    expect(registry.views().every((v) => v.art.system && v.art.iconUrl === null)).toBe(true);
  });

  it("declares signed defaults for every entry", () => {
    const defaults = registry.defaults();
    expect(defaults.swamp).toEqual({ steps: -1 });
    expect(defaults.acceleration).toEqual({ steps: 1 });
    expect(defaults.hex_scroll).toEqual({});
  });
});

describe("a season's registry — its catalog, tuned", () => {
  const rows = coreCatalog({
    hex_scroll: {},
    swamp: { pool: "bonus", rarity: "epic", weight: 7, paramOverrides: { steps: -2 }, durationOverride: 3 },
    ward: { enabled: false },
  });
  const season = buildRegistry(registry.set, rows);

  it("plays only what it attaches", () => {
    expect(season.views().map((v) => v.key).sort()).toEqual(["hex_scroll", "swamp", "ward"]);
    expect(season.items().map((e) => e.key)).toEqual(["hex_scroll"]);
    expect(season.candidates().map((c) => c.key).sort()).toEqual(["hex_scroll", "swamp", "ward"]);
  });

  it("finds an entry it does not attach only by a revision an instance could hold", () => {
    expect(season.get("toll")).toBeNull();
    expect(season.get(CORE_ENTRY_IDS.toll)).toBeNull();
    expect(season.item("jinx")).toBeNull();
    expect(season.get(docOf("toll").revisionId)?.key).toBe("toll");
  });

  it("draws an instance from the revision it holds, attached or not", () => {
    expect(season.instanceView(docOf("swamp").revisionId)?.duration).toEqual({ unit: "moves", count: 3 });
    expect(season.instanceView(docOf("toll").revisionId)?.key).toBe("toll");
    expect(season.instanceView("nope")).toBeNull();
  });

  it("folds the season's pool and rarity into the wheel's candidate", () => {
    const swamp = season.candidates().find((c) => c.key === "swamp")!;
    expect(swamp).toMatchObject({ polarity: "positive", tier: 2 });
    expect(season.entryConfigs().swamp).toMatchObject({ enabled: true, weight: 7, polarityOverride: null });
    expect(season.entryConfigs().ward?.enabled).toBe(false);
  });

  it("says how each entry drops, for the rules page", () => {
    expect(season.pool()).toEqual({
      hex_scroll: { enabled: true, weight: 100, polarity: "positive" },
      swamp: { enabled: true, weight: 7, polarity: "positive" },
      ward: { enabled: false, weight: 40, polarity: "positive" },
    });
  });

  it("starts instances and writes views with the season's numbers", () => {
    const swamp = season.get("swamp")!;
    expect(season.start(swamp)).toMatchObject({ params: { steps: -2 }, remaining: 3, unit: "moves" });
    expect(season.view(swamp).ruleText.en).toBe("Your move is 2 cells shorter. Lasts 3 moves.");
    expect(season.viewsByKey().swamp?.duration).toEqual({ unit: "moves", count: 3 });
    // An untuned entry keeps the text its document compiled to.
    expect(season.view(season.get("hex_scroll")!).ruleText).toBe(season.get("hex_scroll")!.ruleText);
  });

  it("reads a row's tuning only when it changes a number", () => {
    expect(entryTuning(null)).toBeUndefined();
    expect(entryTuning(rows.find((r) => r.entryId === CORE_ENTRY_IDS.hex_scroll))).toBeUndefined();
    expect(entryTuning(rows.find((r) => r.entryId === CORE_ENTRY_IDS.swamp))).toEqual({
      paramOverrides: { steps: -2 },
      durationOverride: 3,
    });
  });
});

describe("a season's registry — loaded from the database", () => {
  it("compiles its catalog and keeps the revisions live instances hold reachable by id", () => {
    const old = { ...(docOf("swamp").doc as EntryDoc), duration: { unit: "moves" as const, count: 9 } };
    const oldRevision = "00000000-0000-5000-8000-0000000000aa";
    const season = registryFromPlaySet(
      playSet(coreCatalog({ hex_scroll: {}, swamp: {} }), [{ entryId: CORE_ENTRY_IDS.swamp, revisionId: oldRevision, doc: old }]),
    );
    expect(season.get("swamp")?.revisionId).toBe(docOf("swamp").revisionId);
    expect(season.get(oldRevision)?.key).toBe("swamp");
    expect(season.view(season.get(oldRevision)!).duration).toEqual({ unit: "moves", count: 9 });
    expect(season.instanceView(oldRevision)?.duration).toEqual({ unit: "moves", count: 9 });
    // The held revision is not a candidate: it plays for its holders only.
    expect(season.candidates().map((c) => c.key).sort()).toEqual(["hex_scroll", "swamp"]);
  });

  it("compiles the same revisions once, and a different set anew", () => {
    const members = CORE_DOCS.slice(0, 3);
    const first = compileCached(members);
    expect(compileCached([...members].reverse())).toBe(first);
    expect(compileCached(CORE_DOCS.slice(0, 2))).not.toBe(first);
  });

  it("does not play a row whose revision fails to compile", () => {
    const rows = coreCatalog({ hex_scroll: {}, swamp: {} });
    // Its own revision id: compiled sets are cached by revision ids, which name content.
    const unreadable = { ...rows[0]!, revisionId: "00000000-0000-5000-8000-0000000000bb" };
    const broken = {
      catalog: [{ row: unreadable, doc: { dslVersion: 1, kind: "item" } }, { row: rows[1]!, doc: docOf("swamp").doc }],
      held: [],
      art: {},
    };
    const season = registryFromPlaySet(broken);
    expect(season.views().map((v) => v.key)).toEqual(["swamp"]);
    expect(season.set.failures.map((f) => f.entryId)).toEqual([CORE_ENTRY_IDS.hex_scroll]);
  });

  it("reads a season's play set and builds its registry", async () => {
    play.loadPlaySet.mockResolvedValueOnce(playSet(coreCatalog({ jinx: {}, unlucky: {} })));
    const season = await getSeasonRegistry("season-1");
    expect(play.loadPlaySet).toHaveBeenCalledWith("season-1");
    expect(season.views().map((v) => v.key).sort()).toEqual(["jinx", "unlucky"]);
  });

  it("draws each entry as the library says, and an entry it knows nothing about plainly", () => {
    const icon = { iconUrl: "/api/files?key=iee_icon%2Fa.webp", packIconUrl: null, system: false };
    const season = registryFromPlaySet(playSet(coreCatalog({ hex_scroll: {}, swamp: {} }), [], { [CORE_ENTRY_IDS.hex_scroll]: icon }));
    expect(season.viewsByKey().hex_scroll?.art).toEqual(icon);
    expect(season.viewsByKey().swamp?.art).toEqual(NO_ART);
  });

  it("a season with an empty catalog plays nothing", async () => {
    play.loadPlaySet.mockResolvedValueOnce({ catalog: [], held: [], art: {} });
    const season = await getSeasonRegistry("season-2");
    expect(season.candidates()).toEqual([]);
    expect(season.get("hex_scroll")).toBeNull();
  });
});
