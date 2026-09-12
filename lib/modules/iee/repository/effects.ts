import { and, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/infrastructure/db";
import { playerEffects, seasonPlayers, users, type PlayerEffectRow } from "@/db/schema";
import type { ActiveEffectLike, EffectBadge, IeeParams, Polarity } from "@/lib/engine";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ApplyEffectInput = {
  seasonId: string;
  seasonPlayerId: string;
  effectKey: string;
  params: IeeParams;
  polarity: Polarity;
  chargesLeft?: number | null;
  expiresAfterRollSeq?: number | null;
  appliedBySeasonPlayerId?: string | null;
  source: string;
  sourceMoveId?: string | null;
  /** Season-wide resolved-roll counter at grant time (cooldown clock). */
  seasonRollSeq: number;
};

export async function insertEffect(
  input: ApplyEffectInput,
  tx: Db = db,
): Promise<PlayerEffectRow> {
  const [row] = await tx
    .insert(playerEffects)
    .values({
      seasonId: input.seasonId,
      seasonPlayerId: input.seasonPlayerId,
      effectKey: input.effectKey,
      params: input.params,
      polarity: input.polarity,
      chargesLeft: input.chargesLeft ?? null,
      expiresAfterRollSeq: input.expiresAfterRollSeq ?? null,
      appliedBySeasonPlayerId: input.appliedBySeasonPlayerId ?? null,
      source: input.source,
      sourceMoveId: input.sourceMoveId ?? null,
      seasonRollSeq: input.seasonRollSeq,
    })
    .returning();
  return row!;
}

/**
 * Resets an existing row's duration in place — the `refresh` stacking policy.
 * Returns null when there was nothing to refresh, so the caller can insert.
 *
 * **A refresh may never reduce what is already there.** It used to write the
 * new values flat, which made "restart the timer" mean "set the timer to
 * whatever the newest grant says" — including a smaller number. Paired with the
 * old habit of granting from the catalog instead of the season's tuning, that
 * turned an attack into a favour: a season that stretched `slowed` to five
 * rolls handed out five from a penalty cell, and an enemy's hex scroll, reading
 * the catalog's two, overwrote five with two. Attacking a slowed rival
 * shortened their slow.
 *
 * So both counters take the better of the two. A genuinely expired row is
 * always revived rather than preserved, because its old expiry is by definition
 * behind the new one.
 *
 * `params` are deliberately left alone: a refresh restarts a status, it does
 * not re-cast it.
 */
export async function refreshEffect(
  seasonPlayerId: string,
  effectKey: string,
  next: { chargesLeft?: number | null; expiresAfterRollSeq?: number | null },
  tx: Db = db,
): Promise<PlayerEffectRow | null> {
  const [row] = await tx
    .update(playerEffects)
    .set({
      chargesLeft:
        next.chargesLeft === null || next.chargesLeft === undefined
          ? null
          : sql`greatest(coalesce(${playerEffects.chargesLeft}, 0), ${next.chargesLeft})`,
      expiresAfterRollSeq:
        next.expiresAfterRollSeq === null || next.expiresAfterRollSeq === undefined
          ? null
          : sql`greatest(coalesce(${playerEffects.expiresAfterRollSeq}, 0), ${next.expiresAfterRollSeq})`,
      appliedAt: new Date(),
    })
    .where(
      and(
        eq(playerEffects.seasonPlayerId, seasonPlayerId),
        eq(playerEffects.effectKey, effectKey),
        eq(playerEffects.state, "active"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Rows still marked active. Lazy expiry is applied by the engine on read.
 * Takes the transaction handle so a caller inside one reads its own writes —
 * reading through the pool from inside a transaction would see a stale
 * snapshot.
 */
export async function getActiveEffectRows(
  seasonPlayerId: string,
  tx: Db = db,
): Promise<PlayerEffectRow[]> {
  return tx
    .select()
    .from(playerEffects)
    .where(
      and(
        eq(playerEffects.seasonPlayerId, seasonPlayerId),
        eq(playerEffects.state, "active"),
      ),
    )
    .orderBy(desc(playerEffects.appliedAt));
}

/**
 * "Still in force", as SQL — the same rule as `isEffectActive` in the engine.
 *
 * `state = 'active'` does **not** mean a status is doing anything. Expiry is
 * lazy: there is no scheduler in this project, so a row keeps that state until
 * the player's next resolve sweeps it. Four public surfaces asked the database
 * only for the state column and therefore drew badges for statuses that were
 * already spent — a used-up shield stayed on the board, and a player who
 * stopped rolling kept every badge they had, permanently. That is the
 * information PvP is played on.
 *
 * The comparison is against `roll_seq + 1`, the roll that is *next*, never the
 * one that just finished. Getting that one apart is the whole of session 22.
 *
 * Requires `season_players` to be joined, for the player's own counter.
 */
function stillInForce() {
  return and(
    or(isNull(playerEffects.chargesLeft), gt(playerEffects.chargesLeft, 0)),
    or(
      isNull(playerEffects.expiresAfterRollSeq),
      gte(playerEffects.expiresAfterRollSeq, sql`${seasonPlayers.rollSeq} + 1`),
    ),
  );
}

/** Projection the engine's hook runner consumes. */
export function toActiveEffectLike(row: PlayerEffectRow): ActiveEffectLike {
  return {
    id: row.id,
    effectKey: row.effectKey,
    params: (row.params ?? {}) as IeeParams,
    chargesLeft: row.chargesLeft,
    expiresAfterRollSeq: row.expiresAfterRollSeq,
    appliedAt: row.appliedAt.getTime(),
  };
}

export async function spendEffectCharges(
  ids: readonly string[],
  tx: Db = db,
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(playerEffects)
    .set({ chargesLeft: sql`greatest(${playerEffects.chargesLeft} - 1, 0)` })
    .where(and(inArray(playerEffects.id, [...ids]), eq(playerEffects.state, "active")));
}

export async function markEffectsEnded(
  ids: readonly string[],
  state: "expired" | "cleansed" | "revoked",
  tx: Db = db,
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(playerEffects)
    .set({ state, endedAt: new Date() })
    .where(and(inArray(playerEffects.id, [...ids]), eq(playerEffects.state, "active")));
}

/** Removes matching statuses — a cleanse item, or staff intervention. */
export async function cleanseEffects(
  seasonPlayerId: string,
  filter: { effectKeys?: readonly string[]; polarity?: Polarity },
  tx: Db = db,
): Promise<number> {
  const conds = [
    eq(playerEffects.seasonPlayerId, seasonPlayerId),
    eq(playerEffects.state, "active"),
  ];
  if (filter.effectKeys && filter.effectKeys.length > 0) {
    conds.push(inArray(playerEffects.effectKey, [...filter.effectKeys]));
  }
  if (filter.polarity) conds.push(eq(playerEffects.polarity, filter.polarity));

  const rows = await tx
    .update(playerEffects)
    .set({ state: "cleansed", endedAt: new Date() })
    .where(and(...conds))
    .returning({ id: playerEffects.id });
  return rows.length;
}

export async function countEffectsPerSeason(
  seasonId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: playerEffects.effectKey, n: sql<number>`count(*)::int` })
    .from(playerEffects)
    .where(eq(playerEffects.seasonId, seasonId))
    .groupBy(playerEffects.effectKey);
  return Object.fromEntries(rows.map((r) => [r.key, r.n]));
}

export async function countEffectsPerPlayer(
  seasonPlayerId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: playerEffects.effectKey, n: sql<number>`count(*)::int` })
    .from(playerEffects)
    .where(eq(playerEffects.seasonPlayerId, seasonPlayerId))
    .groupBy(playerEffects.effectKey);
  return Object.fromEntries(rows.map((r) => [r.key, r.n]));
}

export async function lastEffectDropSeq(
  seasonId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      key: playerEffects.effectKey,
      seq: sql<number>`coalesce(max(${playerEffects.seasonRollSeq}), 0)::int`,
    })
    .from(playerEffects)
    .where(eq(playerEffects.seasonId, seasonId))
    .groupBy(playerEffects.effectKey);
  return Object.fromEntries(rows.map((r) => [r.key, r.seq]));
}

