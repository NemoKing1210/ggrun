/**
 * The same cell (docs/IEE_CONSTRUCTOR_SPEC.md §6.19): when a rival's regular
 * move ends where a player stands, that player's entries answer at
 * `onSameCell` — «Корона» changes hands — and an item one in the season is
 * handed out once.
 */
import { describe, expect, it } from "vitest";

import { IeeConfigSchema } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry } from "../registry";
import { endInstance, grant, sameCell, type ExecContext } from "./index";
import { memoryStore } from "./memory-store.test-helpers";

const SEASON = "season-1";
const ME = "sp-me";
const RIVAL = "sp-rival";
const OTHER = "sp-other";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const E = { crown: ID(1), toll: ID(2), patience: ID(3), charm: ID(4), badge: ID(5) };
const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });

const passive = (slug: string, unique: boolean | "season", rules: EntryDoc["rules"], charges?: number): EntryDoc => ({
  dslVersion: 1,
  kind: "item",
  slug,
  name: names(slug),
  character: "bonus",
  rarity: "epic",
  tags: [],
  usage: { activation: "passive", unique, ...(charges ? { charges } : {}) },
  rules,
});
const effect = (slug: string, duration: NonNullable<EntryDoc["duration"]>, rules: EntryDoc["rules"]): EntryDoc => ({
  dslVersion: 1,
  kind: "effect",
  slug,
  name: names(slug),
  character: "bonus",
  rarity: "common",
  tags: [],
  duration,
  stacking: { mode: "refresh" },
  rules,
});
const taken: EntryDoc["rules"][number] = { when: "onSameCell", do: [{ op: "takeEntry" }] };
const paid: EntryDoc["rules"][number] = { when: "onSameCell", do: [{ op: "balance", amount: 2 }] };

function registry() {
  const docs: [string, EntryDoc][] = [
    [E.crown, passive("crown", "season", [{ when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: 1 }] }, taken])],
    [E.toll, effect("toll", { unit: "rolls", count: 3 }, [paid])],
    [E.patience, effect("patience", { unit: "triggers", count: 2 }, [paid])],
    [E.charm, passive("charm", false, [paid], 2)],
    [E.badge, passive("badge", true, [{ when: "afterDice", do: [{ op: "resultModify", delta: 1 }] }, taken])],
  ];
  return buildRegistry(compileSet(docs.map(([entryId, doc], i) => ({ entryId, revisionId: ID(100 + i), doc }))));
}

function setup(positions: Record<string, number> = { [ME]: 10, [RIVAL]: 10, [OTHER]: 4 }) {
  const mem = memoryStore({ balances: { [ME]: 5, [RIVAL]: 5, [OTHER]: 5 }, positions, names: { [ME]: "anna", [RIVAL]: "boris", [OTHER]: "vera" } });
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: registry(),
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng: () => 0,
    snapshot: async (id) => ({ seasonPlayerId: id, position: positions[id] ?? 0, balancePoints: 5, rollSeq: 7, moveCount: 5, rank: 1, status: "active" }),
    anchorFor: async (id) => ({ anchorRollSeq: id === RIVAL ? 9 : 7 }),
  };
  return { ctx, ...mem };
}

async function holding(ctx: ExecContext, entry: string, to: string) {
  const given = await grant(ctx, { entry, to, source: "test", reveal: false });
  if (!given.instanceId) throw new Error(`not granted: ${given.state}`);
  return given.instanceId;
}

