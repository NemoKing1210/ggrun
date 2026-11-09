/**
 * Reading live items and effects (docs/IEE_CONSTRUCTOR_SPEC.md §4.3).
 *
 * Reads only — every write goes through `lib/modules/iee/executor`. Counters
 * are eager, so `status = 'active'` means "in force": the caveats the old
 * tables carried about lazily expired rows are gone, and every surface — the
 * dashboard, the board, both leaderboards, the staff panel, the wheel's gates —
 * asks the same simple question.
 *
 * Instances point at revisions; keys and characters come from the season
 * registry, so a function that needs them takes it as an argument.
 */
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/infrastructure/db";
import { ieeEntryRevisions, ieeInstances, seasonPlayers, users, type IeeInstanceRow } from "@/db/schema";
import type { BoardObjectView, EffectBadge, IeeLocaleText, IeePlayerSnapshot, Polarity, PoolCounters } from "@/lib/engine";
import type { Localized, StandingAnswer } from "@/lib/engine/iee/dsl";

import { conditionTextOf, standingFor } from "../executor";
import type { SeasonRegistry } from "../registry";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One instance by id, whatever its state. */
export async function getInstanceRow(id: string, tx: Db = db): Promise<IeeInstanceRow | null> {
  const rows = await tx.select().from(ieeInstances).where(eq(ieeInstances.id, id)).limit(1);
  return rows[0] ?? null;
}

/** A completion condition of a roll, as the game card, the judge and the history show it (wave C, spec §6.17). */
export interface RollConditionView {
  id: string;
  rollId: string;
  text: Localized;
  /** The entry that added it, by its name in the revision that added it; null when it reads no name. */
  from: Localized | null;
  /** Still held: the roll is open. A reported game's conditions have ended with it. */
  active: boolean;
}

/**
 * The completion conditions of these rolls, oldest first, by roll (spec
 * §6.17) — what their games were held to, whatever season they belong to: the
 * name comes from the revision that added each, as history keeps it.
 */
export async function listRollConditions(rollIds: readonly string[], tx: Db = db): Promise<Map<string, RollConditionView[]>> {
  const out = new Map<string, RollConditionView[]>();
  const ids = [...new Set(rollIds)];
  if (ids.length === 0) return out;
  const rows = await tx
    .select({ instance: ieeInstances, name: sql<unknown>`${ieeEntryRevisions.doc} -> 'name'` })
    .from(ieeInstances)
    .innerJoin(ieeEntryRevisions, eq(ieeEntryRevisions.id, ieeInstances.revisionId))
    .where(and(inArray(ieeInstances.holderRollId, ids), eq(ieeInstances.kind, "roll_condition")))
    .orderBy(asc(ieeInstances.grantedAt), asc(ieeInstances.id));
  for (const { instance, name } of rows) {
    const text = conditionTextOf(instance);
    if (!text || !instance.holderRollId) continue;
    const from = name && typeof name === "object" && typeof (name as { ru?: unknown }).ru === "string" ? (name as Localized) : null;
    const list = out.get(instance.holderRollId) ?? [];
    list.push({ id: instance.id, rollId: instance.holderRollId, text, from, active: instance.status === "active" });
    out.set(instance.holderRollId, list);
  }
  return out;
}

/** Everything a participant holds and suffers right now, newest first. */
export async function listActiveInstances(seasonPlayerId: string, tx: Db = db): Promise<IeeInstanceRow[]> {
  return tx
    .select()
    .from(ieeInstances)
    .where(and(eq(ieeInstances.holderPlayerId, seasonPlayerId), eq(ieeInstances.status, "active")))
    .orderBy(desc(ieeInstances.grantedAt), desc(ieeInstances.id));
}

/**
 * The objects standing on a season's board (wave D, spec §6.18), oldest first —
 * what a turn's walk meets and what the board shows.
 */
export async function listActiveObjects(seasonId: string, tx: Db = db): Promise<IeeInstanceRow[]> {
  return tx
    .select()
    .from(ieeInstances)
    .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.holderKind, "cell"), eq(ieeInstances.status, "active")))
    .orderBy(asc(ieeInstances.grantedAt), asc(ieeInstances.id));
}

