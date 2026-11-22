import { describe, expect, it } from "vitest";

import { IeeConfigSchema, type IeePlayerSnapshot, type MoveIntent } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";
import type { FiredRule } from "@/lib/engine/iee/resolve/live";

import { buildRegistry, coreRegistry, type SeasonRegistry } from "../registry";
import { catalogRegistry } from "../registry/catalog.test-helpers";
import {
  MAX_CHAIN_DEPTH,
  applyBalance,
  cleanse,
  copyItem,
  endInstance,
  factsOfRows,
  fire,
  grant,
  journalCompileFailures,
  moveItems,
  movePlayer,
  outOfTurnLanding,
  resetSeason,
  runIntents,
  swapItems,
  tick,
  useCharge,
  type BoardInfo,
  type ExecContext,
} from "./index";
import { memoryStore } from "./memory-store.test-helpers";

const SEASON = "season-1";
const ME = "sp-me";
const RIVAL = "sp-rival";

function setup(
  over: Partial<ExecContext> & { balances?: Record<string, number>; anchor?: number } = {},
) {
  const mem = memoryStore({ balances: over.balances ?? { [ME]: 5, [RIVAL]: 1 } });
  const snapshot = async (id: string): Promise<IeePlayerSnapshot> => ({
    seasonPlayerId: id,
    position: 3,
    balancePoints: mem.balances.get(id) ?? 0,
    rollSeq: 5,
    moveCount: 5,
    rank: 1,
    status: "active",
  });
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: coreRegistry(),
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng: () => 0.5,
    snapshot,
    anchorFor: async () => ({ anchorRollSeq: over.anchor ?? 5 }),
    ...over,
  };
  return { ctx, ...mem };
}

const ops = (journal: { op: string }[]) => journal.map((j) => j.op);

describe("grant — items", () => {
  it("creates the instance with the season's charges and journals why", async () => {
    const registry = catalogRegistry({ hex_scroll: { durationOverride: 2 } });
    const { ctx, instances, journal } = setup({ registry });
    const result = await grant(ctx, { entry: "hex_scroll", to: ME, source: "cell_bonus", sourceMoveId: "move-1", reveal: true });

    expect(result.state).toBe("granted");
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      id: result.instanceId,
      kind: "item",
      holderKind: "player",
      holderPlayerId: ME,
      chargesLeft: 2,
      remaining: null,
      source: "cell_bonus",
      sourceMoveId: "move-1",
      causeJournalId: result.journalId,
      grantedRollSeq: 40,
      status: "active",
    });
    expect(journal[0]).toMatchObject({ op: "grant", targetPlayerId: ME, visibility: "public", turnSeq: 40 });
    expect(result.feed).toEqual([
      {
        eventType: "item_granted",
        payload: {
          itemKey: "hex_scroll",
          instanceId: result.instanceId,
          source: "cell_bonus",
          polarity: "positive",
          name: { ru: "Свиток порчи", en: "Hex Scroll", uk: "Сувій порчі" },
        },
      },
    ]);
  });

  it("keeps quiet in the feed when the season hides drops, and journals for staff", async () => {
    const { ctx, journal } = setup();
    const result = await grant(ctx, { entry: "speed_boots", to: ME, source: "cell_bonus", reveal: false });
    expect(result.feed).toEqual([]);
    expect(journal[0]!.visibility).toBe("staff");
  });

  it("an unknown key is refused and journaled, never thrown", async () => {
    const { ctx, instances, journal } = setup();
    const result = await grant(ctx, { entry: "excalibur", to: ME, source: "admin", reveal: true });
    expect(result).toMatchObject({ state: "unknown_entry", entry: null, instanceId: null, feed: [] });
    expect(instances).toEqual([]);
    expect(journal[0]).toMatchObject({ op: "noop", outcome: { reason: "unknown_entry" }, intent: { entry: "excalibur" } });
  });

  it("journals the draws that decided the grant, granted, refreshed or refused", async () => {
    const { ctx, journal } = setup();
    await grant(ctx, { entry: "hex_scroll", to: ME, source: "cell_bonus", reveal: false, draws: [0.25] });
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false, draws: [0.5, 0.75] });
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false, draws: [0.1] });
    await grant(ctx, { entry: "excalibur", to: ME, source: "cell_bonus", reveal: false, draws: [0.9] });
    await grant(ctx, { entry: "speed_boots", to: ME, source: "admin", reveal: false });
    expect(journal.map((j) => [j.op, j.rng])).toEqual([
      ["grant", [0.25]],
      ["grant", [0.5, 0.75]],
      ["grant", [0.1]],
      ["noop", [0.9]],
      // A grant nobody drew for records no draws.
      ["grant", null],
    ]);
    expect(journal[2]!.outcome).toMatchObject({ state: "refreshed" });
  });
});

