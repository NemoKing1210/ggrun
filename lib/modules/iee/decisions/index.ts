/**
 * Decisions (docs/IEE_CONSTRUCTOR_SPEC.md §7.4, §7.6) — the questions a
 * player's entries put to them: what to give up, what to keep.
 *
 * The executor opens and settles them inside the caller's transaction and
 * notes what changed (`ExecContext.decisions`); the game's use-cases answer
 * them (`lib/modules/game/service/decisions.ts`). This module reads them —
 * the dashboard, the judges' tab, the bots — and, once a transaction has
 * committed, announces what changed: the player's page refreshes, and a new
 * question sends them a notification. Reads only: the executor is the one
 * writer of `iee_decisions` (an architecture test holds it).
 */
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { ieeDecisions, seasonPlayers, seasons, users, type IeeDecisionRow } from "@/db/schema";
import type { IeeLocaleText } from "@/lib/engine";
import type { DecisionChoice, DecisionOption } from "@/lib/engine/iee/resolve/decisions";
import { log } from "@/lib/infrastructure/logger";
import { publish } from "@/lib/realtime/bus";
import { userRoom } from "@/lib/realtime/protocol";
import { notifyUser } from "@/lib/modules/notifications/service";

import type { DecisionNote, VictimContext } from "../executor";
import type { ReactionContext } from "../turn/reaction";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One decision by id, whatever its state. */
export async function getDecisionRow(id: string, tx: Db = db): Promise<IeeDecisionRow | null> {
  const rows = await tx.select().from(ieeDecisions).where(eq(ieeDecisions.id, id)).limit(1);
  return rows[0] ?? null;
}

/** A participant's pending decisions, oldest first. */
export async function listPendingDecisions(seasonPlayerId: string, tx: Db = db): Promise<IeeDecisionRow[]> {
  return tx
    .select()
    .from(ieeDecisions)
    .where(and(eq(ieeDecisions.playerId, seasonPlayerId), eq(ieeDecisions.status, "pending")))
    .orderBy(asc(ieeDecisions.createdAt), asc(ieeDecisions.id));
}

/** Whether a participant has a decision waiting — of a kind, or any. */
export async function hasPendingDecision(seasonPlayerId: string, kind?: IeeDecisionRow["kind"], tx: Db = db): Promise<boolean> {
  const rows = await listPendingDecisions(seasonPlayerId, tx);
  return rows.some((row) => kind === undefined || row.kind === kind);
}

/** A pending decision as the dashboard and the judges' tab show it. */
export interface DecisionView {
  id: string;
  kind: IeeDecisionRow["kind"];
  seasonPlayerId: string;
  /** The entry that asked — its key and its names as they were. */
  key: string;
  name: IeeLocaleText;
  /** The instance that asked: the dashboard shows its rule text. */
  revisionId: string | null;
  /** What the picks are: the items that go, or those that stay while the rest burn. */
  then: "discard" | "retain";
  count: number;
  /** The player may give nothing instead and keep what asked. */
  orKeep: boolean;
  options: DecisionOption[];
  /** The default as it stood when asked. */
  defaultChoice: DecisionChoice;
  createdAt: string;
}

/** A pending victim choice for the screen; null for a row that is not one. */
export function decisionView(row: IeeDecisionRow): DecisionView | null {
  if (row.kind !== "victim_choice") return null;
  const context = row.context as Partial<VictimContext>;
  const key = context.key ?? "";
  return {
    id: row.id,
    kind: row.kind,
    seasonPlayerId: row.playerId,
    key,
    name: (context.names as IeeLocaleText | undefined) ?? { ru: key, en: key, uk: key },
    revisionId: row.revisionId,
    then: context.then ?? "discard",
    count: context.count ?? 1,
    orKeep: context.orKeep === true,
    options: (row.options as DecisionOption[]) ?? [],
    defaultChoice: (row.defaultChoice as DecisionChoice) ?? { option: "discard" },
    createdAt: row.createdAt.toISOString(),
  };
}

/** A turn paused for the player's reaction (§7.4), as the dashboard and the judges' tab show it. */
export interface ReactionWindowView {
  id: string;
  seasonPlayerId: string;
  outcome: "passed" | "dropped";
  faces: number[];
  /** The dice result after the result modifiers. */
  result: number;
  /** Where the player stands, and where the move would end before its cell acts. */
  from: number;
  to: number;
  /** The reaction items the throw offered. */
  offers: { instanceId: string; key: string }[];
  createdAt: string;
}

