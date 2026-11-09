/**
 * An in-memory `IeeStore` with the same guards as the SQL one (an ended
 * instance cannot be ended again, a spent item cannot be spent).
 *
 * The executor's tests run against it, and so do the simulations — entry
 * scenarios and the sandbox (spec §5.5, §10.5): a season that lives for one
 * request and is never written anywhere.
 */
import type { IeeDecisionRow, IeeInstanceRow } from "@/db/schema";

import type { IeeStore, NewJournalRow, PlayerPlace } from "../executor/store";

export type JournalRow = NewJournalRow & { id: number };

export type MemoryStore = ReturnType<typeof memoryStore>;

/**
 * Where participants stand, for out-of-turn moves. A memory season passes its
 * own rows; tests may pass bare positions instead.
 */
export interface MemoryPlaces {
  list(): PlayerPlace[];
  set(seasonPlayerId: string, position: number, finished: boolean): void;
  lastMoveStart(seasonPlayerId: string): number | null;
}

/** Places over plain maps — what a test sets up. */
function placesOf(positions: Record<string, number>, lastMoves: Record<string, number>): MemoryPlaces {
  const rows = new Map<string, PlayerPlace>(
    Object.entries(positions).map(([id, position]) => [id, { id, position, status: "active" }]),
  );
  return {
    list: () => [...rows.values()].map((r) => ({ ...r })),
    set: (id, position, finished) => {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, position, status: finished ? "finished" : row.status });
    },
    lastMoveStart: (id) => lastMoves[id] ?? null,
  };
}