describe("grant — effects and stacking", () => {
  it("a new effect starts with the season's numbers and counts from its anchor", async () => {
    const registry = catalogRegistry({ swamp: { paramOverrides: { steps: -3 }, durationOverride: 4 } });
    const { ctx, instances, journal } = setup({ registry, anchor: 6 });
    const result = await grant(ctx, { entry: "swamp", to: RIVAL, source: "item", ownerPlayerId: ME, reveal: false });

    expect(result.state).toBe("granted");
    expect(instances[0]).toMatchObject({
      kind: "effect",
      holderPlayerId: RIVAL,
      ownerPlayerId: ME,
      params: { steps: -3 },
      remaining: 4,
      remainingUnit: "moves",
      anchorRollSeq: 6,
    });
    expect(journal[0]).toMatchObject({ op: "grant", actorPlayerId: ME, targetPlayerId: RIVAL });
  });

  it("an override that breaks its declaration is not applied, and the journal says so", async () => {
    const registry = catalogRegistry({ swamp: { paramOverrides: { steps: 4 } } });
    const { ctx, instances, journal } = setup({ registry });
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: true });
    expect(instances[0]!.params).toEqual({ steps: -1 });
    expect(journal[0]!.outcome).toMatchObject({ overrideProblems: [{ param: "steps", reason: "range" }] });
  });

  it("unique: a second grant is refused (noop) and nothing is added", async () => {
    const { ctx, instances, journal } = setup();
    await grant(ctx, { entry: "unlucky", to: ME, source: "cell_penalty", reveal: true });
    const second = await grant(ctx, { entry: "unlucky", to: ME, source: "item", reveal: true });
    expect(second.state).toBe("blocked_unique");
    expect(second.feed).toEqual([]);
    expect(instances).toHaveLength(1);
    expect(ops(journal)).toEqual(["grant", "noop"]);
    expect(journal[1]!.outcome).toEqual({ reason: "unique" });
  });

  it("refresh: a renewal during a game in flight covers the moves after it — that game stays with the old count", async () => {
    const { ctx, instances, journal } = setup({ anchor: 5 });
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: true });
    instances[0]!.remaining = 1; // one move left: the one in flight
    instances[0]!.anchorRollSeq = 3;
    ctx.anchorFor = async () => ({ anchorRollSeq: 6 });

    const again = await grant(ctx, { entry: "swamp", to: ME, source: "item", reveal: true });
    expect(again.state).toBe("refreshed");
    expect(instances).toHaveLength(1);
    // Still plays from its anchor; counts from the game in flight, as a fresh copy would.
    expect(instances[0]).toMatchObject({ remaining: 2, anchorRollSeq: 3, countFromRollSeq: 6 });
    expect(journal[1]!.outcome).toEqual({ state: "refreshed", before: 1, after: 2, countFromRollSeq: 6 });
    expect(again.feed[0]).toMatchObject({ eventType: "effect_applied", payload: { refreshed: true } });

    const moved = { roll: true as const, moved: true, passed: true };
    await tick(ctx, { holder: ME, rollSeq: 6, ticks: moved, reveal: false });
    expect(instances[0]!.remaining).toBe(2);
    await tick(ctx, { holder: ME, rollSeq: 7, ticks: moved, reveal: false });
    await tick(ctx, { holder: ME, rollSeq: 8, ticks: moved, reveal: false });
    expect(instances[0]).toMatchObject({ remaining: 0, status: "ended", endReason: "expired" });
    // An ended instance is not renewed behind the executor's back either.
    expect(await ctx.store.renew(instances[0]!.id, { remaining: 2, countFromRollSeq: 9 })).toBeNull();
  });

  it("refresh: a passed game counts against a renewal only after the roll it arrived in (owner's call, 2026-10-09)", async () => {
    // «Отравление»: two passed games. One left, then the landing of roll 6
    // hands it out again; roll 6 was passed.
    const { ctx, instances } = setup({ anchor: 5 });
    await grant(ctx, { entry: "poison", to: ME, source: "cell_penalty", reveal: false });
    instances[0]!.remaining = 1;
    await grant(ctx, { entry: "poison", to: ME, source: "cell_penalty", reveal: false, anchor: { anchorRollSeq: 6 } });
    const passed = { roll: true as const, moved: true, passed: true };
    await tick(ctx, { holder: ME, rollSeq: 6, ticks: passed, reveal: false });
    expect(instances[0]!.remaining).toBe(2);
    await tick(ctx, { holder: ME, rollSeq: 7, ticks: passed, reveal: false });
    expect(instances[0]!.remaining).toBe(1);
  });

  it("refresh: a firing on the roll a renewal arrived in stays with the old count; later firings count against it", async () => {
    const registry = buildRegistry(
      compileSet([
        {
          entryId: ID(7),
          revisionId: ID(107),
          doc: doc("guard", {
            duration: { unit: "triggers", count: 2 },
            stacking: { mode: "refresh" },
            rules: [{ when: "beforeCellEffect", if: [{ op: "cellType", in: ["penalty"] }], do: [{ op: "skipCellEffect" }] }],
          }),
        },
      ]),
    );
    const { ctx, instances } = setup({ registry, anchor: 5 });
    const { instanceId } = await grant(ctx, { entry: "guard", to: ME, source: "cell_bonus", reveal: false });
    instances[0]!.remaining = 1;
    // Roll 6: the guard fires, and the landing hands it out again.
    await grant(ctx, { entry: "guard", to: ME, source: "cell_bonus", reveal: false, anchor: { anchorRollSeq: 6 } });
    await fire(ctx, { fired: [], consumed: [instanceId!], rollSeq: 6, reveal: false });
    expect(instances[0]!.remaining).toBe(2);
    await fire(ctx, { fired: [], consumed: [instanceId!], rollSeq: 7, reveal: false });
    expect(instances[0]!.remaining).toBe(1);
  });

  it("refresh: the old copy stays when it lasts longer", async () => {
    const { ctx, instances, journal } = setup();
    await grant(ctx, { entry: "poison", to: ME, source: "cell_penalty", reveal: false });
    instances[0]!.remaining = 3;
    await grant(ctx, { entry: "poison", to: ME, source: "item", reveal: false });
    expect(instances[0]).toMatchObject({ remaining: 3, countFromRollSeq: null });
    expect(journal[1]!.outcome).toEqual({ state: "refreshed", before: 3, after: 3 });
  });

  it("refresh never shortens", async () => {
    const { ctx, instances } = setup({ registry: catalogRegistry({ swamp: { durationOverride: 5 } }) });
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false });
    // The season retunes it shorter; the instance already granted keeps its end.
    ctx.registry = catalogRegistry({ swamp: {} });
    await grant(ctx, { entry: "swamp", to: ME, source: "item", reveal: false });
    expect(instances[0]!.remaining).toBe(5);
  });

  it("stack: every grant is its own instance", async () => {
    const { ctx, instances } = setup();
    await grant(ctx, { entry: "ward", to: ME, source: "cell_bonus", reveal: true });
    await grant(ctx, { entry: "ward", to: ME, source: "cell_bonus", reveal: true });
    expect(instances.map((i) => [i.remaining, i.remainingUnit])).toEqual([
      [1, "triggers"],
      [1, "triggers"],
    ]);
  });
});

// --- entries with lifecycle rules, for chains -------------------------------

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const doc = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
  dslVersion: 1,
  kind: "effect",
  slug,
  name: { ru: slug, en: slug, uk: slug },
  character: "bonus",
  rarity: "common",
  tags: [],
  duration: { unit: "rolls", count: 1 },
  stacking: { mode: "stack" },
  rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }],
  ...over,
});

function chainRegistry(): SeasonRegistry {
  const grantNext = (n: number) => ({ when: "onApply", do: [{ op: "grantEffect", entry: { entry: ID(n) }, to: "self" }] });
  return buildRegistry(
    compileSet([
      { entryId: ID(1), revisionId: ID(101), doc: doc("link_one", { rules: [grantNext(2)] }) },
      { entryId: ID(2), revisionId: ID(102), doc: doc("link_two", { rules: [grantNext(3)] }) },
      { entryId: ID(3), revisionId: ID(103), doc: doc("link_three", { rules: [grantNext(4)] }) },
      { entryId: ID(4), revisionId: ID(104), doc: doc("link_four", {}) },
      {
        entryId: ID(5),
        revisionId: ID(105),
        doc: doc("blessing", {
          duration: { unit: "rolls", count: 1 },
          rules: [
            { when: "onApply", do: [{ op: "balance", amount: 2 }] },
            { when: "onExpire", if: [{ op: "chance", percent: 60 }], do: [{ op: "balance", amount: -1 }] },
          ],
        }),
      },
      {
        entryId: ID(6),
        revisionId: ID(106),
        doc: doc("curse_mark", { character: "penalty", tags: ["dice"], rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }] }),
      },
      {
        entryId: ID(7),
        revisionId: ID(107),
        doc: doc("cure", {
          rules: [{ when: "onApply", do: [{ op: "cleanse", character: "penalty", count: "all" }] }],
        }),
      },
    ]),
  );
}

describe("grant — lifecycle rules and chains", () => {
  it("onApply runs and its intents are carried out", async () => {
    const { ctx, journal, balances, ledger } = setup({ registry: chainRegistry() });
    await grant(ctx, { entry: "blessing", to: ME, source: "cell_bonus", reveal: false });
    expect(balances.get(ME)).toBe(7);
    expect(ledger).toEqual([{ seasonPlayerId: ME, delta: 2, reason: "effect:blessing" }]);
    expect(ops(journal)).toEqual(["grant", "fire", "balance"]);
    expect(journal[1]).toMatchObject({ op: "fire", ruleIndex: 0, intent: { hook: "onApply" }, causeId: 1 });
    expect(journal[2]!.causeId).toBe(2);
  });

  it("a chain stops at depth two", async () => {
    const { ctx, instances, journal } = setup({ registry: chainRegistry() });
    await grant(ctx, { entry: "link_one", to: ME, source: "cell_bonus", reveal: false });
    expect(MAX_CHAIN_DEPTH).toBe(2);
    expect(instances.map((i) => i.revisionId)).toEqual([ID(101), ID(102), ID(103)]);
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "chain_depth" } });
  });

  it("a cleanse from a rule takes the holder's penalty effects", async () => {
    const { ctx, instances } = setup({ registry: chainRegistry() });
    await grant(ctx, { entry: "curse_mark", to: ME, source: "cell_penalty", reveal: false });
    await grant(ctx, { entry: "cure", to: ME, source: "cell_bonus", reveal: false });
    expect(instances.find((i) => i.revisionId === ID(106))).toMatchObject({ status: "ended", endReason: "cleansed" });
    expect(instances.find((i) => i.revisionId === ID(107))!.status).toBe("active");
  });

  it("onExpire runs when a counter runs out, with its rng journaled", async () => {
    const { ctx, journal, balances } = setup({ registry: chainRegistry(), rng: () => 0.3 });
    await grant(ctx, { entry: "blessing", to: ME, source: "cell_bonus", reveal: false });
    const feed = await tick(ctx, { holder: ME, rollSeq: 6, ticks: { roll: true, moved: true, passed: true }, reveal: true });
    expect(balances.get(ME)).toBe(6);
    expect(feed.map((f) => f.eventType)).toEqual(["effect_expired"]);
    const fired = journal.filter((j) => j.op === "fire" && (j.intent as { hook?: string }).hook === "onExpire");
    expect(fired).toHaveLength(1);
    expect(fired[0]!.rng).toEqual([0.3]);
  });

  it("runIntents grants to the turn's holder at the turn's anchor", async () => {
    const { ctx, instances } = setup();
    const swampId = coreRegistry().get("swamp")!.entryId;
    await runIntents(ctx, [{ kind: "grant", entryId: swampId, key: "swamp", entryKind: "effect", to: ME }], {
      source: "rule:test",
      reveal: false,
      anchor: { seasonPlayerId: ME, anchorRollSeq: 9 },
    });
    expect(instances[0]).toMatchObject({ anchorRollSeq: 9, source: "rule:test" });
  });
});