/**
 * Statuses in force, plus who cast each one.
 *
 * The victim always learns who hit them — that is half of §8.3: the public
 * record is both the requested log and the main deterrent against griefing.
 */
export async function getActiveEffectsWithCaster(
  seasonPlayerId: string,
): Promise<Array<PlayerEffectRow & { castByUsername: string | null }>> {
  const caster = alias(seasonPlayers, "caster");
  const rows = await db
    .select({ effect: playerEffects, username: users.username })
    .from(playerEffects)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, playerEffects.seasonPlayerId))
    .leftJoin(caster, eq(caster.id, playerEffects.appliedBySeasonPlayerId))
    .leftJoin(users, eq(users.id, caster.playerId))
    .where(
      and(
        eq(playerEffects.seasonPlayerId, seasonPlayerId),
        eq(playerEffects.state, "active"),
        stillInForce(),
      ),
    )
    .orderBy(desc(playerEffects.appliedAt));
  return rows.map((r) => ({ ...r.effect, castByUsername: r.username }));
}

/**
 * Statuses in force for a whole season, grouped by participant.
 *
 * One query for the whole table: the leaderboard and the board both render a
 * badge per player, and asking per row would be a query per participant on a
 * page whose whole point is to list all of them.
 *
 * `player_effects.season_id` is denormalised for exactly this — see the
 * `event_log` precedent — so this never has to join through `season_players`.
 */
