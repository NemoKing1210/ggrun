import { describe, expect, it } from "vitest";
import * as EnIee from "../i18n/dictionaries/en/iee";
import * as RuIee from "../i18n/dictionaries/ru/iee";
import * as UkIee from "../i18n/dictionaries/uk/iee";
import { catalogCandidates, EFFECTS, ITEMS, listEffects, listItems } from "./iee";
import { RARITY_WEIGHT } from "./types";
import type { HookName } from "./types";

/** The hooks resolveGameRoll actually dispatches (see WORKLOG, phase 9). */
const WIRED_HOOKS: HookName[] = [
  "beforeMovement",
  "afterMovement",
  "beforeCellEffect",
  "afterCellEffect",
  "onOutcome",
  "onTick",
];

const dict = (root: Record<string, unknown>, path: string): unknown => {
  let node: unknown = { iee: root };
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
};

const LOCALES: Array<[string, Record<string, unknown>]> = [
  ["en", EnIee.iee as unknown as Record<string, unknown>],
  ["ru", RuIee.iee as unknown as Record<string, unknown>],
  ["uk", UkIee.iee as unknown as Record<string, unknown>],
];

describe("catalog — structural invariants", () => {
  const all = [...listItems(), ...listEffects()];

  it("has entries of both polarities", () => {
    expect(all.some((d) => d.polarity === "positive")).toBe(true);
    expect(all.some((d) => d.polarity === "negative")).toBe(true);
  });

  it("every key is a stable snake_case identifier", () => {
    for (const def of all) expect(def.key).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("keys are unique across items and effects", () => {
    const keys = all.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the registry key always matches the definition's own key", () => {
    for (const [key, def] of Object.entries(ITEMS)) expect(def.key).toBe(key);
    for (const [key, def] of Object.entries(EFFECTS)) expect(def.key).toBe(key);
  });

  it("every rarity is one the weight table knows", () => {
    for (const def of all) expect(RARITY_WEIGHT[def.rarity]).toBeGreaterThan(0);
  });

  it("every entry names a Heroicon rather than a file nobody drew", () => {
    for (const def of all) expect(def.heroIcon).toMatch(/^[A-Z][A-Za-z0-9]*Icon$/);
  });

  it("catalogCandidates covers the whole catalog", () => {
    expect(catalogCandidates()).toHaveLength(all.length);
  });
});

describe("catalog — i18n", () => {
  const all = [...listItems(), ...listEffects()];

  it("stores dictionary keys, never literal text", () => {
    for (const def of all) {
      expect(def.i18n.name).toMatch(/^iee\.(items|effects)\.[A-Za-z0-9]+\.name$/);
      expect(def.i18n.description).toMatch(/^iee\.(items|effects)\.[A-Za-z0-9]+\.description$/);
    }
  });

  it.each(LOCALES)("%s resolves a name and a description for every entry", (_loc, root) => {
    for (const def of all) {
      const name = dict(root, def.i18n.name);
      const description = dict(root, def.i18n.description);
      expect(typeof name).toBe("string");
      expect((name as string).length).toBeGreaterThan(0);
      expect(typeof description).toBe("string");
      expect((description as string).length).toBeGreaterThan(0);
    }
  });

  it("the three languages never share the same string for a name", () => {
    for (const def of all) {
      const names = LOCALES.map(([, root]) => dict(root, def.i18n.name) as string);
      // ru and uk may legitimately coincide; en should differ from at least one.
      expect(new Set(names).size).toBeGreaterThan(1);
    }
  });
});

describe("catalog — effects", () => {
  it("every effect implements at least one hook", () => {
    for (const def of listEffects()) {
      expect(Object.keys(def.hooks).length).toBeGreaterThan(0);
    }
  });

  it("no effect relies on a hook the loop does not dispatch", () => {
    for (const def of listEffects()) {
      for (const hook of Object.keys(def.hooks) as HookName[]) {
        expect(WIRED_HOOKS).toContain(hook);
      }
    }
  });

  it("a charge-based effect always starts with at least one", () => {
    for (const def of listEffects()) {
      if (def.duration.kind === "charges") expect(def.duration.value).toBeGreaterThan(0);
    }
  });

  it("a roll-based effect always lasts at least one roll", () => {
    for (const def of listEffects()) {
      if (def.duration.kind === "rolls") expect(def.duration.value).toBeGreaterThan(0);
    }
  });
});

describe("catalog — items", () => {
  it("every item is active: a passive one would need a hook table it cannot have", () => {
    for (const def of listItems()) expect(def.usage.mode).toBe("active");
  });

  it("every item starts with at least one charge", () => {
    for (const def of listItems()) expect(def.usage.charges).toBeGreaterThan(0);
  });

  it("an item that grants an effect names one that exists", () => {
    for (const def of listItems()) {
      const key = def.defaults.effectKey;
      if (typeof key === "string") expect(EFFECTS[key]).toBeDefined();
    }
  });

  it("items are all in the positive pool — a tool is a reward (§12 B7)", () => {
    for (const def of listItems()) expect(def.polarity).toBe("positive");
  });

  it("an item aimed at others refuses a missing or self target", () => {
    const actor = {
      seasonPlayerId: "a", position: 0, balancePoints: 0, rollSeq: 0,
      moveCount: 0, rank: 1, status: "active" as const,
    };
    for (const def of listItems()) {
      if (def.usage.target !== "other") continue;
      expect(def.apply({ itemKey: def.key, params: def.defaults, actor, target: null }).rejected)
        .toBe("ieeTargetRequired");
      expect(
        def.apply({ itemKey: def.key, params: def.defaults, actor, target: actor }).rejected,
      ).toBe("ieeTargetSelfNotAllowed");
    }
  });
});

/**
 * §8.3: "every negative effect ships with a counter". A pool of punishments
 * with no answer is a frustration generator, so this is an invariant, not a
 * style note — it fails the build if someone adds a curse with no cure.
 */
describe("catalog — counter-play (§8.3)", () => {
  const negatives = listEffects().filter((d) => d.polarity === "negative");

  it("there is at least one negative effect to answer", () => {
    expect(negatives.length).toBeGreaterThan(0);
  });

  it("a universal cleanse exists and clears negatives", () => {
    const cleansers = listItems().filter((def) => {
      const out = def.apply({
        itemKey: def.key,
        params: def.defaults,
        actor: {
          seasonPlayerId: "a", position: 0, balancePoints: 0, rollSeq: 0,
          moveCount: 0, rank: 1, status: "active",
        },
        target: null,
      });
      return (out.cleanse ?? []).some(
        (c) => c.effectKeys === "all" && c.polarity === "negative",
      );
    });
    expect(cleansers.length).toBeGreaterThan(0);
  });

  /**
   * A cleanse answers everything, but a status that shortens a move should
   * also have something that lengthens one — otherwise the only counter-play
   * is spending a rare item, which is thin. Asserted per hook rather than as a
   * blanket claim, so it says something real.
   */
  it("every movement-shaping negative has a positive on the same hook", () => {
    const positives = listEffects().filter((d) => d.polarity === "positive");
    for (const negative of negatives) {
      for (const hook of Object.keys(negative.hooks) as HookName[]) {
        if (hook !== "beforeMovement" && hook !== "afterMovement") continue;
        const opposite = positives.some((d) => hook in d.hooks);
        expect(
          opposite,
          `no positive effect answers ${negative.key} on ${hook}`,
        ).toBe(true);
      }
    }
  });

  it("a penalty landing can be prevented outright", () => {
    // This asserted only that *some* effect declares a `beforeCellEffect`
    // hook, and it passed happily while the shield was absorbing half a
    // landing: the cell's balance penalty was vetoed, and the wheel handed the
    // player the negative status anyway. Declaring a hook is not counter-play;
    // returning a veto is. The end-to-end half — that the veto actually stops
    // the drop — is `probe/shield.mjs`, because that wiring lives in the
    // service layer, not here.
    const vetoes = listEffects().filter((def) => {
      const hook = def.hooks.beforeCellEffect;
      if (!hook) return false;
      const patch = hook({
        hook: "beforeCellEffect",
        effectKey: def.key,
        params: def.defaults,
        self: {
          seasonPlayerId: "sp",
          position: 10,
          balancePoints: 5,
          rollSeq: 1,
          moveCount: 1,
          rank: 1,
          status: "active",
        },
        turn: { rollSeq: 1, outcome: "passed", cellType: "penalty" },
      });
      return patch.skipCellEffect === true;
    });
    expect(vetoes.map((d) => d.key)).not.toEqual([]);
  });
});
