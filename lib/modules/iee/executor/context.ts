/**
 * Building an executor context for a service call: the season's registry and
 * clock, and the lookups rules need — a participant's snapshot, the roll a
 * grant to them counts from, and the board an out-of-turn move lands on.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { seasons } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema, type IeeConfig, type IeePlayerSnapshot } from "@/lib/engine";
import { grantAnchor } from "@/lib/engine/iee/resolve/live";
import { getBoardCells, getMainBoard } from "@/lib/modules/season/repository/seasons";

import { getSeasonPlayerRow, getSeasonRollSeq, hasOpenRoll, toPlayerSnapshot } from "../repository/counters";
import { getSeasonRegistry, type SeasonRegistry } from "../registry";
import type { BoardInfo, DecisionNote, ExecContext } from "./index";
import { pgStore, type Tx } from "./store";

/**
 * The season's board as an out-of-turn move reads it: its cells when it has
 * them (the board that is played), its settings otherwise.
 */
export async function loadBoardInfo(seasonId: string): Promise<BoardInfo> {
  const rows = await db.select({ config: seasons.config }).from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  const parsed = SeasonConfigSchema.safeParse(rows[0]?.config ?? {});
  const settings = parsed.success ? parsed.data.board : DEFAULT_SEASON_CONFIG.board;
  const main = await getMainBoard(seasonId);
  const cells = main ? await getBoardCells(main.id) : [];
  const size = cells.length > 0 ? Math.max(...cells.map((c) => c.position)) + 1 : settings.size;
  return { size, loop: settings.loop, finishAt: cells.find((c) => c.cellType === "finish")?.position ?? null };
}

export interface ContextInput {
  tx: Tx;
  seasonId: string;
  config: IeeConfig;
  actorPlayerId?: string | null;
  actorUserId?: string | null;
  /** Server randomness; `Math.random` unless a test injects one. */
  rng?: () => number;
  /** Pass when already known (the turn computes it); read otherwise. */
  seasonRollSeq?: number;
  registry?: SeasonRegistry;
  /** Pass when already known (the turn has the cells); read on first use otherwise. */
  board?: BoardInfo;
  /** Collects the decisions opened or settled here, for the caller to announce once it commits (§7.6). */
  decisions?: DecisionNote[];
}

export async function executionContext(input: ContextInput): Promise<ExecContext> {
  const registry = input.registry ?? (await getSeasonRegistry(input.seasonId));
  const seasonRollSeq = input.seasonRollSeq ?? (await getSeasonRollSeq(input.seasonId));
  // Read once, and only when a move needs it.
  let board: Promise<BoardInfo> | null = input.board ? Promise.resolve(input.board) : null;
  return {
    store: pgStore(input.tx),
    seasonId: input.seasonId,
    registry,
    config: input.config,
    seasonRollSeq,
    actorPlayerId: input.actorPlayerId ?? null,
    actorUserId: input.actorUserId ?? null,
    rng: input.rng ?? Math.random,
    async snapshot(seasonPlayerId): Promise<IeePlayerSnapshot> {
      const row = await getSeasonPlayerRow(seasonPlayerId, input.tx);
      if (!row) {
        // A participant deleted mid-transaction: rules see an inert stand-in
        // rather than failing the turn that asked.
        return { seasonPlayerId, position: 0, balancePoints: 0, rollSeq: 0, moveCount: 0, rank: 1, status: "withdrawn" };
      }
      return toPlayerSnapshot(row);
    },
    async anchorFor(seasonPlayerId) {
      const row = await getSeasonPlayerRow(seasonPlayerId, input.tx);
      const holderRollSeq = row?.rollSeq ?? 0;
      return { anchorRollSeq: grantAnchor(holderRollSeq, await hasOpenRoll(seasonPlayerId, input.tx)) };
    },
    board: () => (board ??= loadBoardInfo(input.seasonId)),
    ...(input.decisions ? { decisions: input.decisions } : {}),
  };
}