/**
 * The objects standing on a season's board, as the board shows them (wave D,
 * spec §6.18): oldest first, each with its item's view in the revision it
 * holds and its owner. An object whose revision the season cannot read is
 * left out — it does nothing either (`executor.boardObjects`).
 */
export async function boardObjectsBySeason(seasonId: string, registry: SeasonRegistry): Promise<BoardObjectView[]> {
  const rows = await db
    .select({
      id: ieeInstances.id,
      cell: ieeInstances.holderCellIndex,
      revisionId: ieeInstances.revisionId,
      username: users.username,
      displayName: users.displayName,
    })
    .from(ieeInstances)
    .leftJoin(seasonPlayers, eq(seasonPlayers.id, ieeInstances.ownerPlayerId))
    .leftJoin(users, eq(users.id, seasonPlayers.playerId))
    .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.holderKind, "cell"), eq(ieeInstances.status, "active")))
    .orderBy(asc(ieeInstances.grantedAt), asc(ieeInstances.id));
  return rows.flatMap((row): BoardObjectView[] => {
    const view = registry.instanceView(row.revisionId);
    if (!view || row.cell === null) return [];
    return [
      {
        instanceId: row.id,
        cell: row.cell,
        key: view.key,
        name: view.name,
        ruleText: view.ruleText,
        glyph: view.glyph,
        polarity: view.polarity,
        art: view.art,
        owner: row.username ? { username: row.username, displayName: row.displayName } : null,
      },
    ];
  });
}

export interface HeldItemRow {
  id: string;
  key: string;
  revisionId: string;
  /** Uses — or, for a passive or cursed item, firings — left; null for a passive one that stays while held. */
  chargesLeft: number | null;
  source: string;
  params: Record<string, number | string | boolean>;
  grantedAt: Date;
}

export interface ActiveEffectRow {
  id: string;
  key: string;
  revisionId: string;
  polarity: Polarity;
  /** What is left of the duration, in `unit`; null for permanent ones. */
  remaining: number | null;
  unit: IeeInstanceRow["remainingUnit"];
  /** The holder roll it counts from — later than now while a game is in flight. */
  anchorRollSeq: number | null;
  castByUsername: string | null;
  grantedAt: Date;
}

/** A participant's usable items, with keys from the registry. */
export async function listHeldItems(seasonPlayerId: string, registry: SeasonRegistry): Promise<HeldItemRow[]> {
  const rows = await listActiveInstances(seasonPlayerId);
  return rows.flatMap((row) => {
    if (row.kind !== "item") return [];
    const entry = registry.get(row.revisionId);
    if (!entry) return [];
    return [
      {
        id: row.id,
        key: entry.key,
        revisionId: row.revisionId,
        chargesLeft: row.chargesLeft,
        source: row.source,
        params: (row.params ?? {}) as HeldItemRow["params"],
        grantedAt: row.grantedAt,
      },
    ];
  });
}

/**
 * A participant's effects in force, and who cast each — the victim always
 * learns who hit them (§8.3 of the old design, kept).
 */
export async function listActiveEffects(seasonPlayerId: string, registry: SeasonRegistry): Promise<ActiveEffectRow[]> {
  const caster = alias(seasonPlayers, "caster");
  const rows = await db
    .select({ instance: ieeInstances, username: users.username })
    .from(ieeInstances)
    .leftJoin(caster, eq(caster.id, ieeInstances.ownerPlayerId))
    .leftJoin(users, eq(users.id, caster.playerId))
    .where(
      and(
        eq(ieeInstances.holderPlayerId, seasonPlayerId),
        eq(ieeInstances.status, "active"),
        eq(ieeInstances.kind, "effect"),
      ),
    )
    .orderBy(desc(ieeInstances.grantedAt), desc(ieeInstances.id));
  return rows.flatMap(({ instance, username }) => {
    const entry = registry.get(instance.revisionId);
    if (!entry) return [];
    return [
      {
        id: instance.id,
        key: entry.key,
        revisionId: instance.revisionId,
        polarity: entry.polarity,
        remaining: instance.remaining,
        unit: instance.remainingUnit,
        anchorRollSeq: instance.anchorRollSeq,
        castByUsername: username ?? null,
        grantedAt: instance.grantedAt,
      },
    ];
  });
}