describe("grant — season-wide limits (spec §4.5)", () => {
  const limited = (over: Record<string, unknown>) => IeeConfigSchema.parse({ enabled: true, ...over });

  it("a disabled tag removes the entry from the season, whoever hands it out", async () => {
    const { ctx, instances, journal } = setup({ config: limited({ disabledTags: ["movement"] }) });
    const result = await grant(ctx, { entry: "swamp", to: ME, source: "item", reveal: true });
    expect(result).toMatchObject({ state: "blocked_limit", instanceId: null, feed: [] });
    expect(instances).toEqual([]);
    expect(journal[0]).toMatchObject({ op: "noop", outcome: { reason: "disabled_tag:movement" } });
    // Untagged entries are untouched.
    expect((await grant(ctx, { entry: "momentum", to: ME, source: "item", reveal: false })).state).toBe("granted");
  });

  it("caps the active effects of a player, but lets a held one refresh", async () => {
    const { ctx, instances, journal } = setup({ config: limited({ maxActiveEffectsPerPlayer: 1 }) });
    expect((await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false })).state).toBe("granted");
    expect((await grant(ctx, { entry: "lucky", to: ME, source: "item", reveal: false })).state).toBe("blocked_limit");
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "max_active_effects" } });
    // A refresh adds no instance, so it does not count against the cap.
    expect((await grant(ctx, { entry: "swamp", to: ME, source: "item", reveal: false })).state).toBe("refreshed");
    // Items are not effects; another player has room of their own.
    expect((await grant(ctx, { entry: "spare_die", to: ME, source: "item", reveal: false })).state).toBe("granted");
    expect((await grant(ctx, { entry: "lucky", to: RIVAL, source: "item", reveal: false })).state).toBe("granted");
    expect(instances).toHaveLength(3);
  });

  it("caps the active instances carrying a tag — items and effects alike", async () => {
    const { ctx, journal } = setup({ config: limited({ tagLimits: { dice: 1 } }) });
    expect((await grant(ctx, { entry: "spare_die", to: ME, source: "item", reveal: false })).state).toBe("granted");
    expect((await grant(ctx, { entry: "lucky", to: ME, source: "item", reveal: false })).state).toBe("blocked_limit");
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "tag_limit:dice" } });
    expect((await grant(ctx, { entry: "tailwind", to: ME, source: "item", reveal: false })).state).toBe("granted");
  });
});

describe("useCharge", () => {
  it("spends one charge, ends the item at zero, and a second spend finds nothing", async () => {
    const { ctx, instances, journal } = setup();
    const { instanceId } = await grant(ctx, { entry: "hex_scroll", to: ME, source: "cell_bonus", reveal: false });
    const used = await useCharge(ctx, { instanceId: instanceId!, targetPlayerId: RIVAL });
    expect(used).toMatchObject({ ended: true, row: { chargesLeft: 0, status: "ended", endReason: "used" } });
    expect(instances[0]).toMatchObject({ status: "ended", endReason: "used" });
    expect(journal.at(-1)).toMatchObject({ op: "use", actorPlayerId: ME, targetPlayerId: RIVAL, visibility: "public" });
    expect(await useCharge(ctx, { instanceId: instanceId! })).toBeNull();
  });

  it("an item with charges left stays held", async () => {
    const { ctx, instances } = setup({ registry: catalogRegistry({ speed_boots: { durationOverride: 2 } }) });
    const { instanceId } = await grant(ctx, { entry: "speed_boots", to: ME, source: "cell_bonus", reveal: false });
    const used = await useCharge(ctx, { instanceId: instanceId! });
    expect(used?.ended).toBe(false);
    expect(instances[0]).toMatchObject({ chargesLeft: 1, status: "active" });
  });
});

describe("fire — rules that fired, charges they asked for", () => {
  it("journals every firing and counts a trigger-limited effect down to its end", async () => {
    const { ctx, instances, journal } = setup();
    const { instanceId } = await grant(ctx, { entry: "ward", to: ME, source: "cell_bonus", reveal: false });
    const ward = coreRegistry().get("ward")!;
    const fired: FiredRule[] = [
      {
        instanceId: instanceId!,
        revisionId: ward.revisionId,
        key: "ward",
        ruleIndex: 0,
        hook: "beforeCellEffect",
        patch: { skipCellEffect: true, consumeCharge: true, reason: "effect:ward" },
        draws: [0.25],
      },
    ];
    const feed = await fire(ctx, { fired, consumed: [instanceId!, instanceId!], rollSeq: 6, reveal: true });

    expect(journal.find((j) => j.op === "fire")).toMatchObject({
      instanceId,
      ruleIndex: 0,
      intent: { hook: "beforeCellEffect" },
      outcome: { skipCellEffect: true, consumeCharge: true },
      rng: [0.25],
    });
    expect(instances[0]).toMatchObject({ remaining: 0, status: "ended", endReason: "expired" });
    expect(feed).toEqual([
      { eventType: "effect_expired", payload: { effectKey: "ward", instanceId, name: ward.names } },
    ]);
  });

  it("ignores ids that are gone or not trigger-counted", async () => {
    const { ctx, instances } = setup();
    const { instanceId } = await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false });
    expect(await fire(ctx, { fired: [], consumed: [instanceId!, "no-such-id"], rollSeq: 6, reveal: true })).toEqual([]);
    expect(instances[0]!.remaining).toBe(2);
  });
});