export async function getActiveEffectsBySeason(
  seasonId: string,
): Promise<Map<string, EffectBadge[]>> {
  const rows = await db
    .select({
      seasonPlayerId: playerEffects.seasonPlayerId,
      effectKey: playerEffects.effectKey,
      polarity: playerEffects.polarity,
    })
    .from(playerEffects)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, playerEffects.seasonPlayerId))
    .where(
      and(
        eq(playerEffects.seasonId, seasonId),
        eq(playerEffects.state, "active"),
        stillInForce(),
      ),
    )
    .orderBy(desc(playerEffects.appliedAt));

  const out = new Map<string, EffectBadge[]>();
  for (const row of rows) {
    const list = out.get(row.seasonPlayerId) ?? [];
    // One badge per key: two stacks of the same status are still one thing the
    // reader needs to know about.
    if (!list.some((b) => b.effectKey === row.effectKey)) {
      list.push({ effectKey: row.effectKey, polarity: row.polarity as Polarity });
    }
    out.set(row.seasonPlayerId, list);
  }
  return out;
}

/** One status row by id — the staff panel acts on a specific one. */
export async function getEffectRow(id: string): Promise<PlayerEffectRow | null> {
  const rows = await db.select().from(playerEffects).where(eq(playerEffects.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Statuses in force across a season, with their row ids.
 *
 * `getActiveEffectsBySeason` deliberately returns badges — one per key, no ids
 * — because that is all a public list needs. Staff need to act on a particular
 * row, so this returns them whole, under the same in-force rule: showing a
 * judge a status the game has already stopped applying would be the same
 * confusion the public pages had.
 */
export async function getEffectRowsBySeason(
  seasonId: string,
): Promise<Array<{ id: string; seasonPlayerId: string; effectKey: string; polarity: Polarity }>> {
  const rows = await db
    .select({
      id: playerEffects.id,
      seasonPlayerId: playerEffects.seasonPlayerId,
      effectKey: playerEffects.effectKey,
      polarity: playerEffects.polarity,
    })
    .from(playerEffects)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, playerEffects.seasonPlayerId))
    .where(
      and(
        eq(playerEffects.seasonId, seasonId),
        eq(playerEffects.state, "active"),
        stillInForce(),
      ),
    )
    .orderBy(desc(playerEffects.appliedAt));
  return rows.map((r) => ({ ...r, polarity: r.polarity as Polarity }));
}
