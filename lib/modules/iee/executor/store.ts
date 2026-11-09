/**
 * The executor's data access — the only code that writes `iee_instances` and
 * `iee_journal` (docs/IEE_CONSTRUCTOR_SPEC.md §9.1; an architecture test
 * holds it to that).
 *
 * Kept behind an interface so the executor's rules — stacking, counters,
 * chains, what gets journaled — are tested against an in-memory store, and
 * this file stays a list of guarded statements. Every write that can race a
 * double submit carries its guard in the WHERE clause, never in a preceding
 * SELECT.
 */
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";

import type { UsePick } from "@/lib/engine";
import { db } from "@/lib/infrastructure/db";
import {
  ieeDecisions,
  ieeInstances,
  ieeJournal,
  ledgerEntries,
  moves,
  seasonPlayers,
  users,
  type IeeDecisionRow,
  type IeeInstanceRow,
  type IeeJournalRow,
} from "@/db/schema";

export type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewJournalRow = Omit<IeeJournalRow, "id" | "createdAt">;
export type NewInstanceRow = Omit<
  IeeInstanceRow,
  "status" | "endReason" | "grantedAt" | "endedAt" | "holderCellIndex" | "holderRollId" | "countFromRollSeq" | "aimedPlayerId" | "chosen"
> & {
  /** Whom the item that handed out an effect was aimed at (spec §6.11); nobody when absent. */
  aimedPlayerId?: string | null;
  /** What the use that handed out an effect picked for the next game (wave C, spec §6.16); nothing when absent. */
  chosen?: UsePick | null;
  /** The roll a completion condition is held by (wave C, spec §6.17); none for a player's instance. */
  holderRollId?: string | null;
  /** The cell a board object stands on (wave D, spec §6.18); none for a player's instance. */
  holderCellIndex?: number | null;
};
export type EndReason = NonNullable<IeeInstanceRow["endReason"]>;

/** A question as the executor opens it (spec §4.3, §7.6). */
export type NewDecisionRow = Pick<
  IeeDecisionRow,
  "id" | "seasonId" | "playerId" | "kind" | "instanceId" | "revisionId" | "ruleIndex" | "options" | "defaultChoice" | "context" | "causeJournalId"
>;

/** How a pending decision is settled. */
export interface DecisionSettlement {
  status: "resolved" | "judged" | "defaulted";
  choice: unknown;
  resolvedByUserId: string | null;
}

/** Where a participant stands, for an out-of-turn move (spec §7.3). */
export interface PlayerPlace {
  id: string;
  position: number;
  status: "active" | "finished" | "withdrawn" | "disqualified" | (string & {});
}

export interface IeeStore {
  journal(row: NewJournalRow): Promise<number>;
  insertInstance(row: NewInstanceRow): Promise<IeeInstanceRow>;
  /** Active instances a participant holds, newest first. */
  activeForHolder(holderPlayerId: string): Promise<IeeInstanceRow[]>;
  /** The completion conditions a roll holds that are still in force, oldest first (wave C, spec §6.17). */
  activeForRoll(rollId: string): Promise<IeeInstanceRow[]>;
  /** The objects standing on a season's board, oldest first (wave D, spec §6.18). */
  activeObjects(seasonId: string): Promise<IeeInstanceRow[]>;
  /** Whether the season ever handed out an item of the entry, held or gone (wave D, one in the season, spec §6.19). */
  handedOut(seasonId: string, entryId: string): Promise<boolean>;
  getInstance(id: string): Promise<IeeInstanceRow | null>;
  /** Sets the counter of an active instance; null when it is no longer active. */
  setRemaining(id: string, remaining: number): Promise<IeeInstanceRow | null>;
  /**
   * Renews the counter of an active instance (a `refresh` grant): what is
   * left and the roll it counts from. Null when it is no longer active.
   */
  renew(id: string, counter: { remaining: number; countFromRollSeq: number }): Promise<IeeInstanceRow | null>;
  /** Points an active effect at another player — a renewal aimed elsewhere (spec §6.11). */
  aim(id: string, aimedPlayerId: string): Promise<void>;
  /** What an active effect remembers of its use's pick — a renewal that picked again (wave C, spec §6.16). */
  choose(id: string, chosen: UsePick): Promise<void>;
  /** Spends one charge of an active item; null when there was none to spend. */
  spendCharge(id: string): Promise<IeeInstanceRow | null>;
  /** Ends an active instance; null when it had already ended. */
  end(id: string, reason: EndReason): Promise<IeeInstanceRow | null>;
  /**
   * Hands an active instance a player holds to another player (wave B, spec
   * §6.12): the same instance, its charges and parameters with it, counting
   * from `anchorRollSeq` — the new holder's next roll for a passive item, null
   * for an active one. Null when it is no longer active.
   */
  rehome(id: string, holderPlayerId: string, anchorRollSeq: number | null): Promise<IeeInstanceRow | null>;
  /** A participant's username, for the feed; null when there is none. */
  nameOf(seasonPlayerId: string): Promise<string | null>;
  /** A participant's balance, read inside the transaction. */
  balanceOf(seasonPlayerId: string): Promise<number | null>;
  /** Moves points: a ledger line and the new balance, in one go. */
  writeBalance(entry: { seasonPlayerId: string; delta: number; reason: string; balance: number }): Promise<void>;
  /** A season reset: every instance and journal row of the season. */
  clearSeason(seasonId: string): Promise<{ instances: number; journal: number }>;
  /** Every participant of a season and where they stand — an out-of-turn move reads them. */
  places(seasonId: string): Promise<PlayerPlace[]>;
  /** An out-of-turn move (spec §7.3): the position only — and the finish, which still counts. */
  setPosition(seasonPlayerId: string, position: number, finished: boolean): Promise<void>;
  /** Where the participant's last regular move started; null before their first. */
  lastMoveStart(seasonPlayerId: string): Promise<number | null>;
  /** Revisions a `compile_failed` row already exists for. */
  compileFailuresJournaled(seasonId: string): Promise<Set<string>>;
  // --- decisions (wave B, spec §7.4, §7.6) ---
  insertDecision(row: NewDecisionRow): Promise<IeeDecisionRow>;
  getDecision(id: string): Promise<IeeDecisionRow | null>;
  /** A participant's pending decisions, oldest first. */
  pendingDecisions(playerId: string): Promise<IeeDecisionRow[]>;
  /** Asks a pending question again with what it offers now; null when it is pending no more. */
  reaskDecision(
    id: string,
    update: Pick<IeeDecisionRow, "options" | "defaultChoice" | "context">,
  ): Promise<IeeDecisionRow | null>;
  /** Settles a pending decision; null when it was settled already — the guard is the UPDATE. */
  settleDecision(id: string, settlement: DecisionSettlement): Promise<IeeDecisionRow | null>;
}