export function memoryStore(
  init: {
    balances?: Record<string, number>;
    /** A memory season's own rows; or `positions` (and `lastMoves`) for a test. */
    places?: MemoryPlaces;
    positions?: Record<string, number>;
    lastMoves?: Record<string, number>;
    /** Usernames for the feed; a participant's id otherwise. */
    names?: Record<string, string>;
  } = {},
) {
  const journal: JournalRow[] = [];
  const instances: IeeInstanceRow[] = [];
  const decisions: IeeDecisionRow[] = [];
  const ledger: { seasonPlayerId: string; delta: number; reason: string }[] = [];
  const balances = new Map<string, number>(Object.entries(init.balances ?? {}));
  const places = init.places ?? placesOf(init.positions ?? {}, init.lastMoves ?? {});
  let clock = 1_000;

  const active = (id: string) => instances.find((i) => i.id === id && i.status === "active") ?? null;

  const store: IeeStore = {
    async journal(row) {
      const id = journal.length + 1;
      journal.push({ ...row, id });
      return id;
    },
    async insertInstance(row) {
      const full: IeeInstanceRow = {
        ...row,
        aimedPlayerId: row.aimedPlayerId ?? null,
        chosen: row.chosen ?? null,
        holderCellIndex: row.holderCellIndex ?? null,
        holderRollId: row.holderRollId ?? null,
        countFromRollSeq: null,
        status: "active",
        endReason: null,
        grantedAt: new Date(clock++),
        endedAt: null,
      };
      instances.push(full);
      return { ...full };
    },
    async activeForHolder(holder) {
      return instances
        .filter((i) => i.holderPlayerId === holder && i.status === "active")
        .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())
        .map((i) => ({ ...i }));
    },
    async activeForRoll(rollId) {
      return instances
        .filter((i) => i.holderRollId === rollId && i.status === "active")
        .sort((a, b) => a.grantedAt.getTime() - b.grantedAt.getTime())
        .map((i) => ({ ...i }));
    },
    async handedOut(seasonId, entryId) {
      return instances.some((i) => i.seasonId === seasonId && i.entryId === entryId && i.kind === "item");
    },
    async activeObjects(seasonId) {
      return instances
        .filter((i) => i.seasonId === seasonId && i.holderKind === "cell" && i.status === "active")
        .sort((a, b) => a.grantedAt.getTime() - b.grantedAt.getTime())
        .map((i) => ({ ...i }));
    },
    async getInstance(id) {
      const found = instances.find((i) => i.id === id);
      return found ? { ...found } : null;
    },
    async setRemaining(id, remaining) {
      const i = active(id);
      if (!i) return null;
      i.remaining = remaining;
      return { ...i };
    },
    async renew(id, counter) {
      const i = active(id);
      if (!i) return null;
      i.remaining = counter.remaining;
      i.countFromRollSeq = counter.countFromRollSeq;
      return { ...i };
    },
    async aim(id, aimedPlayerId) {
      const i = active(id);
      if (i) i.aimedPlayerId = aimedPlayerId;
    },
    async choose(id, chosen) {
      const i = active(id);
      if (i) i.chosen = chosen;
    },
    async spendCharge(id) {
      const i = active(id);
      if (!i || (i.chargesLeft ?? 0) <= 0) return null;
      i.chargesLeft = (i.chargesLeft ?? 0) - 1;
      return { ...i };
    },
    async end(id, reason) {
      const i = active(id);
      if (!i) return null;
      i.status = "ended";
      i.endReason = reason;
      i.endedAt = new Date(clock++);
      return { ...i };
    },
    async rehome(id, holderPlayerId, anchorRollSeq) {
      const i = active(id);
      if (!i || i.holderKind !== "player") return null;
      i.holderPlayerId = holderPlayerId;
      i.anchorRollSeq = anchorRollSeq;
      i.countFromRollSeq = null;
      return { ...i };
    },
    async nameOf(seasonPlayerId) {
      // A memory season's participants have no accounts: their ids stand in.
      return init.names?.[seasonPlayerId] ?? seasonPlayerId;
    },
    async balanceOf(seasonPlayerId) {
      return balances.get(seasonPlayerId) ?? null;
    },
    async writeBalance(entry) {
      ledger.push({ seasonPlayerId: entry.seasonPlayerId, delta: entry.delta, reason: entry.reason });
      balances.set(entry.seasonPlayerId, entry.balance);
    },
    async clearSeason(seasonId) {
      decisions.splice(0, decisions.length, ...decisions.filter((d) => d.seasonId !== seasonId));
      const keptInstances = instances.filter((i) => i.seasonId !== seasonId);
      const keptJournal = journal.filter((j) => j.seasonId !== seasonId);
      const counts = { instances: instances.length - keptInstances.length, journal: journal.length - keptJournal.length };
      instances.splice(0, instances.length, ...keptInstances);
      journal.splice(0, journal.length, ...keptJournal);
      return counts;
    },
    async places() {
      return places.list();
    },
    async setPosition(seasonPlayerId, position, finished) {
      places.set(seasonPlayerId, position, finished);
    },
    async lastMoveStart(seasonPlayerId) {
      return places.lastMoveStart(seasonPlayerId);
    },
    async compileFailuresJournaled(seasonId) {
      return new Set(
        journal
          .filter((j) => j.seasonId === seasonId && j.op === "compile_failed" && j.revisionId)
          .map((j) => j.revisionId as string),
      );
    },
    async insertDecision(row) {
      // The partial unique index: one pending decision of a kind per player.
      if (decisions.some((d) => d.playerId === row.playerId && d.kind === row.kind && d.status === "pending")) {
        throw new Error(`a ${row.kind} is already pending for ${row.playerId}`);
      }
      const full: IeeDecisionRow = {
        ...row,
        status: "pending",
        choice: null,
        resolvedByUserId: null,
        createdAt: new Date(clock++),
        resolvedAt: null,
      };
      decisions.push(full);
      return { ...full };
    },
    async getDecision(id) {
      const found = decisions.find((d) => d.id === id);
      return found ? { ...found } : null;
    },
    async pendingDecisions(playerId) {
      return decisions.filter((d) => d.playerId === playerId && d.status === "pending").map((d) => ({ ...d }));
    },
    async reaskDecision(id, update) {
      const d = decisions.find((x) => x.id === id && x.status === "pending");
      if (!d) return null;
      Object.assign(d, update);
      return { ...d };
    },
    async settleDecision(id, settlement) {
      const d = decisions.find((x) => x.id === id && x.status === "pending");
      if (!d) return null;
      d.status = settlement.status;
      d.choice = settlement.choice;
      d.resolvedByUserId = settlement.resolvedByUserId;
      d.resolvedAt = new Date(clock++);
      return { ...d };
    },
  };

  return { store, journal, instances, decisions, ledger, balances };
}
