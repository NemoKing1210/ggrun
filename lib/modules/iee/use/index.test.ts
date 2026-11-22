/**
 * Using an item that asks for a pick for the next game
 * (docs/IEE_CONSTRUCTOR_SPEC.md §6.16): of the kind it asks, one the season's
 * pool offers the user — and what the use hands them remembers it.
 */
import { describe, expect, it, vi } from "vitest";

import type { IeePlayerSnapshot, PickRequest, UsePick } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry } from "../registry";
import { decideItemUse, type ItemUseQuestion } from "./index";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });
const docs: [string, EntryDoc][] = [
  [
    ID(1),
    {
      dslVersion: 1,
      kind: "item",
      slug: "favourite",
      name: names("favourite"),
      character: "bonus",
      rarity: "common",
      tags: [],
      usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "game" },
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: ID(2) }, to: "self" }] }],
    },
  ],
  [
    ID(2),
    {
      dslVersion: 1,
      kind: "effect",
      slug: "favourite_game",
      name: names("favourite_game"),
      character: "bonus",
      rarity: "common",
      tags: [],
      duration: { unit: "next_game" },
      stacking: { mode: "refresh" },
      rules: [{ when: "beforeGameRoll", do: [{ op: "poolFavor", factor: 3 }] }],
    },
  ],
];
const registry = buildRegistry(compileSet(docs.map(([entryId, doc], i) => ({ entryId, revisionId: ID(100 + i), doc }))));
const favourite = registry.item("favourite")!;

const me: IeePlayerSnapshot = { seasonPlayerId: "sp-me", position: 10, balancePoints: 5, rollSeq: 3, moveCount: 4, rank: 1, status: "active" };
const CELESTE: UsePick = { gameId: ID(9), title: "Celeste" };

function question(over: Partial<ItemUseQuestion> = {}): ItemUseQuestion {
  return {
    registry,
    item: favourite,
    params: {},
    hasOpenRoll: false,
    actor: me,
    candidate: null,
    targetInSameSeason: true,
    allowTargetingOthers: true,
    pvpProtectionMoves: 0,
    rowsOf: async () => [],
    rng: () => 0,
    ...over,
  };
}

describe("decideItemUse — a pick for the next game (spec §6.16)", () => {
  it("is refused without a pick, or with one of another kind — nothing is asked of the pool", async () => {
    const offeredPick = vi.fn(async () => CELESTE);
    expect(await decideItemUse(question({ offeredPick }))).toEqual({ ok: false, code: "ieePickRequired" });
    expect(await decideItemUse(question({ pick: { genre: "rpg" }, offeredPick }))).toEqual({ ok: false, code: "ieePickRequired" });
    expect(offeredPick).not.toHaveBeenCalled();
  });

  it("is refused when the season's pool does not offer it", async () => {
    const offeredPick = vi.fn(async (_pick: PickRequest): Promise<UsePick | null> => null);
    expect(await decideItemUse(question({ pick: { gameId: ID(8) }, offeredPick }))).toEqual({ ok: false, code: "ieePickInvalid" });
    expect(offeredPick).toHaveBeenCalledWith({ gameId: ID(8) });
    // Nobody to ask: nothing is offered.
    expect(await decideItemUse(question({ pick: { gameId: ID(8) } }))).toEqual({ ok: false, code: "ieePickInvalid" });
  });

  it("hands its user an effect that remembers the pick as the pool offers it — the game with its title", async () => {
    const decided = await decideItemUse(question({ pick: { gameId: ID(9) }, offeredPick: async () => CELESTE }));
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.outcome.intents).toEqual([
      { kind: "grant", entryId: ID(2), key: "favourite_game", entryKind: "effect", to: "sp-me", chosen: CELESTE },
    ]);
  });
});