export function pgStore(tx: Tx = db): IeeStore {
  return {
    async journal(row) {
      const [inserted] = await tx.insert(ieeJournal).values(row).returning({ id: ieeJournal.id });
      return inserted!.id;
    },

    async insertInstance(row) {
      const [inserted] = await tx.insert(ieeInstances).values(row).returning();
      return inserted!;
    },

    async activeForHolder(holderPlayerId) {
      return tx
        .select()
        .from(ieeInstances)
        .where(and(eq(ieeInstances.holderPlayerId, holderPlayerId), eq(ieeInstances.status, "active")))
        .orderBy(desc(ieeInstances.grantedAt), desc(ieeInstances.id));
    },

    async activeForRoll(rollId) {
      return tx
        .select()
        .from(ieeInstances)
        .where(and(eq(ieeInstances.holderRollId, rollId), eq(ieeInstances.status, "active")))
        .orderBy(asc(ieeInstances.grantedAt), asc(ieeInstances.id));
    },

    async activeObjects(seasonId) {
      return tx
        .select()
        .from(ieeInstances)
        .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.holderKind, "cell"), eq(ieeInstances.status, "active")))
        .orderBy(asc(ieeInstances.grantedAt), asc(ieeInstances.id));
    },

    async handedOut(seasonId, entryId) {
      const rows = await tx
        .select({ id: ieeInstances.id })
        .from(ieeInstances)
        .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.entryId, entryId), eq(ieeInstances.kind, "item")))
        .limit(1);
      return rows.length > 0;
    },

    async getInstance(id) {
      const rows = await tx.select().from(ieeInstances).where(eq(ieeInstances.id, id)).limit(1);
      return rows[0] ?? null;
    },

    async setRemaining(id, remaining) {
      const [row] = await tx
        .update(ieeInstances)
        .set({ remaining })
        .where(and(eq(ieeInstances.id, id), eq(ieeInstances.status, "active")))
        .returning();
      return row ?? null;
    },

    async renew(id, counter) {
      const [row] = await tx
        .update(ieeInstances)
        .set({ remaining: counter.remaining, countFromRollSeq: counter.countFromRollSeq })
        .where(and(eq(ieeInstances.id, id), eq(ieeInstances.status, "active")))
        .returning();
      return row ?? null;
    },

    async aim(id, aimedPlayerId) {
      await tx
        .update(ieeInstances)
        .set({ aimedPlayerId })
        .where(and(eq(ieeInstances.id, id), eq(ieeInstances.status, "active")));
    },

    async choose(id, chosen) {
      await tx
        .update(ieeInstances)
        .set({ chosen })
        .where(and(eq(ieeInstances.id, id), eq(ieeInstances.status, "active")));
    },

    async spendCharge(id) {
      const [row] = await tx
        .update(ieeInstances)
        .set({ chargesLeft: sql`${ieeInstances.chargesLeft} - 1` })
        .where(
          and(eq(ieeInstances.id, id), eq(ieeInstances.status, "active"), gt(ieeInstances.chargesLeft, 0)),
        )
        .returning();
      return row ?? null;
    },

    async end(id, reason) {
      const [row] = await tx
        .update(ieeInstances)
        .set({ status: "ended", endReason: reason, endedAt: new Date() })
        .where(and(eq(ieeInstances.id, id), eq(ieeInstances.status, "active")))
        .returning();
      return row ?? null;
    },

    async rehome(id, holderPlayerId, anchorRollSeq) {
      const [row] = await tx
        .update(ieeInstances)
        .set({ holderPlayerId, anchorRollSeq, countFromRollSeq: null })
        .where(and(eq(ieeInstances.id, id), eq(ieeInstances.status, "active"), eq(ieeInstances.holderKind, "player")))
        .returning();
      return row ?? null;
    },

    async nameOf(seasonPlayerId) {
      const rows = await tx
        .select({ username: users.username })
        .from(seasonPlayers)
        .innerJoin(users, eq(users.id, seasonPlayers.playerId))
        .where(eq(seasonPlayers.id, seasonPlayerId))
        .limit(1);
      return rows[0]?.username ?? null;
    },

    async balanceOf(seasonPlayerId) {
      const rows = await tx
        .select({ balance: seasonPlayers.balancePoints })
        .from(seasonPlayers)
        .where(eq(seasonPlayers.id, seasonPlayerId))
        .limit(1);
      return rows[0]?.balance ?? null;
    },

    async writeBalance(entry) {
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: entry.seasonPlayerId,
        delta: entry.delta,
        reason: entry.reason,
      });
      await tx
        .update(seasonPlayers)
        .set({ balancePoints: entry.balance })
        .where(eq(seasonPlayers.id, entry.seasonPlayerId));
    },

    async places(seasonId) {
      return tx
        .select({ id: seasonPlayers.id, position: seasonPlayers.position, status: seasonPlayers.status })
        .from(seasonPlayers)
        .where(eq(seasonPlayers.seasonId, seasonId));
    },

    async setPosition(seasonPlayerId, position, finished) {
      await tx
        .update(seasonPlayers)
        .set({ position, ...(finished ? { status: "finished" as const, finishedAt: new Date() } : {}) })
        .where(eq(seasonPlayers.id, seasonPlayerId));
    },

    async lastMoveStart(seasonPlayerId) {
      const rows = await tx
        .select({ from: moves.fromPosition })
        .from(moves)
        .where(eq(moves.seasonPlayerId, seasonPlayerId))
        .orderBy(desc(moves.createdAt), desc(moves.id))
        .limit(1);
      return rows[0]?.from ?? null;
    },

    async clearSeason(seasonId) {
      // Decisions and instances first: they point at journal rows (`cause_journal_id`).
      await tx.delete(ieeDecisions).where(eq(ieeDecisions.seasonId, seasonId));
      const instances = await tx
        .delete(ieeInstances)
        .where(eq(ieeInstances.seasonId, seasonId))
        .returning({ id: ieeInstances.id });
      const journal = await tx
        .delete(ieeJournal)
        .where(eq(ieeJournal.seasonId, seasonId))
        .returning({ id: ieeJournal.id });
      return { instances: instances.length, journal: journal.length };
    },

    async compileFailuresJournaled(seasonId) {
      const rows = await tx
        .select({ revisionId: ieeJournal.revisionId })
        .from(ieeJournal)
        .where(and(eq(ieeJournal.seasonId, seasonId), eq(ieeJournal.op, "compile_failed")));
      return new Set(rows.map((r) => r.revisionId).filter((r): r is string => r !== null));
    },

    async insertDecision(row) {
      const [inserted] = await tx.insert(ieeDecisions).values(row).returning();
      return inserted!;
    },

    async getDecision(id) {
      const rows = await tx.select().from(ieeDecisions).where(eq(ieeDecisions.id, id)).limit(1);
      return rows[0] ?? null;
    },

    async pendingDecisions(playerId) {
      return tx
        .select()
        .from(ieeDecisions)
        .where(and(eq(ieeDecisions.playerId, playerId), eq(ieeDecisions.status, "pending")))
        .orderBy(asc(ieeDecisions.createdAt), asc(ieeDecisions.id));
    },

    async reaskDecision(id, update) {
      const [row] = await tx
        .update(ieeDecisions)
        .set(update)
        .where(and(eq(ieeDecisions.id, id), eq(ieeDecisions.status, "pending")))
        .returning();
      return row ?? null;
    },

    async settleDecision(id, settlement) {
      const [row] = await tx
        .update(ieeDecisions)
        .set({
          status: settlement.status,
          choice: settlement.choice,
          resolvedByUserId: settlement.resolvedByUserId,
          resolvedAt: new Date(),
        })
        .where(and(eq(ieeDecisions.id, id), eq(ieeDecisions.status, "pending")))
        .returning();
      return row ?? null;
    },
  };
}