describe("tick — the end of a holder's turn", () => {
  it("counts down the statuses that took part, and leaves one granted during the roll alone", async () => {
    const { ctx, instances, journal } = setup();
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: true }); // anchor 5
    ctx.anchorFor = async () => ({ anchorRollSeq: 6 });
    await grant(ctx, { entry: "heavy_boots", to: ME, source: "item", reveal: false }); // anchor 6: in flight

    await tick(ctx, { holder: ME, rollSeq: 6, ticks: { roll: true, moved: true, passed: true }, reveal: true });
    const [swamp, boots] = [instances[0]!, instances[1]!];
    expect(swamp.remaining).toBe(1);
    expect(boots.remaining).toBe(1);
    expect(journal.filter((j) => j.op === "tick")).toHaveLength(1);

    const feed = await tick(ctx, { holder: ME, rollSeq: 7, ticks: { roll: true, moved: true, passed: false }, reveal: true });
    expect(swamp.status).toBe("ended");
    expect(boots.status).toBe("ended");
    expect(feed.map((f) => [f.eventType, f.payload.effectKey])).toEqual([
      ["effect_expired", "heavy_boots"],
      ["effect_expired", "swamp"],
    ]);
  });

  it("an expiry the season hides is journaled for staff and not projected", async () => {
    const { ctx, journal } = setup();
    await grant(ctx, { entry: "tailwind", to: ME, source: "cell_bonus", reveal: false });
    const feed = await tick(ctx, { holder: ME, rollSeq: 6, ticks: { roll: true, moved: true, passed: true }, reveal: false });
    expect(feed).toEqual([]);
    expect(journal.find((j) => j.op === "expire")!.visibility).toBe("staff");
  });

  it("moves count only when the token moved, passed games only on a pass", async () => {
    const registry = buildRegistry(
      compileSet([
        { entryId: ID(11), revisionId: ID(111), doc: doc("by_moves", { duration: { unit: "moves", count: 2 } }) },
        { entryId: ID(12), revisionId: ID(112), doc: doc("by_passes", { duration: { unit: "passed_games", count: 2 } }) },
        { entryId: ID(13), revisionId: ID(113), doc: doc("forever", { duration: { unit: "permanent" } }) },
      ]),
    );
    const { ctx, instances } = setup({ registry });
    for (const key of ["by_moves", "by_passes", "forever"]) {
      await grant(ctx, { entry: key, to: ME, source: "admin", reveal: false });
    }
    await tick(ctx, { holder: ME, rollSeq: 6, ticks: { roll: true, moved: false, passed: false }, reveal: false });
    expect(instances.map((i) => i.remaining)).toEqual([2, 2, null]);
    await tick(ctx, { holder: ME, rollSeq: 7, ticks: { roll: true, moved: true, passed: true }, reveal: false });
    expect(instances.map((i) => i.remaining)).toEqual([1, 1, null]);
    expect(instances.every((i) => i.status === "active")).toBe(true);
  });

  it("items are not counted down by turns", async () => {
    const { ctx, instances } = setup();
    await grant(ctx, { entry: "jinx", to: ME, source: "cell_bonus", reveal: false });
    await tick(ctx, { holder: ME, rollSeq: 6, ticks: { roll: true, moved: true, passed: true }, reveal: false });
    expect(instances[0]).toMatchObject({ chargesLeft: 1, status: "active" });
  });
});

describe("endInstance, cleanse, balance", () => {
  it("staff removal ends an active instance once, and says so publicly", async () => {
    const { ctx, journal } = setup({ actorUserId: "judge-1" });
    const { instanceId } = await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false });
    const ended = await endInstance(ctx, { instanceId: instanceId!, reason: "revoked", note: "mistake" });
    expect(ended).toMatchObject({ status: "ended", endReason: "revoked" });
    expect(journal.at(-1)).toMatchObject({
      op: "end",
      actorUserId: "judge-1",
      visibility: "public",
      outcome: { reason: "revoked", note: "mistake" },
    });
    expect(await endInstance(ctx, { instanceId: instanceId!, reason: "revoked" })).toBeNull();
  });

  it("cleanse takes matching effects newest first, up to the count, and never items", async () => {
    const { ctx, instances } = setup();
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false });
    await grant(ctx, { entry: "toll", to: ME, source: "cell_penalty", reveal: false });
    await grant(ctx, { entry: "tailwind", to: ME, source: "cell_bonus", reveal: false });
    await grant(ctx, { entry: "jinx", to: ME, source: "cell_bonus", reveal: false });

    const one = await cleanse(ctx, { from: ME, character: "penalty", tags: [], count: 1 });
    expect(one.map((r) => r.revisionId)).toEqual([coreRegistry().get("toll")!.revisionId]);
    const rest = await cleanse(ctx, { from: ME, character: null, tags: ["movement"], count: "all" });
    expect(rest).toHaveLength(2);
    expect(instances.filter((i) => i.status === "active").map((i) => i.kind)).toEqual(["item"]);
  });

  it("balance never goes below zero and the ledger records what moved", async () => {
    const { ctx, ledger, balances, journal } = setup();
    expect(await applyBalance(ctx, { to: RIVAL, delta: -3, reason: "item:pickaxe" })).toEqual({ before: 1, after: 0 });
    expect(ledger).toEqual([{ seasonPlayerId: RIVAL, delta: -1, reason: "item:pickaxe" }]);
    expect(balances.get(RIVAL)).toBe(0);
    expect(await applyBalance(ctx, { to: RIVAL, delta: -2, reason: "again" })).toEqual({ before: 0, after: 0 });
    expect(ledger).toHaveLength(1);
    expect(await applyBalance(ctx, { to: "sp-ghost", delta: 1, reason: "x" })).toBeNull();
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "unknown_player" } });
  });
});

describe("season-wide", () => {
  it("a reset clears the season's instances and journal and starts over with the reset", async () => {
    const { ctx, instances, journal } = setup({ actorUserId: "admin-1" });
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false });
    await grant(ctx, { entry: "jinx", to: ME, source: "cell_bonus", reveal: false });
    expect(await resetSeason(ctx)).toEqual({ instances: 2, journal: 2 });
    expect(instances).toEqual([]);
    expect(journal).toEqual([expect.objectContaining({ op: "reset", actorUserId: "admin-1", outcome: { instances: 2, journal: 2 } })]);
  });

  it("compile failures are journaled once per revision", async () => {
    const { ctx, journal } = setup();
    const failure = {
      entryId: ID(1),
      revisionId: ID(101),
      slug: "broken",
      errors: [{ code: "schema" as const, path: ["rules"], message: "bad" }],
    };
    expect(await journalCompileFailures(ctx, [])).toBe(0);
    expect(await journalCompileFailures(ctx, [failure])).toBe(1);
    expect(await journalCompileFailures(ctx, [failure])).toBe(0);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ op: "compile_failed", revisionId: ID(101), intent: { slug: "broken" } });
  });

  it("factsOfRows describes what a participant holds, skipping unknown revisions", async () => {
    const { ctx, instances } = setup();
    await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false });
    const facts = factsOfRows(coreRegistry(), [...instances, { ...instances[0]!, revisionId: "unknown" }]);
    expect(facts.map((f) => f.slug)).toEqual(["swamp"]);
  });
});

