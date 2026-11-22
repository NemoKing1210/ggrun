import { describe, expect, it } from "vitest";
import { CORE_DOCS } from "./iee/core-docs";
import { compileSet } from "./iee/dsl/set";
import { isEffect, isItem, type CompiledItem, type RuleContext } from "./iee/dsl/runtime";
import { TURN_HOOKS } from "./iee/resolve/live";
import { RARITY_WEIGHT, type HookName, type IeeIntent, type IeePlayerSnapshot } from "./types";

/**
 * The core set as a whole — what every season plays in stage 1. Each document
 * is checked on its own by the compiler (`core-docs/core-docs.test.ts`); these
 * are the properties of the set that no single entry can promise.
 */
const SET = compileSet(CORE_DOCS);
const all = SET.entries;
const items = all.filter(isItem);
const effects = all.filter(isEffect);

const player = (seasonPlayerId: string): IeePlayerSnapshot => ({
  seasonPlayerId,
  position: 10,
  balancePoints: 5,
  rollSeq: 1,
  moveCount: 1,
  rank: 1,
  status: "active",
});

/** What using an item asks for, aimed at `target` (null = nobody). */
const activate = (item: CompiledItem, target: IeePlayerSnapshot | null) =>
  item.use({
    params: item.defaults,
    actor: player("sp-actor"),
    target,
    actorEntries: [],
    targetEntries: [],
    rng: () => 0,
  });

/** Every intent an item produces when used the way it is meant to be. */
const intentsOf = (item: CompiledItem): IeeIntent[] =>
  activate(item, item.usage.target === "self" || item.usage.target === "none" ? null : player("sp-target")).intents;