/**
 * Effects in force for a whole season, one badge per key per participant —
 * one query for the board and the leaderboards, never one per row.
 */
export async function effectBadgesBySeason(
  seasonId: string,
  registry: SeasonRegistry,
): Promise<Map<string, EffectBadge[]>> {
  const rows = await db
    .select({ holder: ieeInstances.holderPlayerId, revisionId: ieeInstances.revisionId })
    .from(ieeInstances)
    .where(
      and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.status, "active"), eq(ieeInstances.kind, "effect")),
    )
    .orderBy(desc(ieeInstances.grantedAt), desc(ieeInstances.id));
  const out = new Map<string, EffectBadge[]>();
  for (const row of rows) {
    const entry = row.holder ? registry.get(row.revisionId) : null;
    if (!row.holder || !entry) continue;
    const list = out.get(row.holder) ?? [];
    // Two stacks of one status are still one thing the reader needs to know.
    if (!list.some((b) => b.effectKey === entry.key)) {
      list.push({ effectKey: entry.key, polarity: entry.polarity, name: entry.names });
    }
    out.set(row.holder, list);
  }
  return out;
}

/**
 * How many bonus items each participant of a season holds — what a steal, a
 * trade or a copy may take (wave B, spec §6.12). A cursed item is not one.
 */
export async function bonusItemsBySeason(seasonId: string, registry: SeasonRegistry): Promise<Map<string, number>> {
  const rows = await db
    .select({ holder: ieeInstances.holderPlayerId, revisionId: ieeInstances.revisionId })
    .from(ieeInstances)
    .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.status, "active"), eq(ieeInstances.kind, "item")));
  const out = new Map<string, number>();
  for (const row of rows) {
    if (!row.holder || registry.get(row.revisionId)?.character !== "bonus") continue;
    out.set(row.holder, (out.get(row.holder) ?? 0) + 1);
  }
  return out;
}

/**
 * What holds on each participant of a season (wave B, spec §6.13): who
 * cannot be aimed at, who cannot use items — read for the dashboard and the
 * bots, which offer only what the use checks would allow; the use checks
 * themselves ask again. Only players with a standing rule in force appear.
 */
export async function standingBySeason(seasonId: string, registry: SeasonRegistry): Promise<Map<string, StandingAnswer>> {
  const rows = await db
    .select()
    .from(ieeInstances)
    .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.status, "active"), eq(ieeInstances.holderKind, "player")));
  const byHolder = new Map<string, IeeInstanceRow[]>();
  for (const row of rows) {
    if (!row.holderPlayerId) continue;
    byHolder.set(row.holderPlayerId, [...(byHolder.get(row.holderPlayerId) ?? []), row]);
  }
  const standing = [...byHolder].filter(([, list]) => list.some((row) => (registry.get(row.revisionId)?.standing.length ?? 0) > 0));
  const out = new Map<string, StandingAnswer>();
  if (standing.length === 0) return out;
  // Where everyone stands: a standing rule may read the holder's place.
  const players = await db
    .select({ id: seasonPlayers.id, position: seasonPlayers.position, balance: seasonPlayers.balancePoints, rollSeq: seasonPlayers.rollSeq, status: seasonPlayers.status })
    .from(seasonPlayers)
    .where(eq(seasonPlayers.seasonId, seasonId));
  const active = players.filter((p) => p.status === "active");
  for (const [holder, list] of standing) {
    const p = players.find((x) => x.id === holder);
    if (!p) continue;
    const self: IeePlayerSnapshot = {
      seasonPlayerId: p.id,
      position: p.position,
      balancePoints: p.balance,
      rollSeq: p.rollSeq,
      moveCount: 0,
      rank: active.filter((o) => o.position > p.position).length + 1,
      behind: active.filter((o) => o.id !== p.id && o.position < p.position).length,
      status: p.status,
    };
    out.set(holder, standingFor(registry, list, self, Math.random));
  }
  return out;
}