describe("movePlayer — out-of-turn moves (spec §7.3)", () => {
  const BEHIND = "sp-behind";
  const FAR = "sp-far";
  function moveSetup(
    positions: Record<string, number>,
    over: Omit<Partial<ExecContext>, "board"> & { lastMoves?: Record<string, number>; board?: BoardInfo | null } = {},
  ) {
    const { lastMoves, board, ...ctxOver } = over;
    const mem = memoryStore({ positions, lastMoves });
    const ctx: ExecContext = {
      store: mem.store,
      seasonId: SEASON,
      registry: coreRegistry(),
      config: IeeConfigSchema.parse({ enabled: true }),
      seasonRollSeq: 40,
      rng: () => 0.5,
      snapshot: async (id) => ({ seasonPlayerId: id, position: 0, balancePoints: 0, rollSeq: 5, moveCount: 5, rank: 1, status: "active" }),
      anchorFor: async () => ({ anchorRollSeq: 5 }),
      ...(board === null ? {} : { board: async () => board ?? { size: 40, loop: false, finishAt: 39 } }),
      ...ctxOver,
    };
    const at = async () => Object.fromEntries((await mem.store.places(SEASON)).map((p) => [p.id, [p.position, p.status]]));
    return { ctx, ...mem, at };
  }
  const move = (who: MoveIntent["who"], to: MoveIntent["to"]): MoveIntent => ({ kind: "move", who, to, key: "swamp" });

  it("moves by a number of cells: the position only, journaled and fed", async () => {
    const { ctx, journal, at } = moveSetup({ [ME]: 10, [RIVAL]: 16 });
    const feed = await movePlayer(ctx, { intent: move(ME, { by: 3 }), reveal: false });
    expect((await at())[ME]).toEqual([13, "active"]);
    expect(feed).toEqual([{ eventType: "moved_out_of_turn", seasonPlayerId: ME, payload: { from: 10, to: 13 } }]);
    expect(journal.at(-1)).toMatchObject({
      op: "move_player",
      targetPlayerId: ME,
      outcome: { from: 10, to: 13, finished: false },
      visibility: "public",
    });
    // Revealed, the row names the entry that moved them.
    const named = await movePlayer(ctx, { intent: move(ME, { by: 1 }), reveal: true });
    expect(named[0]!.payload).toMatchObject({ key: "swamp", name: { ru: "Болото" } });
  });

  it("never wraps back past the start; forward stops at the last cell — the finish, which still counts", async () => {
    const { ctx, at } = moveSetup({ [ME]: 1, [RIVAL]: 37 });
    await movePlayer(ctx, { intent: move(ME, { by: -3 }), reveal: false });
    const feed = await movePlayer(ctx, { intent: move(RIVAL, { by: 8 }), reveal: false });
    expect(await at()).toEqual({ [ME]: [0, "active"], [RIVAL]: [39, "finished"] });
    expect(feed.map((f) => [f.eventType, f.seasonPlayerId])).toEqual([
      ["moved_out_of_turn", RIVAL],
      ["player_finished", RIVAL],
    ]);
  });

  it("a loop board wraps forward, never back", async () => {
    const board = { size: 40, loop: true, finishAt: null };
    const { ctx, at } = moveSetup({ [ME]: 38, [RIVAL]: 1 }, { board });
    await movePlayer(ctx, { intent: move(ME, { by: 5 }), reveal: false });
    await movePlayer(ctx, { intent: move(RIVAL, { by: -3 }), reveal: false });
    expect(await at()).toEqual({ [ME]: [3, "active"], [RIVAL]: [0, "active"] });
    expect(outOfTurnLanding(null, 5, 100)).toBe(105);
  });

  it("jumps to a player's cell, or the cell right before them", async () => {
    const { ctx, at } = moveSetup({ [ME]: 4, [RIVAL]: 16 });
    await movePlayer(ctx, { intent: move(ME, { player: RIVAL, at: "before" }), reveal: false });
    expect((await at())[ME]).toEqual([15, "active"]);
    await movePlayer(ctx, { intent: move(ME, { player: RIVAL, at: "cell" }), reveal: false });
    expect((await at())[ME]).toEqual([16, "active"]);
  });

  it("swaps places: two moves, each naming the other", async () => {
    const { ctx, at } = moveSetup({ [ME]: 4, [RIVAL]: 16 });
    const feed = await movePlayer(ctx, { intent: move(ME, { swapWith: RIVAL }), reveal: false });
    expect(await at()).toEqual({ [ME]: [16, "active"], [RIVAL]: [4, "active"] });
    expect(feed.map((f) => [f.seasonPlayerId, f.payload])).toEqual([
      [ME, { from: 4, to: 16, swappedWith: RIVAL }],
      [RIVAL, { from: 16, to: 4, swappedWith: ME }],
    ]);
  });

  it("the nearest active rival behind: a tie decided by the server, nobody behind is nothing", async () => {
    const { ctx, at, journal } = moveSetup({ [ME]: 20, [RIVAL]: 12, [BEHIND]: 12, [FAR]: 3 }, { rng: () => 0.9 });
    await movePlayer(ctx, { intent: move(ME, { swapWith: { nearestBehind: ME } }), reveal: false });
    // 12 and 12 tie; 0.9 picks the second of them.
    expect(await at()).toMatchObject({ [ME]: [12, "active"], [BEHIND]: [20, "active"], [RIVAL]: [12, "active"] });
    expect(journal.filter((j) => j.op === "move_player").at(-1)!.rng).toEqual([0.9]);

    const alone = moveSetup({ [ME]: 2, [RIVAL]: 9 });
    expect(await movePlayer(alone.ctx, { intent: move(ME, { swapWith: { nearestBehind: ME } }), reveal: false })).toEqual([]);
    expect(alone.journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "nobody_behind" } });
  });

  it("halves the gap of the nearest rival behind, rounded down", async () => {
    const { ctx, at } = moveSetup({ [ME]: 20, [RIVAL]: 11, [FAR]: 2 });
    await movePlayer(ctx, { intent: move({ nearestBehind: ME }, { halfwayTo: ME }), reveal: false });
    expect((await at())[RIVAL]).toEqual([15, "active"]);
    const { ctx: c2, journal } = moveSetup({ [ME]: 2, [RIVAL]: 11 });
    expect(await movePlayer(c2, { intent: move({ nearestBehind: ME }, { halfwayTo: ME }), reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "nobody_behind" } });
    // Someone who is not behind has no gap to halve.
    const { ctx: c3, journal: j3 } = moveSetup({ [ME]: 2, [RIVAL]: 11 });
    expect(await movePlayer(c3, { intent: move(RIVAL, { halfwayTo: ME }), reveal: false })).toEqual([]);
    expect(j3.at(-1)).toMatchObject({ outcome: { reason: "not_behind" } });
  });

  it("returns a player to where their last regular move started — or does nothing before their first", async () => {
    const { ctx, at, journal } = moveSetup({ [ME]: 10, [RIVAL]: 19 }, { lastMoves: { [RIVAL]: 14 } });
    await movePlayer(ctx, { intent: move(RIVAL, { lastMoveStart: true }), reveal: false });
    expect((await at())[RIVAL]).toEqual([14, "active"]);
    expect(await movePlayer(ctx, { intent: move(ME, { lastMoveStart: true }), reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "no_last_move" } });
  });

  it("moves nobody who is gone, unknown, or the same player twice; a move that goes nowhere writes nothing", async () => {
    const { ctx, journal, setPosition } = (() => {
      const s = moveSetup({ [ME]: 10, [RIVAL]: 16 });
      return { ...s, setPosition: s.store.setPosition };
    })();
    await setPosition(RIVAL, 16, true);
    expect(await movePlayer(ctx, { intent: move(RIVAL, { by: 2 }), reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ outcome: { reason: "not_active" } });
    expect(await movePlayer(ctx, { intent: move(ME, { swapWith: RIVAL }), reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ outcome: { reason: "not_active" } });
    expect(await movePlayer(ctx, { intent: move("ghost", { by: 2 }), reveal: false })).toEqual([]);
    expect(await movePlayer(ctx, { intent: move(ME, { player: "ghost", at: "cell" }), reveal: false })).toEqual([]);
    expect(await movePlayer(ctx, { intent: move(ME, { swapWith: ME }), reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ outcome: { reason: "self" } });
    expect(await movePlayer(ctx, { intent: move(ME, { by: 0 }), reveal: false })).toEqual([]);
  });

  it("without a board a move is only kept at cell 0 and above", async () => {
    const { ctx, at } = moveSetup({ [ME]: 38 }, { board: null });
    await movePlayer(ctx, { intent: move(ME, { by: 5 }), reveal: false });
    expect((await at())[ME]).toEqual([43, "active"]);
  });
});

describe("grant — an instant effect (spec §6.4)", () => {
  const SHOVE = ID(9);
  const registry = () =>
    buildRegistry(
      compileSet([
        {
          entryId: SHOVE,
          revisionId: ID(109),
          doc: doc("shove", {
            character: "penalty",
            duration: { unit: "instant" },
            stacking: undefined,
            rules: [{ when: "onApply", do: [{ op: "move", by: -2 }] }],
          }),
        },
      ]),
    );

  it("acts as it arrives and keeps nothing: its row is ended at once, so a wheel still counts it", async () => {
    const mem = memoryStore({ positions: { [ME]: 10 } });
    const ctx: ExecContext = {
      store: mem.store,
      seasonId: SEASON,
      registry: registry(),
      config: IeeConfigSchema.parse({ enabled: true }),
      seasonRollSeq: 40,
      rng: () => 0.5,
      snapshot: async (id) => ({ seasonPlayerId: id, position: 10, balancePoints: 0, rollSeq: 5, moveCount: 5, rank: 1, status: "active" }),
      anchorFor: async () => ({ anchorRollSeq: 5 }),
      board: async () => ({ size: 40, loop: false, finishAt: 39 }),
    };
    const first = await grant(ctx, { entry: "shove", to: ME, source: "cell_penalty", reveal: true });
    expect(first.state).toBe("granted");
    expect(first.feed.map((f) => f.eventType)).toEqual(["effect_applied", "moved_out_of_turn"]);
    expect((await mem.store.places(SEASON))[0]!.position).toBe(8);
    expect(mem.instances).toMatchObject([{ id: first.instanceId, status: "ended", endReason: "triggered", remaining: null }]);
    expect(ops(mem.journal)).toEqual(["grant", "fire", "move_player", "end"]);
    // A second one simply acts again: nothing to refresh or stack.
    await grant(ctx, { entry: "shove", to: ME, source: "cell_penalty", reveal: false });
    expect((await mem.store.places(SEASON))[0]!.position).toBe(6);
    expect(mem.instances).toHaveLength(2);
    expect(await mem.store.activeForHolder(ME)).toEqual([]);
  });
});

describe("cursed and passive items (spec §6.10)", () => {
  const BOOTS_ID = "00000000-0000-4000-8000-0000000000b0";
  const CROWN_ID = "00000000-0000-4000-8000-0000000000c0";
  const AMULET_ID = "00000000-0000-4000-8000-0000000000a0";
  const doc = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    rules: [],
    ...over,
  });
  const BOOTS = doc("cursed_boots", {
    character: "penalty",
    usage: { activation: "cursed", charges: 1 },
    rules: [
      { when: "afterDice", do: [{ op: "resultModify", delta: -2 }] },
      { when: "onPickup", do: [{ op: "balance", amount: -1 }] },
    ],
  });
  const CROWN = doc("crown", { usage: { activation: "passive" }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }] });
  const AMULET = doc("amulet", {
    usage: { activation: "active", charges: 1, target: { who: "self" } },
    rules: [{ when: "onUse", do: [{ op: "remove", what: "any", character: "penalty", pick: "choice" }] }],
  });
  const registry = () =>
    buildRegistry(
      compileSet([
        { entryId: BOOTS_ID, revisionId: "rev-boots", doc: BOOTS },
        { entryId: CROWN_ID, revisionId: "rev-crown", doc: CROWN },
        { entryId: AMULET_ID, revisionId: "rev-amulet", doc: AMULET },
      ]),
    );
  const firing = (instanceId: string): FiredRule => ({
    instanceId,
    revisionId: "rev-boots",
    key: "cursed_boots",
    ruleIndex: 0,
    hook: "afterDice",
    patch: { resultDelta: -2, consumeCharge: true },
    draws: [],
  });

  it("a cursed item counts from a roll like an effect, is unique, and acts as it is picked up", async () => {
    const { ctx, instances, journal, balances } = setup({ registry: registry(), anchor: 7 });
    const first = await grant(ctx, { entry: "cursed_boots", to: ME, source: "item", reveal: true });
    expect(first.state).toBe("granted");
    expect(instances[0]).toMatchObject({ kind: "item", chargesLeft: 1, anchorRollSeq: 7 });
    expect(first.feed.map((f) => f.eventType)).toEqual(["item_granted"]);
    expect(balances.get(ME)).toBe(4);
    expect(ops(journal)).toEqual(["grant", "fire", "balance"]);
    // One per holder: a second does nothing.
    const second = await grant(ctx, { entry: "cursed_boots", to: ME, source: "item", reveal: false });
    expect(second.state).toBe("blocked_unique");
    expect(instances).toHaveLength(1);
    // An active item keeps no anchor.
    await grant(ctx, { entry: "amulet", to: ME, source: "item", reveal: false });
    expect(instances.find((i) => i.entryId === AMULET_ID)?.anchorRollSeq).toBeNull();
  });

  it("each turn it fires spends a charge; at none it vanishes, triggered, said where drops are revealed", async () => {
    const { ctx, instances, journal } = setup({ registry: registry(), anchor: 5 });
    const { instanceId } = await grant(ctx, { entry: "cursed_boots", to: ME, source: "cell_penalty", reveal: false });
    const feed = await fire(ctx, { fired: [firing(instanceId!)], consumed: [instanceId!], rollSeq: 6, reveal: true });
    expect(instances[0]).toMatchObject({ status: "ended", endReason: "triggered", chargesLeft: 0 });
    expect(feed).toEqual([
      { eventType: "item_expired", payload: expect.objectContaining({ itemKey: "cursed_boots", character: "penalty", instanceId }) },
    ]);
    expect(ops(journal).slice(-3)).toEqual(["fire", "tick", "end"]);
    // A roll it does not take part in spends nothing.
    const again = setup({ registry: registry(), anchor: 9 });
    const late = await grant(again.ctx, { entry: "cursed_boots", to: ME, source: "item", reveal: false });
    await fire(again.ctx, { fired: [], consumed: [late.instanceId!], rollSeq: 9, reveal: false });
    expect(again.instances[0]).toMatchObject({ status: "active", chargesLeft: 1 });
  });

  it("a passive item without charges stays while held", async () => {
    const { ctx, instances } = setup({ registry: registry() });
    const { instanceId } = await grant(ctx, { entry: "crown", to: ME, source: "item", reveal: false });
    expect(instances[0]).toMatchObject({ chargesLeft: null });
    await fire(ctx, { fired: [], consumed: [instanceId!], rollSeq: 99, reveal: false });
    expect(instances[0]).toMatchObject({ status: "active" });
  });

  it("removes the one chosen, the newest, or random ones of what matches", async () => {
    const reg = catalogRegistry({ swamp: {}, poison: {}, ward: {} });
    const { ctx, instances, journal } = setup({ registry: reg });
    const swamp = await grant(ctx, { entry: "swamp", to: ME, source: "cell", reveal: false });
    const poison = await grant(ctx, { entry: "poison", to: ME, source: "cell", reveal: false });
    await grant(ctx, { entry: "ward", to: ME, source: "cell", reveal: false });
    const base = { kind: "remove" as const, from: ME, what: "any" as const, character: "penalty" as const, entryId: null, count: 1 };

    await runIntents(ctx, [{ ...base, pick: { instanceId: swamp.instanceId! } }], { source: "item", reveal: false, causeId: 1 });
    expect(instances.find((i) => i.id === swamp.instanceId)).toMatchObject({ status: "ended", endReason: "cleansed" });
    expect(journal.at(-1)).toMatchObject({ op: "end", outcome: { reason: "cleansed", pick: "choice" }, causeId: 1 });
    // A choice that does not match takes nothing: «Оберег» is a bonus.
    const ward = instances.find((i) => i.entryId === reg.get("ward")!.entryId)!;
    await runIntents(ctx, [{ ...base, pick: { instanceId: ward.id } }], { source: "item", reveal: false });
    expect(ward.status).toBe("active");
    // The newest penalty left is «Отравление».
    await runIntents(ctx, [{ ...base, pick: "newest" }], { source: "item", reveal: false });
    expect(instances.find((i) => i.id === poison.instanceId)).toMatchObject({ status: "ended" });
  });

  it("random picks are the server's, and items end removed", async () => {
    const { ctx, instances, journal } = setup({ registry: registry(), rng: () => 0.99 });
    await grant(ctx, { entry: "crown", to: ME, source: "item", reveal: false });
    await grant(ctx, { entry: "amulet", to: ME, source: "item", reveal: false });
    await runIntents(
      ctx,
      [{ kind: "remove", from: ME, what: "item", character: null, entryId: null, pick: "random", count: 1 }],
      { source: "rule", reveal: false },
    );
    expect(instances.filter((i) => i.status === "ended").map((i) => i.endReason)).toEqual(["removed"]);
    expect(journal.at(-1)).toMatchObject({ op: "end", rng: [0.99] });
  });
});

