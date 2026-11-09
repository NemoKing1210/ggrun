import { describe, expect, it } from "vitest";

import type { IeePlayerSnapshot } from "../types/iee";
import { CORE_DOCS } from "../iee/core-docs";
import { compileSet, isEffect, isItem, type EntryDoc } from "../iee/dsl";
import {
  objectCellsFor,
  objectStops,
  planBotItemUse,
  type BotCatalog,
  type BotItemHold,
  type BotOtherPlayer,
  type BotItemInput,
} from "./items";

/** The core entries, looked up the way the season registry does. */
const SET = compileSet(CORE_DOCS);
const lookup = (ref: string) =>
  SET.byKey.get(ref) ?? SET.byEntryId.get(ref) ?? SET.byRevisionId.get(ref) ?? null;
const CATALOG: BotCatalog = {
  item: (ref) => {
    const entry = lookup(ref);
    return entry && isItem(entry) ? entry : null;
  },
  effect: (ref) => {
    const entry = lookup(ref);
    return entry && isEffect(entry) ? entry : null;
  },
};

const ACTOR: IeePlayerSnapshot = {
  seasonPlayerId: "sp-self",
  position: 10,
  balancePoints: 4,
  rollSeq: 3,
  moveCount: 3,
  rank: 2,
  status: "active",
};

function hold(itemKey: string, params: Record<string, number | string | boolean> = {}): BotItemHold {
  return { inventoryId: `inv-${itemKey}`, itemKey, params };
}

function other(overrides: Partial<BotOtherPlayer> = {}): BotOtherPlayer {
  return {
    seasonPlayerId: "sp-rival",
    username: "rival",
    position: 20,
    moveCount: 5,
    status: "active",
    effects: [],
    ...overrides,
  };
}

function input(overrides: Partial<BotItemInput> = {}): BotItemInput {
  return {
    actor: ACTOR,
    hasOpenRoll: false,
    held: [],
    activeEffects: [],
    others: [],
    allowTargetingOthers: true,
    pvpProtectionMoves: 3,
    catalog: CATALOG,
    ...overrides,
  };
}

/** Deterministic rng: no shuffle movement, no score jitter. */
const zero = () => 0;

const opts = { strategy: "leader" as const, autoCleanse: true, rng: zero };