describe("core set — structural invariants", () => {
  it("compiles whole: every entry plays", () => {
    expect(SET.failures).toEqual([]);
    expect(all).toHaveLength(CORE_DOCS.length);
  });

  it("has entries of both polarities", () => {
    expect(all.some((e) => e.polarity === "positive")).toBe(true);
    expect(all.some((e) => e.polarity === "negative")).toBe(true);
  });

  it("every key is a stable snake_case identifier", () => {
    for (const e of all) expect(e.key).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("keys are unique across items and effects", () => {
    expect(SET.byKey.size).toBe(all.length);
  });

  it("every rarity is one the weight table knows", () => {
    for (const e of all) expect(RARITY_WEIGHT[e.rarity]).toBeGreaterThan(0);
  });

  it("every entry names a glyph the art table knows, rather than a file nobody drew", () => {
    // The compiler drops an unknown glyph to null (the kind's fallback), so a
    // non-null glyph is a known one.
    for (const e of all) expect(e.glyph, e.key).toMatch(/^[A-Z][A-Za-z0-9]*Icon$/);
  });
});

describe("core set — effects", () => {
  it("every effect has at least one rule", () => {
    for (const e of effects) {
      // An answer to what arrives and a standing state are rules too (wave B, spec §6.13);
      // so are the next game's — its pick and the conditions it gets (wave C, spec §6.16, §6.17).
      const rules =
        Object.values(e.hooks).flat().length +
        e.onApply.length +
        e.onExpire.length +
        e.incoming.length +
        e.standing.length +
        e.pool.length +
        e.rollCreated.length;
      expect(rules, e.key).toBeGreaterThan(0);
    }
  });

  it("no effect relies on a hook the loop does not dispatch", () => {
    for (const e of effects) {
      for (const hook of Object.keys(e.hooks)) expect(TURN_HOOKS as readonly string[]).toContain(hook);
    }
  });

  it("a counted effect always starts with at least one", () => {
    for (const e of effects) {
      // Permanent ones never run out; instant ones act as they arrive (wave A).
      if (e.duration.unit !== "permanent" && e.duration.unit !== "instant") expect(e.duration.count, e.key).toBeGreaterThan(0);
    }
  });
});

describe("core set — items", () => {
  it("every item is used, held or cursed — held: the protections (wave B, spec §6.13) and «Корона» (wave D, §6.19)", () => {
    expect(items.filter((i) => i.usage.activation === "passive").map((i) => i.key).sort()).toEqual(["crown", "mirror_shield", "phoenix", "shield"]);
    // Every penalty item is cursed, and every cursed item a penalty (D3, wave A).
    for (const item of items) expect(item.usage.activation === "cursed", item.key).toBe(item.character === "penalty");
  });

  it("every item starts with at least one charge — but «Корона», held until a rival takes it (wave D, §6.19)", () => {
    expect(items.filter((i) => i.usage.charges === null).map((i) => i.key)).toEqual(["crown"]);
    for (const item of items) if (item.usage.charges !== null) expect(item.usage.charges, item.key).toBeGreaterThan(0);
  });

  it("an item that grants an entry names one the set plays", () => {
    for (const item of items) {
      for (const intent of intentsOf(item)) {
        if (intent.kind === "grant") expect(SET.byEntryId.get(intent.entryId)?.key, item.key).toBe(intent.key);
      }
    }
  });

  it("a tool is a reward and a curse a punishment: each item drops from its own wheel (§12 B7)", () => {
    for (const item of items) expect(item.polarity, item.key).toBe(item.usage.activation === "cursed" ? "negative" : "positive");
  });

  it("an item aimed at others refuses a missing or self target", () => {
    for (const item of items) {
      if (item.usage.target !== "other") continue;
      expect(activate(item, null).rejected, item.key).toBe("ieeTargetRequired");
      expect(activate(item, player("sp-actor")).rejected, item.key).toBe("ieeTargetSelfNotAllowed");
    }
  });
});

/**
 * §8.3: "every negative effect ships with a counter". A pool of punishments
 * with no answer is a frustration generator, so this is an invariant, not a
 * style note — it fails the build if someone adds a curse with no cure.
 */
describe("core set — counter-play (§8.3)", () => {
  const negatives = effects.filter((e) => e.polarity === "negative");

  it("there is at least one negative effect to answer", () => {
    expect(negatives.length).toBeGreaterThan(0);
  });

  it("a universal cleanse exists and clears negatives", () => {
    const cleansers = items.filter((item) =>
      intentsOf(item).some(
        (i) => i.kind === "cleanse" && i.count === "all" && i.character === "penalty" && i.tags.length === 0,
      ),
    );
    expect(cleansers.length).toBeGreaterThan(0);
  });

  /**
   * A cleanse answers everything, but a status that shortens a move should
   * also have something that lengthens one — otherwise the only counter-play
   * is spending a rare item, which is thin. Asserted per hook rather than as a
   * blanket claim, so it says something real.
   */
  it("every movement-shaping negative has a positive on the same hook", () => {
    const positives = effects.filter((e) => e.polarity === "positive");
    for (const negative of negatives) {
      for (const hook of Object.keys(negative.hooks) as HookName[]) {
        if (hook !== "beforeMovement" && hook !== "afterMovement") continue;
        const opposite = positives.some((e) => (e.hooks[hook]?.length ?? 0) > 0);
        expect(opposite, `no positive effect answers ${negative.key} on ${hook}`).toBe(true);
      }
    }
  });

  it("a penalty landing can be prevented outright", () => {
    // Declaring a `beforeCellEffect` rule is not counter-play; returning a
    // veto for a penalty cell is. The end-to-end half — that the veto also
    // stops the wheel's drop — is the SC-SHIELD scenarios, run on the executor.
    const ctx = (params: RuleContext["params"]): RuleContext => ({
      trigger: "beforeCellEffect",
      params,
      self: player("sp"),
      target: null,
      turn: { rollSeq: 1, outcome: "passed", cellType: "penalty" },
      selfEntries: [],
      targetEntries: [],
      rng: () => 0,
    });
    const vetoes = effects.filter((e) =>
      (e.hooks.beforeCellEffect ?? []).some((rule) => rule.run(ctx(e.defaults))?.skipCellEffect === true),
    );
    expect(vetoes.map((e) => e.key)).not.toEqual([]);
  });
});