/** A pending reaction window for the screen; null for a row that is not one. */
export function reactionWindowView(row: IeeDecisionRow): ReactionWindowView | null {
  if (row.kind !== "reaction_window") return null;
  const context = row.context as Partial<ReactionContext>;
  const view = context.view;
  return {
    id: row.id,
    seasonPlayerId: row.playerId,
    outcome: context.outcome === "dropped" ? "dropped" : "passed",
    faces: view?.faces ?? [],
    result: view?.result ?? 0,
    from: view?.from ?? 0,
    to: view?.to ?? view?.from ?? 0,
    offers: (context.offers ?? []).map((o) => ({ instanceId: o.instanceId, key: o.key })),
    createdAt: row.createdAt.toISOString(),
  };
}

/** A pending decision for the judges' tab: who waits, in which season. */
export interface StaffDecisionRow {
  view: DecisionView;
  seasonId: string;
  seasonTitle: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
}

/** A pending reaction window for the judges' tab: whose turn waits, in which season. */
export type StaffReactionRow = Omit<StaffDecisionRow, "view"> & { view: ReactionWindowView };

/** The pending decisions of running seasons with who waits — what the judges' tab lists, oldest first. */
async function pendingInRunningSeasons() {
  return db
    .select({
      decision: ieeDecisions,
      seasonTitle: seasons.title,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      lastSeenAt: users.lastSeenAt,
    })
    .from(ieeDecisions)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, ieeDecisions.playerId))
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .innerJoin(seasons, eq(seasons.id, ieeDecisions.seasonId))
    .where(and(eq(ieeDecisions.status, "pending"), eq(seasons.status, "active")))
    .orderBy(asc(ieeDecisions.createdAt), asc(ieeDecisions.id));
}

type PendingRow = Awaited<ReturnType<typeof pendingInRunningSeasons>>[number];

const whoWaits = (row: PendingRow) => ({
  seasonId: row.decision.seasonId,
  seasonTitle: row.seasonTitle,
  userId: row.userId,
  username: row.username,
  displayName: row.displayName,
  avatarUrl: row.avatarUrl,
  lastSeenAt: row.lastSeenAt,
});

/** Every pending victim choice in running seasons, oldest first — what a judge may answer for a player. */
export async function listPendingDecisionsForStaff(): Promise<StaffDecisionRow[]> {
  return (await pendingInRunningSeasons()).flatMap((row) => {
    const view = decisionView(row.decision);
    return view ? [{ view, ...whoWaits(row) }] : [];
  });
}

/** Every reaction window open in running seasons, oldest first — what a judge may accept for a player (§7.4). */
export async function listPendingReactionsForStaff(): Promise<StaffReactionRow[]> {
  return (await pendingInRunningSeasons()).flatMap((row) => {
    const view = reactionWindowView(row.decision);
    return view ? [{ view, ...whoWaits(row) }] : [];
  });
}

/** How many decisions wait in running seasons — victim choices and reaction windows: the judges' tab counter. */
export async function countPendingDecisions(): Promise<number> {
  return (await pendingInRunningSeasons()).filter((row) => row.decision.kind === "victim_choice" || row.decision.kind === "reaction_window").length;
}

/**
 * Tells the players whose decisions changed (§7.6), once the transaction that
 * changed them has committed: a `decisions:update` into each one's private
 * room — their dashboard refreshes — and, for a new question, a notification.
 * Best-effort, like `logEvent`'s mirror: an announcement never fails the write.
 */
export async function announceDecisions(notes: readonly DecisionNote[]): Promise<void> {
  if (notes.length === 0) return;
  try {
    const players = [...new Set(notes.map((n) => n.playerId))];
    const people = await db
      .select({ id: seasonPlayers.id, userId: seasonPlayers.playerId, seasonId: seasonPlayers.seasonId, slug: seasons.slug, title: seasons.title })
      .from(seasonPlayers)
      .innerJoin(seasons, eq(seasons.id, seasonPlayers.seasonId))
      .where(inArray(seasonPlayers.id, players));
    const byPlayer = new Map(people.map((p) => [p.id, p]));
    for (const note of notes) {
      const who = byPlayer.get(note.playerId);
      if (!who) continue;
      publish(userRoom(who.userId), "decisions:update", {
        decisionId: note.decisionId,
        seasonId: who.seasonId,
        seasonPlayerId: note.playerId,
        kind: note.kind,
        status: note.status,
      });
      if (note.status === "pending" && note.kind === "victim_choice") {
        await notifyUser(who.userId, "decision_opened", {
          seasonId: who.seasonId,
          seasonSlug: who.slug,
          seasonTitle: who.title,
          seasonPlayerId: note.playerId,
          requestId: note.decisionId,
        });
      }
    }
  } catch (error) {
    log.warn("iee.decisions.announce.failed", { err: error instanceof Error ? error : undefined });
  }
}