describe("planBotItemUse", () => {
  it("plans nothing with an empty inventory", () => {
    expect(planBotItemUse(input(), opts)).toBeNull();
  });

  it("prefers a cleanse over an attack when a debuff is on the bot", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("hex_scroll"), hold("cleansing_salve")],
        activeEffects: [{ effectKey: "swamp", polarity: "negative" }],
        others: [other()],
      }),
      opts,
    );
    expect(plan).toMatchObject({ itemKey: "cleansing_salve", intent: "cleanse" });
  });

  it("ignores a cleanse item when the only status is positive", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("cleansing_salve")],
        activeEffects: [{ effectKey: "lucky", polarity: "positive" }],
      }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("buffs itself before a roll", () => {
    const plan = planBotItemUse(input({ held: [hold("speed_boots")] }), opts);
    expect(plan).toMatchObject({
      itemKey: "speed_boots",
      intent: "buff",
      targetSeasonPlayerId: ACTOR.seasonPlayerId,
    });
  });

  it("respects the before-roll window: no self-buff while a game is in flight", () => {
    expect(planBotItemUse(input({ held: [hold("speed_boots")], hasOpenRoll: true }), opts)).toBeNull();
  });

  it("hexes the leader under the leader strategy", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("hex_scroll")],
        others: [
          other({ seasonPlayerId: "sp-chaser", position: 12 }),
          other({ seasonPlayerId: "sp-leader", position: 30 }),
        ],
      }),
      opts,
    );
    expect(plan).toMatchObject({ itemKey: "hex_scroll", intent: "attack", targetSeasonPlayerId: "sp-leader" });
  });

  it("aims at the nearest rival under the nearest strategy", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("lead_weights")],
        others: [
          other({ seasonPlayerId: "sp-far", position: 32 }),
          other({ seasonPlayerId: "sp-near", position: 12 }),
        ],
      }),
      { ...opts, strategy: "nearest" },
    );
    expect(plan?.targetSeasonPlayerId).toBe("sp-near");
  });

  it("plants a cursed item on a rival («Свинцовые грузы»): an attack", () => {
    const plan = planBotItemUse(input({ held: [hold("lead_weights")], others: [other()] }), opts);
    expect(plan).toMatchObject({ itemKey: "lead_weights", intent: "attack", targetSeasonPlayerId: "sp-rival" });
  });

  it("never attacks when targeting others is disabled", () => {
    const plan = planBotItemUse(
      input({ held: [hold("hex_scroll")], others: [other()], allowTargetingOthers: false }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("leaves protected newcomers alone", () => {
    const plan = planBotItemUse(
      input({ held: [hold("hex_scroll")], others: [other({ moveCount: 1 })], pvpProtectionMoves: 3 }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("does not re-grant a unique status the bot already carries", () => {
    const plan = planBotItemUse(
      input({ held: [hold("spare_die")], activeEffects: [{ effectKey: "lucky", polarity: "positive" }] }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("does not re-grant a unique status the target already carries", () => {
    const plan = planBotItemUse(
      input({ held: [hold("jinx")], others: [other({ effects: ["unlucky"] })] }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("plays the instance's revision, whatever key it was stored under", () => {
    const hex = CATALOG.item("hex_scroll")!;
    const plan = planBotItemUse(
      input({
        held: [{ inventoryId: "inv-x", itemKey: "renamed", revisionId: hex.revisionId, params: {} }],
        others: [other()],
      }),
      opts,
    );
    expect(plan).toMatchObject({ inventoryId: "inv-x", itemKey: "hex_scroll", intent: "attack" });
  });

  it("skips an item whose revision the season does not play", () => {
    const plan = planBotItemUse(
      input({
        held: [{ inventoryId: "inv-x", itemKey: "ghost", revisionId: "00000000-0000-4000-8000-000000000000", params: {} }],
        others: [other()],
      }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("prefers casting a buff over refreshing one already running", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("speed_boots"), hold("spare_die")],
        // `tailwind` refreshes; `lucky` is fresh — the fresh one wins.
        activeEffects: [{ effectKey: "tailwind", polarity: "positive" }],
      }),
      opts,
    );
    expect(plan).toMatchObject({ itemKey: "spare_die", intent: "buff" });
  });

  it("drops cleanse plans when auto-cleanse is off", () => {
    const plan = planBotItemUse(
      input({ held: [hold("cleansing_salve")], activeEffects: [{ effectKey: "toll", polarity: "negative" }] }),
      { ...opts, autoCleanse: false },
    );
    expect(plan).toBeNull();
  });
});

describe("planBotItemUse — out-of-turn moves (spec §7.3)", () => {
  type Rules = EntryDoc["rules"];
  const item = (n: number, slug: string, who: "self" | "other", rules: Rules) => ({
    entryId: `0000000${n}-0000-4000-8000-00000000000${n}`,
    revisionId: `rev-${slug}`,
    doc: {
      dslVersion: 1 as const,
      kind: "item" as const,
      slug,
      name: { ru: slug, en: slug },
      character: "bonus" as const,
      rarity: "common" as const,
      tags: ["movement"],
      usage: { activation: "active" as const, charges: 1, target: { who } },
      rules,
    },
  });
  const MOVERS = compileSet([
    item(1, "rocket", "self", [{ when: "onUse", do: [{ op: "move", by: 3 }] }]),
    item(2, "hook", "other", [{ when: "onUse", do: [{ op: "moveToTarget", at: "cell" }] }]),
    item(3, "shove", "other", [{ when: "onUse", do: [{ op: "move", by: -2, who: "target" }] }]),
    item(4, "recall", "self", [{ when: "onUse", do: [{ op: "move", by: -2 }] }]),
  ]);
  const movers: BotCatalog = {
    item: (ref) => {
      const entry = MOVERS.byKey.get(ref) ?? null;
      return entry && isItem(entry) ? entry : null;
    },
    effect: () => null,
  };
  const plan = (held: string, others: BotOtherPlayer[] = [other()]) =>
    planBotItemUse(input({ held: [hold(held)], others, catalog: movers }), opts);

  it("moves itself forward as a buff, never back", () => {
    expect(plan("rocket")).toMatchObject({ itemKey: "rocket", intent: "buff" });
    expect(plan("recall")).toBeNull();
  });

  it("pushes a rival back as an attack", () => {
    expect(plan("shove")).toMatchObject({ itemKey: "shove", intent: "attack", targetSeasonPlayerId: "sp-rival" });
  });

  it("jumps to a rival only when that lands it ahead of where it stands", () => {
    expect(plan("hook")).toMatchObject({ itemKey: "hook", intent: "buff" });
    expect(plan("hook", [other({ position: 11 })])).toBeNull();
    expect(plan("hook", [other({ position: 4 })])).toBeNull();
  });
});

describe("planBotItemUse — picks, filters and items that are never used (spec §6.10)", () => {
  const doc = (n: number, slug: string, over: Partial<EntryDoc>) => ({
    entryId: `0000000${n}-0000-4000-8000-0000000000d${n}`,
    revisionId: `rev-${slug}`,
    doc: {
      dslVersion: 1 as const,
      kind: "item" as const,
      slug,
      name: { ru: slug },
      character: "bonus" as const,
      rarity: "common" as const,
      tags: [],
      rules: [],
      ...over,
    } as EntryDoc,
  });
  const SET = compileSet([
    doc(1, "amulet", {
      usage: { activation: "active", charges: 1, target: { who: "self" } },
      rules: [{ when: "onUse", do: [{ op: "remove", what: "any", character: "penalty", pick: "choice" }] }],
    }),
    doc(2, "magnet", {
      usage: { activation: "active", charges: 1, target: { who: "other", filter: "behind" } },
      rules: [{ when: "onUse", do: [{ op: "move", by: -2, who: "target" }] }],
    }),
    doc(3, "boots", {
      character: "penalty",
      usage: { activation: "cursed", charges: 1 },
      rules: [{ when: "afterDice", do: [{ op: "resultModify", delta: -2 }] }],
    }),
  ]);
  const catalog: BotCatalog = {
    item: (ref) => {
      const e = SET.byKey.get(ref) ?? null;
      return e && isItem(e) ? e : null;
    },
    effect: () => null,
  };
  const mine = (character: "bonus" | "penalty", n = 1) => ({ instanceId: `mine-${n}`, kind: "effect" as const, entryId: `e-${n}`, character });

  it("picks its newest penalty for an item that asks, and skips the item with nothing to pick", () => {
    const plan = planBotItemUse(input({ held: [hold("amulet")], catalog, choosable: [mine("bonus", 1), mine("penalty", 2), mine("penalty", 3)] }), opts);
    expect(plan).toMatchObject({ itemKey: "amulet", intent: "cleanse", choiceInstanceId: "mine-2" });
    expect(planBotItemUse(input({ held: [hold("amulet")], catalog, choosable: [mine("bonus")] }), opts)).toBeNull();
  });

  it("aims a filtered item at the first player in its order the filter allows", () => {
    const others = [other({ seasonPlayerId: "sp-ahead", position: 30 }), other({ seasonPlayerId: "sp-behind", position: 4 })];
    // The leader comes first, but a "behind" item may only reach the one behind.
    expect(planBotItemUse(input({ held: [hold("magnet")], catalog, others }), opts)).toMatchObject({
      itemKey: "magnet",
      targetSeasonPlayerId: "sp-behind",
    });
    expect(planBotItemUse(input({ held: [hold("magnet")], catalog, others: [others[0]!] }), opts)).toBeNull();
  });

  it("never plans a cursed item: nothing about it is used", () => {
    expect(planBotItemUse(input({ held: [hold("boots")], catalog }), opts)).toBeNull();
  });
});

describe("planBotItemUse — items changing hands and picks from the catalog (spec §6.12)", () => {
  const doc = (n: number, slug: string, over: Partial<EntryDoc>) => ({
    entryId: `0000000${n}-0000-4000-8000-0000000000e${n}`,
    revisionId: `rev-${slug}`,
    doc: {
      dslVersion: 1 as const,
      kind: "item" as const,
      slug,
      name: { ru: slug },
      character: "bonus" as const,
      rarity: "common" as const,
      tags: [],
      usage: { activation: "active" as const, charges: 1, target: { who: "other" as const } },
      rules: [],
      ...over,
    } as EntryDoc,
  });
  const own = { usage: { activation: "active" as const, charges: 1, target: { who: "self" as const } } };
  const SET = compileSet([
    doc(1, "glove", { rules: [{ when: "onUse", do: [{ op: "stealItem" }] }] }),
    doc(2, "scroll", { rules: [{ when: "onUse", do: [{ op: "swapItems" }] }] }),
    doc(3, "copier", { rules: [{ when: "onUse", do: [{ op: "copyItem" }] }] }),
    doc(4, "gift", { rules: [{ when: "onUse", do: [{ op: "transferItem", to: "target" }] }] }),
    doc(5, "joker", { ...own, rules: [{ when: "onUse", do: [{ op: "grantChosen", rarity: ["common"] }] }] }),
    doc(6, "trinket", { ...own, rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }] }),
    doc(7, "stone", {
      ...own,
      rules: [
        {
          when: "onUse",
          do: [
            { op: "remove", what: "item", character: "bonus", rarity: ["common"], pick: "choice" },
            { op: "grantChosen", rarity: ["common"] },
          ],
        },
      ],
    }),
  ]);
  const catalog: BotCatalog = {
    item: (ref) => {
      const e = SET.byKey.get(ref) ?? null;
      return e && isItem(e) ? e : null;
    },
    effect: () => null,
  };
  const plan = (held: string[], over: Partial<BotItemInput> = {}) =>
    planBotItemUse(input({ held: held.map((k) => hold(k)), catalog, others: [other({ bonusItems: 2 })], ...over }), opts);

  it("steals from a rival who holds something — an attack — and leaves one who holds nothing alone", () => {
    expect(plan(["glove"])).toMatchObject({ itemKey: "glove", intent: "attack", targetSeasonPlayerId: "sp-rival" });
    expect(plan(["glove"], { others: [other({ bonusItems: 0 })] })).toBeNull();
    // Unknown counts as something to take.
    expect(plan(["glove"], { others: [other()] })).toMatchObject({ itemKey: "glove" });
  });

  it("copies a rival's item as a buff; never gives its own away", () => {
    expect(plan(["copier"])).toMatchObject({ itemKey: "copier", intent: "buff" });
    expect(plan(["copier"], { others: [other({ bonusItems: 0 })] })).toBeNull();
    expect(plan(["gift", "trinket"])).toMatchObject({ itemKey: "trinket" });
    expect(plan(["gift"])).toBeNull();
  });

  it("trades only with something of its own to give besides the scroll, with someone who holds something", () => {
    expect(plan(["scroll"])).toBeNull();
    expect(plan(["scroll", "gift"])).toMatchObject({ itemKey: "scroll", intent: "attack" });
    expect(plan(["scroll", "gift"], { others: [other({ bonusItems: 0 })] })).toBeNull();
  });

  it("picks an item of the catalog for one that asks, and skips it when the season offers none", () => {
    const offered = [SET.byKey.get("trinket")!, SET.byKey.get("copier")!].filter(isItem);
    const joker = planBotItemUse(input({ held: [hold("joker")], catalog, entryOptions: () => offered }), opts);
    expect(joker).toMatchObject({ itemKey: "joker", intent: "buff", chosenEntryId: offered[0]!.entryId });
    expect(planBotItemUse(input({ held: [hold("joker")], catalog, entryOptions: () => [] }), opts)).toBeNull();
    expect(planBotItemUse(input({ held: [hold("joker")], catalog }), opts)).toBeNull();
  });

  it("turns only an item of the rarity the stone takes — «Философский камень» (wave B)", () => {
    const offered = [SET.byKey.get("trinket")!].filter(isItem);
    const item = (n: number, rarity: "common" | "rare") => ({ instanceId: `item-${n}`, kind: "item" as const, entryId: `e-${n}`, character: "bonus" as const, rarity });
    const stone = (choosable: ReturnType<typeof item>[]) => planBotItemUse(input({ held: [hold("stone")], catalog, entryOptions: () => offered, choosable }), opts);
    // The newest it may take: the rare one is passed over.
    expect(stone([item(1, "rare"), item(2, "common")])).toMatchObject({ itemKey: "stone", choiceInstanceId: "item-2", chosenEntryId: offered[0]!.entryId });
    expect(stone([item(1, "rare")])).toBeNull();
  });
});

describe("planBotItemUse — what holds (wave B, spec §6.13)", () => {
  it("aims at nobody out of reach: the next one in the strategy's order takes the hit", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("hex_scroll")],
        others: [other({ seasonPlayerId: "sp-leader", position: 30, untargetable: true }), other({ seasonPlayerId: "sp-chaser", position: 12 })],
      }),
      opts,
    );
    expect(plan?.targetSeasonPlayerId).toBe("sp-chaser");
    expect(planBotItemUse(input({ held: [hold("hex_scroll")], others: [other({ untargetable: true })] }), opts)).toBeNull();
  });

  it("kept from its items, it plans nothing", () => {
    expect(planBotItemUse(input({ held: [hold("speed_boots")], forbidden: true }), opts)).toBeNull();
    expect(planBotItemUse(input({ held: [hold("speed_boots")], forbidden: false }), opts)).not.toBeNull();
  });
});

describe("planBotItemUse — the next game (wave C, spec §6.16)", () => {
  const ID = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, "0")}`;
  const doc = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    rules: [],
    ...over,
  });
  const set = compileSet([
    ...CORE_DOCS,
    {
      entryId: ID(1),
      revisionId: ID(101),
      doc: doc("genre_veto", {
        usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "genre" },
        rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: ID(2) }, to: "self" }] }],
      }),
    },
    {
      entryId: ID(2),
      revisionId: ID(102),
      doc: doc("veto_mark", {
        kind: "effect",
        duration: { unit: "next_game" },
        stacking: { mode: "refresh" },
        rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "picked" }] }],
      }),
    },
    {
      entryId: ID(3),
      revisionId: ID(103),
      doc: doc("game_reroll", {
        rarity: "rare",
        usage: { activation: "active", window: "on_open_roll", charges: 1, target: { who: "self" } },
        rules: [{ when: "onUse", do: [{ op: "rerollGame" }] }],
      }),
    },
  ]);
  const find = (ref: string) => set.byKey.get(ref) ?? set.byEntryId.get(ref) ?? set.byRevisionId.get(ref) ?? null;
  const catalog: BotCatalog = {
    item: (ref) => {
      const entry = find(ref);
      return entry && isItem(entry) ? entry : null;
    },
    effect: (ref) => {
      const entry = find(ref);
      return entry && isEffect(entry) ? entry : null;
    },
  };

  it("picks for an item that asks one of what the pool offers, and skips it when the pool offers none", () => {
    const offered = [{ genre: "horror" }, { genre: "rpg" }];
    const plan = planBotItemUse(input({ held: [hold("genre_veto")], catalog, picks: (kind) => (kind === "genre" ? offered : []) }), opts);
    expect(plan).toMatchObject({ itemKey: "genre_veto", intent: "buff", pick: { genre: "horror" } });
    expect(planBotItemUse(input({ held: [hold("genre_veto")], catalog, picks: () => [] }), opts)).toBeNull();
    expect(planBotItemUse(input({ held: [hold("genre_veto")], catalog }), opts)).toBeNull();
  });

  it("spends a reroll of its own game now and then — on an open roll only", () => {
    expect(planBotItemUse(input({ held: [hold("game_reroll")], catalog, hasOpenRoll: true }), opts)).toMatchObject({ itemKey: "game_reroll", intent: "buff" });
    expect(planBotItemUse(input({ held: [hold("game_reroll")], catalog, hasOpenRoll: false }), opts)).toBeNull();
  });
});

describe("planBotItemUse — objects on the board (wave D, spec §6.18)", () => {
  const object = (n: number, slug: string, entered: EntryDoc["rules"][number]["do"]) => ({
    entryId: `0000000${n}-0000-4000-8000-00000000009${n}`,
    revisionId: `rev-${slug}`,
    doc: {
      dslVersion: 1 as const,
      kind: "item" as const,
      slug,
      name: { ru: slug, en: slug },
      character: "bonus" as const,
      rarity: "common" as const,
      tags: ["movement"],
      usage: { activation: "active" as const, charges: 1, target: { who: "self" as const }, pick: "cell" as const },
      rules: [
        { when: "onUse" as const, do: [{ op: "placeObject" as const }] },
        { when: "onObjectEntered" as const, do: entered },
      ],
    },
  });
  const OBJECTS = compileSet([object(1, "mine", [{ op: "stopMove" }, { op: "push", delta: -2 }]), object(2, "spring", [{ op: "extend", delta: 2 }])]);
  const byKey = (key: string) => {
    const entry = OBJECTS.byKey.get(key) ?? null;
    return entry && isItem(entry) ? entry : null;
  };
  const catalog: BotCatalog = { item: byKey, effect: () => null };

  it("an object that stops a move goes on a rival's way; one that helps, on the bot's own", () => {
    const mine = byKey("mine")!;
    const spring = byKey("spring")!;
    expect(objectStops(mine)).toBe(true);
    expect(objectStops(spring)).toBe(false);
    const free = [11, 12, 15, 18, 21, 22, 26, 27, 30];
    // The nearest rival ahead stands on 20: within a move past it.
    expect(objectCellsFor({ item: mine, free, self: 10, rivals: [4, 20, 25] })).toEqual([{ cell: 21 }, { cell: 22 }, { cell: 26 }]);
    expect(objectCellsFor({ item: spring, free, self: 10, rivals: [20] })).toEqual([{ cell: 11 }, { cell: 12 }, { cell: 15 }]);
    expect(objectCellsFor({ item: spring, free, self: 10, rivals: [], reach: 2 })).toEqual([{ cell: 11 }, { cell: 12 }]);
    // Nobody ahead to stop: nowhere to put it.
    expect(objectCellsFor({ item: mine, free, self: 10, rivals: [4, 9] })).toEqual([]);
  });

  it("places what it holds on a cell the caller found: a trap is an attack, a boost a buff", () => {
    const picks = (cells: number[]) => () => cells.map((cell) => ({ cell }));
    expect(planBotItemUse(input({ held: [hold("mine")], catalog, picks: picks([21]) }), opts)).toMatchObject({ itemKey: "mine", intent: "attack", pick: { cell: 21 } });
    expect(planBotItemUse(input({ held: [hold("spring")], catalog, picks: picks([12]) }), opts)).toMatchObject({ itemKey: "spring", intent: "buff", pick: { cell: 12 } });
    // No cell for it, no use.
    expect(planBotItemUse(input({ held: [hold("mine")], catalog, picks: picks([]) }), opts)).toBeNull();
    expect(planBotItemUse(input({ held: [hold("mine")], catalog }), opts)).toBeNull();
  });
});