describe("an effect that remembers whom its item was aimed at, and the next game (wave A, spec §6.4, §6.11)", () => {
  const PULL_ID = "00000000-0000-4000-8000-0000000000d0";
  const TRAP_ID = "00000000-0000-4000-8000-0000000000e0";
  const effectDoc = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug,
    name: { ru: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    duration: { unit: "rolls", count: 1 },
    stacking: { mode: "refresh" },
    rules: [],
    ...over,
  });
  const PULL = effectDoc("pull", {
    rules: [{ when: "afterMovement", if: [{ op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" }], do: [{ op: "steps", delta: 2 }] }],
  });
  const TRAP = effectDoc("trap", { character: "penalty", duration: { unit: "next_game" }, rules: [{ when: "afterMovement", do: [{ op: "noMove" }] }] });
  const registry = () =>
    buildRegistry(
      compileSet([
        { entryId: PULL_ID, revisionId: "rev-pull", doc: PULL },
        { entryId: TRAP_ID, revisionId: "rev-trap", doc: TRAP },
      ]),
    );

  it("keeps the player a grant was aimed at, and a renewal aimed elsewhere points at the new one", async () => {
    const { ctx, instances, journal } = setup({ registry: registry() });
    await runIntents(ctx, [{ kind: "grant", entryId: PULL_ID, key: "pull", entryKind: "effect", to: ME, aimedAt: RIVAL }], { source: "item", reveal: false });
    expect(instances[0]).toMatchObject({ holderPlayerId: ME, aimedPlayerId: RIVAL });
    expect(journal.at(-1)).toMatchObject({ op: "grant", outcome: expect.objectContaining({ state: "granted", aimedAt: RIVAL }) });
    await grant(ctx, { entry: "pull", to: ME, source: "item", reveal: false, aimedAt: "sp-third" });
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({ aimedPlayerId: "sp-third" });
    expect(journal.at(-1)).toMatchObject({ outcome: expect.objectContaining({ state: "refreshed", aimedAt: "sp-third" }) });
    // A renewal from the wheel aims at nobody: the one remembered stays.
    await grant(ctx, { entry: "pull", to: ME, source: "cell_bonus", reveal: false });
    expect(instances[0]).toMatchObject({ aimedPlayerId: "sp-third" });
  });

  it("a grant nobody aimed remembers nobody", async () => {
    const { ctx, instances } = setup({ registry: registry() });
    await grant(ctx, { entry: "pull", to: ME, source: "cell_bonus", reveal: false });
    expect(instances[0]).toMatchObject({ aimedPlayerId: null });
  });

  it("the next game: one count, gone when the holder's next game is resolved, passed or dropped", async () => {
    for (const ticks of [{ roll: true as const, moved: true, passed: true }, { roll: true as const, moved: false, passed: false }]) {
      const { ctx, instances, journal } = setup({ registry: registry(), anchor: 5 });
      await grant(ctx, { entry: "trap", to: ME, source: "cell_penalty", reveal: false });
      expect(instances[0]).toMatchObject({ remaining: 1, remainingUnit: "next_game" });
      // The roll it was dropped on does not count.
      await tick(ctx, { holder: ME, rollSeq: 5, ticks, reveal: false });
      expect(instances[0]).toMatchObject({ status: "active" });
      await tick(ctx, { holder: ME, rollSeq: 6, ticks, reveal: true });
      expect(instances[0]).toMatchObject({ status: "ended", endReason: "expired" });
      expect(ops(journal).slice(-2)).toEqual(["tick", "expire"]);
    }
  });
});

describe("item operations — steal, give, trade, copy (wave B, spec §6.12)", () => {
  const item = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    usage: { activation: "active", charges: 2, target: { who: "self" } },
    rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }],
    ...over,
  });
  const ENTRY = { boots: ID(31), relic: ID(32), charm: ID(33), curse: ID(34), lone: ID(35), off: ID(36) };
  const registry = () =>
    buildRegistry(
      compileSet([
        { entryId: ENTRY.boots, revisionId: ID(131), doc: item("boots", {}) },
        { entryId: ENTRY.relic, revisionId: ID(132), doc: item("relic", { rarity: "rare" }) },
        {
          entryId: ENTRY.charm,
          revisionId: ID(133),
          doc: item("charm", { usage: { activation: "passive", charges: 2 }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }] }),
        },
        {
          entryId: ENTRY.curse,
          revisionId: ID(134),
          doc: item("curse", { character: "penalty", usage: { activation: "cursed", charges: 1 }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }] }),
        },
        { entryId: ENTRY.lone, revisionId: ID(135), doc: item("lone", { usage: { activation: "active", charges: 1, unique: true, target: { who: "self" } } }) },
      ]),
    );
  const THIRD = "sp-third";
  function opsSetup(over: Partial<ExecContext> = {}) {
    const mem = memoryStore({
      balances: { [ME]: 5, [RIVAL]: 5, [THIRD]: 5 },
      positions: { [ME]: 10, [RIVAL]: 12, [THIRD]: 4 },
      names: { [ME]: "me", [RIVAL]: "rival", [THIRD]: "third" },
    });
    const ctx: ExecContext = {
      store: mem.store,
      seasonId: SEASON,
      registry: registry(),
      config: IeeConfigSchema.parse({ enabled: true }),
      seasonRollSeq: 40,
      rng: () => 0,
      snapshot: async (id) => ({ seasonPlayerId: id, position: 0, balancePoints: 0, rollSeq: 5, moveCount: 5, rank: 1, status: "active" }),
      anchorFor: async () => ({ anchorRollSeq: 7 }),
      ...over,
    };
    const give = async (slug: string, to: string) => (await grant(ctx, { entry: slug, to, source: "cell_bonus", reveal: false })).instanceId!;
    const held = async (who: string) => (await mem.store.activeForHolder(who)).map((r) => ctx.registry.get(r.revisionId)!.key).sort();
    return { ctx, give, held, ...mem };
  }
  const steal = (over: Partial<Parameters<typeof moveItems>[1]> = {}) => ({
    kind: "moveItems" as const,
    from: RIVAL,
    to: ME,
    count: 1,
    rarity: null,
    how: "stolen" as const,
    except: null,
    ...over,
  });

  it("a steal moves the same instance — charges with it — journaled and fed on the receiver's line", async () => {
    const { ctx, give, held, instances, journal } = opsSetup();
    const boots = await give("boots", RIVAL);
    await give("curse", RIVAL);
    await useCharge(ctx, { instanceId: boots });
    const feed = await moveItems(ctx, steal(), { source: "item", reveal: false, nameMoves: true, causeId: 9 });
    // A cursed item cannot be stolen: the bonus one goes.
    expect(await held(ME)).toEqual(["boots"]);
    expect(await held(RIVAL)).toEqual(["curse"]);
    expect(instances.find((i) => i.id === boots)).toMatchObject({ holderPlayerId: ME, chargesLeft: 1, status: "active", anchorRollSeq: null });
    expect(journal.at(-1)).toMatchObject({
      op: "move",
      instanceId: boots,
      targetPlayerId: ME,
      intent: { from: RIVAL, how: "stolen" },
      outcome: { from: RIVAL, to: ME },
      causeId: 9,
      visibility: "public",
    });
    expect(feed).toEqual([
      {
        eventType: "item_moved",
        seasonPlayerId: ME,
        payload: { how: "stolen", instanceId: boots, fromSeasonPlayerId: RIVAL, fromUsername: "rival", itemKey: "boots", name: { ru: "boots", en: "boots", uk: "boots" } },
      },
    ]);
  });

  it("names the item only where the caller reveals it", async () => {
    const { ctx, give } = opsSetup();
    await give("boots", RIVAL);
    const [row] = await moveItems(ctx, steal(), { source: "rule", reveal: false });
    expect(row!.payload).not.toHaveProperty("itemKey");
    expect(row!.payload).toMatchObject({ how: "stolen", fromUsername: "rival" });
  });

  it("takes only the rarities asked, as many as asked and the giver has, never the item whose rule asked", async () => {
    const { ctx, give, held } = opsSetup();
    await give("boots", RIVAL);
    await give("relic", RIVAL);
    await moveItems(ctx, steal({ rarity: ["rare"] }), { source: "item", reveal: false });
    expect(await held(ME)).toEqual(["relic"]);
    // Two asked, one left to take.
    await moveItems(ctx, steal({ count: 2 }), { source: "item", reveal: false });
    expect(await held(ME)).toEqual(["boots", "relic"]);
    // The holder's own gift leaves the item in use where it is.
    const glove = (await ctx.store.activeForHolder(ME)).find((r) => ctx.registry.get(r.revisionId)!.key === "boots")!.id;
    await moveItems(ctx, steal({ from: ME, to: RIVAL, rarity: ["common"], except: glove, how: "given" }), { source: "item", reveal: false });
    expect(await held(RIVAL)).toEqual([]);
  });

  it("nothing to take, nobody to take from, or oneself: a noop, journaled", async () => {
    const { ctx, give, journal } = opsSetup();
    expect(await moveItems(ctx, steal(), { source: "item", reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "nothing_to_move" } });
    await give("boots", ME);
    expect(await moveItems(ctx, steal({ from: ME, to: ME }), { source: "item", reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ outcome: { reason: "self" } });
  });

  it("a gift to a random rival goes to an active one, the server's draw", async () => {
    const { ctx, give, held, store, journal } = opsSetup({ rng: () => 0.99 });
    await give("boots", ME);
    await store.setPosition(THIRD, 4, true);
    const [row] = await moveItems(ctx, steal({ from: ME, to: { randomRivalOf: ME }, how: "given" }), { source: "rule", reveal: true });
    // The third has finished: the rival is the only one left.
    expect(row).toMatchObject({ seasonPlayerId: RIVAL, payload: { how: "given", fromUsername: "me", itemKey: "boots" } });
    expect(await held(RIVAL)).toEqual(["boots"]);
    expect(journal.at(-1)!.rng).toEqual([0.99, 0.99]);
    await store.setPosition(RIVAL, 12, true);
    await give("relic", ME);
    expect(await moveItems(ctx, steal({ from: ME, to: { randomRivalOf: ME }, how: "given" }), { source: "rule", reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ outcome: { reason: "no_rival" } });
  });

  it("a unique item never goes to a holder who has one", async () => {
    const { ctx, give, held, journal } = opsSetup();
    await give("lone", RIVAL);
    await give("lone", ME);
    expect(await moveItems(ctx, steal(), { source: "item", reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "unique" } });
    expect(await held(RIVAL)).toEqual(["lone"]);
  });

  it("a held item counts from its new holder's next roll", async () => {
    const { ctx, give, instances } = opsSetup();
    const charm = await give("charm", RIVAL);
    await moveItems(ctx, steal(), { source: "item", reveal: false });
    expect(instances.find((i) => i.id === charm)).toMatchObject({ holderPlayerId: ME, anchorRollSeq: 7, countFromRollSeq: null, chargesLeft: 2 });
    // In the turn of its new holder, the roll the turn resolves.
    await moveItems(ctx, steal({ from: ME, to: RIVAL, how: "given" }), { source: "rule", reveal: false, anchor: { seasonPlayerId: RIVAL, anchorRollSeq: 12 } });
    expect(instances.find((i) => i.id === charm)).toMatchObject({ holderPlayerId: RIVAL, anchorRollSeq: 12 });
  });

  it("a trade: one random bonus item each, both picked first; nothing when either has none", async () => {
    const { ctx, give, held, journal } = opsSetup();
    await give("boots", ME);
    expect(await swapItems(ctx, { kind: "swapItems", a: ME, b: RIVAL, rarity: null, except: null }, { source: "item", reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "nothing_to_trade" } });
    await give("relic", RIVAL);
    await give("curse", RIVAL);
    const feed = await swapItems(ctx, { kind: "swapItems", a: ME, b: RIVAL, rarity: null, except: null }, { source: "item", reveal: false, nameMoves: true });
    expect(await held(ME)).toEqual(["relic"]);
    expect(await held(RIVAL)).toEqual(["boots", "curse"]);
    expect(feed.map((f) => [f.seasonPlayerId, f.payload.how, f.payload.itemKey, f.payload.fromUsername])).toEqual([
      [RIVAL, "traded", "boots", "me"],
      [ME, "traded", "relic", "rival"],
    ]);
    expect(ops(journal).slice(-2)).toEqual(["move", "move"]);
  });

  it("a trade either may not receive does not happen at all", async () => {
    const { ctx, give, held, journal } = opsSetup();
    await give("lone", ME);
    await give("lone", RIVAL);
    await give("boots", RIVAL);
    // The rival's pick is its boots (the newest): it would keep its lone one and get mine.
    expect(await swapItems(ctx, { kind: "swapItems", a: ME, b: RIVAL, rarity: null, except: null }, { source: "item", reveal: false })).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ outcome: { reason: "unique" } });
    expect(await held(ME)).toEqual(["lone"]);
  });

  it("a copy is a fresh grant of what the season plays; the original stays", async () => {
    const { ctx, give, held, instances } = opsSetup();
    const boots = await give("boots", RIVAL);
    await useCharge(ctx, { instanceId: boots });
    await give("curse", RIVAL);
    await copyItem(ctx, { kind: "copyItem", from: RIVAL, to: ME, rarity: null, except: null }, { source: "item", reveal: false });
    expect(await held(ME)).toEqual(["boots"]);
    expect(await held(RIVAL)).toEqual(["boots", "curse"]);
    // Its charges are a new one's, not the copied one's.
    expect(instances.filter((i) => i.holderPlayerId === ME)).toMatchObject([{ chargesLeft: 2, source: "item" }]);
  });

  it("a copy takes only the rarities asked, and nothing when there is none", async () => {
    const { ctx, give, held, journal } = opsSetup();
    await give("boots", RIVAL);
    await copyItem(ctx, { kind: "copyItem", from: RIVAL, to: ME, rarity: ["rare"], except: null }, { source: "item", reveal: false });
    expect(await held(ME)).toEqual([]);
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "nothing_to_copy" } });
  });

  it("runs from a rule's intents, and a removal takes only the rarities it names", async () => {
    const { ctx, give, held } = opsSetup();
    await give("boots", RIVAL);
    await runIntents(ctx, [steal()], { source: "item", reveal: false });
    expect(await held(ME)).toEqual(["boots"]);
    await give("relic", ME);
    await runIntents(
      ctx,
      [{ kind: "remove", from: ME, what: "item", character: "bonus", entryId: null, rarity: ["rare"], pick: "newest", count: 2 }],
      { source: "item", reveal: false },
    );
    expect(await held(ME)).toEqual(["boots"]);
  });
});