describe("sameCell — «Корона» changes hands (spec §6.19)", () => {
  it("the rival who arrives takes it, as it is: counting from their next roll, in plain sight", async () => {
    const { ctx, journal } = setup();
    const crown = await holding(ctx, E.crown, ME);
    const feed = await sameCell(ctx, { arrived: RIVAL, at: 10, reveal: false });
    expect(await ctx.store.getInstance(crown)).toMatchObject({ holderPlayerId: RIVAL, status: "active", anchorRollSeq: 9 });
    expect(journal.slice(-2)).toMatchObject([
      { op: "fire", instanceId: crown, targetPlayerId: ME, intent: { hook: "onSameCell", arrived: RIVAL, cell: 10 }, outcome: { intents: [], take: true } },
      { op: "move", instanceId: crown, targetPlayerId: RIVAL, intent: { from: ME, how: "taken" }, outcome: { from: ME, to: RIVAL, anchorRollSeq: 9 }, visibility: "public" },
    ]);
    expect(feed).toEqual([
      {
        eventType: "item_moved",
        seasonPlayerId: RIVAL,
        payload: { how: "taken", instanceId: crown, fromSeasonPlayerId: ME, fromUsername: "anna", itemKey: "crown", name: names("crown") },
      },
    ]);
  });

  it("only the players standing on the cell answer — not the one who arrived, nor one elsewhere", async () => {
    const { ctx, balances } = setup();
    await holding(ctx, E.toll, RIVAL);
    await holding(ctx, E.toll, OTHER);
    expect(await sameCell(ctx, { arrived: RIVAL, at: 10, reveal: false })).toEqual([]);
    expect(balances.get(RIVAL)).toBe(5);
    expect(balances.get(OTHER)).toBe(5);
    await holding(ctx, E.toll, ME);
    await sameCell(ctx, { arrived: RIVAL, at: 10, reveal: false });
    expect(balances.get(ME)).toBe(7);
  });

  it("a firing counts down an effect that waits and spends a held item's charge; one that lasts a span of rolls spends nothing", async () => {
    const { ctx, balances } = setup();
    const patience = await holding(ctx, E.patience, ME);
    const charm = await holding(ctx, E.charm, ME);
    const toll = await holding(ctx, E.toll, ME);
    await sameCell(ctx, { arrived: RIVAL, at: 10, reveal: false });
    expect(balances.get(ME)).toBe(11);
    expect(await ctx.store.getInstance(patience)).toMatchObject({ remaining: 1, status: "active" });
    expect(await ctx.store.getInstance(charm)).toMatchObject({ chargesLeft: 1, status: "active" });
    expect(await ctx.store.getInstance(toll)).toMatchObject({ remaining: 3, status: "active" });
    await sameCell(ctx, { arrived: RIVAL, at: 10, reveal: false });
    expect(await ctx.store.getInstance(patience)).toMatchObject({ status: "ended", endReason: "expired" });
    expect(await ctx.store.getInstance(charm)).toMatchObject({ status: "ended", endReason: "triggered" });
  });

  it("an item the rival may not hold another of stays, and says why", async () => {
    const { ctx, journal } = setup();
    const mine = await holding(ctx, E.badge, ME);
    await holding(ctx, E.badge, RIVAL);
    expect(await sameCell(ctx, { arrived: RIVAL, at: 10, reveal: false })).toEqual([]);
    expect(await ctx.store.getInstance(mine)).toMatchObject({ holderPlayerId: ME, status: "active" });
    expect(journal.at(-1)).toMatchObject({ op: "noop", instanceId: mine, targetPlayerId: RIVAL, outcome: { reason: "unique" } });
  });
});

describe("grant — one in the season (spec §6.19)", () => {
  it("is handed out once: a second is refused, whoever would get it, even once the first is gone", async () => {
    const { ctx, journal } = setup();
    const crown = await holding(ctx, E.crown, ME);
    expect(await grant(ctx, { entry: E.crown, to: RIVAL, source: "cell_bonus", reveal: true })).toMatchObject({ state: "blocked_unique", instanceId: null });
    expect(journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "unique_season" } });
    await endInstance(ctx, { instanceId: crown, reason: "revoked" });
    expect((await grant(ctx, { entry: E.crown, to: ME, source: "admin", reveal: true })).state).toBe("blocked_unique");
    // An item one per player is not one in the season.
    expect((await grant(ctx, { entry: E.badge, to: ME, source: "test", reveal: false })).state).toBe("granted");
    expect((await grant(ctx, { entry: E.badge, to: RIVAL, source: "test", reveal: false })).state).toBe("granted");
  });
});