/** One active instance on the staff panel, with what it takes to draw it. */
interface StaffInstance {
  id: string;
  seasonPlayerId: string;
  name: IeeLocaleText;
  glyph: string | null;
}

/** Staff panel: every active instance of a season, with its holder. */
export async function activeInstancesBySeason(
  seasonId: string,
  registry: SeasonRegistry,
): Promise<{
  items: Array<StaffInstance & { itemKey: string; chargesLeft: number }>;
  effects: Array<StaffInstance & { effectKey: string; polarity: Polarity }>;
}> {
  const rows = await db
    .select()
    .from(ieeInstances)
    .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.status, "active")))
    .orderBy(desc(ieeInstances.grantedAt), desc(ieeInstances.id));
  const items: Array<StaffInstance & { itemKey: string; chargesLeft: number }> = [];
  const effects: Array<StaffInstance & { effectKey: string; polarity: Polarity }> = [];
  for (const row of rows) {
    const entry = registry.get(row.revisionId);
    if (!entry || !row.holderPlayerId) continue;
    const base = { id: row.id, seasonPlayerId: row.holderPlayerId, name: entry.names, glyph: entry.glyph };
    if (row.kind === "item") {
      items.push({ ...base, itemKey: entry.key, chargesLeft: row.chargesLeft ?? 0 });
    } else if (row.kind === "effect") {
      effects.push({ ...base, effectKey: entry.key, polarity: entry.polarity });
    }
  }
  return { items, effects };
}

/** Per-entry numbers keyed by the entry's key; entries the season does not play drop out. */
function byKey(rows: Array<{ entryId: string; n: number }>, registry: SeasonRegistry): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const entry = registry.get(row.entryId);
    if (entry) out[entry.key] = row.n;
  }
  return out;
}

/**
 * The wheel's counters (spec §7.11): drops per entry across the season and to
 * this participant, and the season clock at each entry's last drop. They count
 * per **entry**, never per revision, and every instance ever granted counts —
 * an ended one was still a drop. A completion condition an entry added to a
 * roll is no drop of it (§6.17).
 */
/** Instances that are no drop of their entry: a condition an entry added to a roll (§6.17), an item standing on the board (§6.18). */
const NOT_DROPS: ("roll_condition" | "board_object")[] = ["roll_condition", "board_object"];

export async function poolCounters(
  seasonId: string,
  seasonPlayerId: string,
  registry: SeasonRegistry,
): Promise<PoolCounters> {
  const [perSeason, perPlayer, lastDrop] = await Promise.all([
    db
      .select({ entryId: ieeInstances.entryId, n: sql<number>`count(*)::int` })
      .from(ieeInstances)
      .where(and(eq(ieeInstances.seasonId, seasonId), notInArray(ieeInstances.kind, NOT_DROPS)))
      .groupBy(ieeInstances.entryId),
    db
      .select({ entryId: ieeInstances.entryId, n: sql<number>`count(*)::int` })
      .from(ieeInstances)
      .where(eq(ieeInstances.holderPlayerId, seasonPlayerId))
      .groupBy(ieeInstances.entryId),
    db
      .select({
        entryId: ieeInstances.entryId,
        n: sql<number>`coalesce(max(${ieeInstances.grantedRollSeq}), 0)::int`,
      })
      .from(ieeInstances)
      .where(and(eq(ieeInstances.seasonId, seasonId), notInArray(ieeInstances.kind, NOT_DROPS)))
      .groupBy(ieeInstances.entryId),
  ]);
  return {
    perSeason: byKey(perSeason, registry),
    perPlayer: byKey(perPlayer, registry),
    lastDropRollSeq: byKey(lastDrop, registry),
  };
}
