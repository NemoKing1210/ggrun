import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IeeInstanceRow } from "@/db/schema";

import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry, coreRegistry } from "../registry";
import {
  activeInstancesBySeason,
  boardObjectsBySeason,
  bonusItemsBySeason,
  standingBySeason,
  effectBadgesBySeason,
  getInstanceRow,
  listActiveEffects,
  listActiveInstances,
  listActiveObjects,
  listHeldItems,
  listRollConditions,
  poolCounters,
} from "./instances";

/** Minimal thenable Drizzle stand-in: each `select()` resolves the next queued rows. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    leftJoin(...args: unknown[]): Chain;
    innerJoin(...args: unknown[]): Chain;
    groupBy(...args: unknown[]): Chain;
    then(onFulfilled: (rows: unknown[]) => unknown): Promise<unknown>;
  }
  const selectResults: unknown[][] = [];
  function chain(resolve: () => unknown[]): Chain {
    const c: Chain = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      leftJoin: () => c,
      innerJoin: () => c,
      groupBy: () => c,
      then: (onFulfilled) => Promise.resolve(resolve()).then(onFulfilled),
    };
    return c;
  }
  return {
    db: { select: () => chain(() => selectResults.shift() ?? []) },
    selectResults,
  };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const REGISTRY = coreRegistry();
const GONE = "00000000-0000-4000-8000-00000000dead";

function row(key: string, overrides: Partial<IeeInstanceRow> = {}): IeeInstanceRow {
  const def = REGISTRY.get(key)!;
  return {
    id: `inst-${key}`,
    seasonId: "season-1",
    entryId: def.entryId,
    revisionId: def.revisionId,
    kind: def.kind,
    holderKind: "player",
    holderPlayerId: "sp-1",
    holderCellIndex: null,
    holderRollId: null,
    ownerPlayerId: null,
    aimedPlayerId: null,
    chosen: null,
    params: { steps: -2 },
    chargesLeft: def.kind === "item" ? 1 : null,
    remaining: def.kind === "effect" ? 2 : null,
    remainingUnit: def.kind === "effect" ? "rolls" : null,
    anchorRollSeq: def.kind === "effect" ? 4 : null,
    countFromRollSeq: null,
    status: "active",
    endReason: null,
    source: "cell_bonus",
    sourceMoveId: null,
    causeJournalId: null,
    grantedRollSeq: 0,
    grantedAt: new Date(5),
    endedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbFake.selectResults.length = 0;
});

describe("single instances", () => {
  it("reads one instance by id, or null", async () => {
    const found = row("hex_scroll");
    dbFake.selectResults.push([found], []);
    await expect(getInstanceRow("inst-hex_scroll")).resolves.toBe(found);
    await expect(getInstanceRow("missing")).resolves.toBeNull();
  });

  it("lists what a participant holds and suffers", async () => {
    const rows = [row("swamp"), row("hex_scroll")];
    dbFake.selectResults.push(rows);
    await expect(listActiveInstances("sp-1")).resolves.toBe(rows);
  });
});

describe("listHeldItems", () => {
  it("returns the items with their keys, and leaves the effects out", async () => {
    dbFake.selectResults.push([row("hex_scroll", { chargesLeft: 2 }), row("swamp")]);
    await expect(listHeldItems("sp-1", REGISTRY)).resolves.toEqual([
      {
        id: "inst-hex_scroll",
        key: "hex_scroll",
        revisionId: REGISTRY.get("hex_scroll")!.revisionId,
        chargesLeft: 2,
        source: "cell_bonus",
        params: { steps: -2 },
        grantedAt: new Date(5),
      },
    ]);
  });

  it("reads a missing params snapshot as empty; missing charges stay missing (spec §6.10)", async () => {
    // No charges: a passive item that works for as long as it is held.
    dbFake.selectResults.push([row("speed_boots", { chargesLeft: null, params: null })]);
    const [held] = await listHeldItems("sp-1", REGISTRY);
    expect(held).toMatchObject({ chargesLeft: null, params: {} });
  });

  it("drops a revision the season does not play", async () => {
    dbFake.selectResults.push([row("hex_scroll", { revisionId: GONE })]);
    await expect(listHeldItems("sp-1", REGISTRY)).resolves.toEqual([]);
  });
});

describe("listActiveEffects", () => {
  it("returns each status with what is left of it and who cast it", async () => {
    dbFake.selectResults.push([
      { instance: row("swamp", { ownerPlayerId: "sp-2" }), username: "rival" },
      { instance: row("ward", { remaining: 1, remainingUnit: "triggers", anchorRollSeq: null }), username: null },
    ]);
    await expect(listActiveEffects("sp-1", REGISTRY)).resolves.toEqual([
      {
        id: "inst-swamp",
        key: "swamp",
        revisionId: REGISTRY.get("swamp")!.revisionId,
        polarity: "negative",
        remaining: 2,
        unit: "rolls",
        anchorRollSeq: 4,
        castByUsername: "rival",
        grantedAt: new Date(5),
      },
      expect.objectContaining({ key: "ward", polarity: "positive", unit: "triggers", castByUsername: null }),
    ]);
  });

  it("drops a revision the season does not play", async () => {
    dbFake.selectResults.push([{ instance: row("swamp", { revisionId: GONE }), username: null }]);
    await expect(listActiveEffects("sp-1", REGISTRY)).resolves.toEqual([]);
  });
});

describe("effectBadgesBySeason", () => {
  it("groups badges by participant, one per key, newest first", async () => {
    const swamp = REGISTRY.get("swamp")!.revisionId;
    const ward = REGISTRY.get("ward")!.revisionId;
    dbFake.selectResults.push([
      { holder: "sp-1", revisionId: ward },
      { holder: "sp-1", revisionId: ward },
      { holder: "sp-1", revisionId: swamp },
      { holder: "sp-2", revisionId: swamp },
      { holder: null, revisionId: swamp },
      { holder: "sp-3", revisionId: GONE },
    ]);
    const badges = await effectBadgesBySeason("season-1", REGISTRY);
    const names = (key: string) => REGISTRY.get(key)!.names;
    expect([...badges.entries()]).toEqual([
      [
        "sp-1",
        [
          { effectKey: "ward", polarity: "positive", name: names("ward") },
          { effectKey: "swamp", polarity: "negative", name: names("swamp") },
        ],
      ],
      ["sp-2", [{ effectKey: "swamp", polarity: "negative", name: names("swamp") }]],
    ]);
  });
});

describe("bonusItemsBySeason", () => {
  it("counts each participant's bonus items — what a steal, a trade or a copy may take (spec §6.12)", async () => {
    const boots = REGISTRY.get("speed_boots")!.revisionId;
    const hex = REGISTRY.get("hex_scroll")!.revisionId;
    const cursed = REGISTRY.get("cursed_boots")!.revisionId;
    dbFake.selectResults.push([
      { holder: "sp-1", revisionId: boots },
      { holder: "sp-1", revisionId: hex },
      { holder: "sp-1", revisionId: cursed },
      { holder: "sp-2", revisionId: cursed },
      { holder: "sp-3", revisionId: GONE },
      { holder: null, revisionId: boots },
    ]);
    expect([...(await bonusItemsBySeason("season-1", REGISTRY)).entries()]).toEqual([["sp-1", 2]]);
  });
});

describe("activeInstancesBySeason", () => {
  it("splits a season's live instances into items and effects for the staff panel", async () => {
    dbFake.selectResults.push([
      row("hex_scroll", { holderPlayerId: "sp-2", chargesLeft: null }),
      row("toll"),
      row("swamp", { revisionId: GONE }),
      row("speed_boots", { holderPlayerId: null }),
    ]);
    const hex = REGISTRY.get("hex_scroll")!;
    const toll = REGISTRY.get("toll")!;
    await expect(activeInstancesBySeason("season-1", REGISTRY)).resolves.toEqual({
      items: [
        {
          id: "inst-hex_scroll",
          seasonPlayerId: "sp-2",
          itemKey: "hex_scroll",
          chargesLeft: 0,
          name: hex.names,
          glyph: hex.glyph,
        },
      ],
      effects: [
        {
          id: "inst-toll",
          seasonPlayerId: "sp-1",
          effectKey: "toll",
          polarity: "negative",
          name: toll.names,
          glyph: toll.glyph,
        },
      ],
    });
  });
});

describe("standingBySeason (wave B, spec §6.13)", () => {
  const effect = (slug: string, rules: EntryDoc["rules"]): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug,
    name: { ru: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    duration: { unit: "rolls", count: 1 },
    stacking: { mode: "refresh" },
    rules,
  });
  const registry = buildRegistry(
    compileSet([
      { entryId: "00000000-0000-4000-8000-000000000301", revisionId: "rev-veil", doc: effect("veil", [{ when: "whileActive", do: [{ op: "untargetable" }] }]) },
      {
        entryId: "00000000-0000-4000-8000-000000000302",
        revisionId: "rev-crown",
        doc: effect("crown", [{ when: "whileActive", if: [{ op: "rank", is: "leader" }], do: [{ op: "forbidItems" }] }]),
      },
      { entryId: "00000000-0000-4000-8000-000000000303", revisionId: "rev-plain", doc: effect("plain", [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }]) },
    ]),
  );
  const instance = (id: string, revisionId: string, holder: string) =>
    ({ id, revisionId, kind: "effect", holderKind: "player", holderPlayerId: holder, params: {}, grantedAt: new Date(1), causeJournalId: 1 }) as unknown as IeeInstanceRow;

  it("says who is out of reach and who is kept from items — read where they stand", async () => {
    dbFake.selectResults.push(
      [instance("i1", "rev-veil", "sp-1"), instance("i2", "rev-crown", "sp-2"), instance("i3", "rev-plain", "sp-3"), instance("i4", "rev-crown", "sp-4")],
      [
        { id: "sp-1", position: 3, balance: 0, rollSeq: 1, status: "active" },
        { id: "sp-2", position: 9, balance: 0, rollSeq: 1, status: "active" },
        { id: "sp-3", position: 5, balance: 0, rollSeq: 1, status: "active" },
        { id: "sp-4", position: 1, balance: 0, rollSeq: 1, status: "active" },
      ],
    );
    const standing = await standingBySeason("season-1", registry);
    expect(Object.fromEntries(standing)).toEqual({
      "sp-1": { untargetable: true, forbidItems: false, pierce: 0, holdLimit: null, holdLimitBy: null, conditionImmunity: false },
      // The leader is kept from items; the last is not.
      "sp-2": { untargetable: false, forbidItems: true, pierce: 0, holdLimit: null, holdLimitBy: null, conditionImmunity: false },
      "sp-4": { untargetable: false, forbidItems: false, pierce: 0, holdLimit: null, holdLimitBy: null, conditionImmunity: false },
    });
  });

  it("reads nothing more when no standing rule is in force", async () => {
    dbFake.selectResults.push([instance("i3", "rev-plain", "sp-3")]);
    expect((await standingBySeason("season-1", registry)).size).toBe(0);
    expect(dbFake.selectResults).toEqual([]);
  });
});

describe("listRollConditions (wave C, spec §6.17)", () => {
  const condition = (id: string, rollId: string, params: Record<string, string>, status: "active" | "ended" = "active"): IeeInstanceRow => ({
    ...row("swamp"),
    id,
    kind: "roll_condition",
    holderKind: "roll",
    holderPlayerId: null,
    holderRollId: rollId,
    params,
    status,
    endReason: status === "ended" ? "expired" : null,
  });

  it("groups each roll's conditions in order, with the name of the entry that added them; an unreadable one is left out", async () => {
    dbFake.selectResults.push([
      { instance: condition("c-1", "roll-1", { ru: "На высокой сложности", en: "On hard" }), name: { ru: "Сложный режим", en: "Hard Mode" } },
      { instance: condition("c-2", "roll-2", { ru: "Без смертей" }, "ended"), name: null },
      { instance: condition("c-3", "roll-1", {}), name: { ru: "x" } },
    ]);
    const out = await listRollConditions(["roll-1", "roll-2", "roll-1"]);
    expect(Object.fromEntries(out)).toEqual({
      "roll-1": [{ id: "c-1", rollId: "roll-1", text: { ru: "На высокой сложности", en: "On hard" }, from: { ru: "Сложный режим", en: "Hard Mode" }, active: true }],
      "roll-2": [{ id: "c-2", rollId: "roll-2", text: { ru: "Без смертей" }, from: null, active: false }],
    });
  });

  it("asks nothing for no rolls", async () => {
    dbFake.selectResults.push([{ instance: condition("c-1", "roll-1", { ru: "x" }), name: null }]);
    expect((await listRollConditions([])).size).toBe(0);
    dbFake.selectResults.length = 0;
  });
});

describe("poolCounters", () => {
  it("counts drops per entry, keyed by the entry's key, and forgets entries the season does not play", async () => {
    const hex = REGISTRY.get("hex_scroll")!.entryId;
    const ward = REGISTRY.get("ward")!.entryId;
    dbFake.selectResults.push(
      [
        { entryId: hex, n: 3 },
        { entryId: ward, n: 1 },
        { entryId: GONE, n: 9 },
      ],
      [{ entryId: hex, n: 1 }],
      [
        { entryId: hex, n: 40 },
        { entryId: ward, n: 12 },
      ],
    );
    await expect(poolCounters("season-1", "sp-1", REGISTRY)).resolves.toEqual({
      perSeason: { hex_scroll: 3, ward: 1 },
      perPlayer: { hex_scroll: 1 },
      lastDropRollSeq: { hex_scroll: 40, ward: 12 },
    });
  });
});

describe("objects on the board (wave D, spec §6.18)", () => {
  it("lists a season's objects as the board shows them: the item's view, the cell, the owner — one it cannot read left out", async () => {
    const boots = REGISTRY.get("speed_boots")!;
    dbFake.selectResults.push([
      { id: "o-1", cell: 14, revisionId: boots.revisionId, username: "bob", displayName: "Bob" },
      { id: "o-2", cell: 20, revisionId: boots.revisionId, username: null, displayName: null },
      { id: "o-3", cell: 21, revisionId: GONE, username: "bob", displayName: null },
      { id: "o-4", cell: null, revisionId: boots.revisionId, username: "bob", displayName: null },
    ]);
    const view = REGISTRY.instanceView(boots.revisionId)!;
    expect(await boardObjectsBySeason("season-1", REGISTRY)).toEqual([
      {
        instanceId: "o-1",
        cell: 14,
        key: "speed_boots",
        name: view.name,
        ruleText: view.ruleText,
        glyph: view.glyph,
        polarity: view.polarity,
        art: view.art,
        owner: { username: "bob", displayName: "Bob" },
      },
      expect.objectContaining({ instanceId: "o-2", cell: 20, owner: null }),
    ]);
  });

  it("reads the active objects standing on cells", async () => {
    const object = row("speed_boots", { holderKind: "cell", holderPlayerId: null, holderCellIndex: 3 });
    dbFake.selectResults.push([object]);
    expect(await listActiveObjects("season-1")).toEqual([object]);
  });
});

