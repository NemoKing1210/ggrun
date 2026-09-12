/**
 * Handing a player an item or a status.
 *
 * Three things can do that — a wheel drop from a bonus/penalty cell, an item
 * being used, and a challenge reward — and for a long while each carried its
 * own copy of the arithmetic. Only the wheel read the season's tuning, so a
 * host who set heavy boots to "-4 cells for 3 rolls" got exactly that from a
 * penalty cell and the catalog's "-2 for 1" from lead weights and from a
 * challenge. The wizard screen described one third of the game.
 *
 * The other two copies also forgot the stacking policy: a `unique` status
 * granted by an item was inserted a second time and both rows fired, and a
 * `refresh` status granted by a challenge reward stacked instead of refreshing.
 *
 * So the rule lives here once, and the callers differ in exactly one honest
 * way — `anchorRollSeq`, the clock each of them counts from.
 */
import { db } from "@/lib/infrastructure/db";
import type { PlayerEffectRow, PlayerInventoryRow } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";
import {
  catalogDefaults,
  getEffect,
  getItem,
  resolveEffectGrant,
  resolveParams,
  type EffectDef,
  type IeeConfig,
  type IeeParams,
} from "@/lib/engine";
import {
  getActiveEffectRows,
  grantItem,
  insertEffect,
  refreshEffect,
} from "@/lib/modules/iee/repository";

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * What became of a grant.
 *
 * `blocked_unique` is a real outcome, not a failure: `ITEMS_EFFECTS_EVENTS.md`
 * §5.3 says a `unique` status that is already active rejects the new grant.
 * The wheel never reaches it — the picker gates duplicates out before a slice
 * is drawn — but an item aimed at someone who already carries the status does,
 * and the caller decides what that means for the item's charge.
 */
export type EffectGrantState = "granted" | "refreshed" | "blocked_unique";

export interface EffectGrantResult {
  state: EffectGrantState;
  row: PlayerEffectRow | null;
  def: EffectDef;
}

export interface GrantEffectInput {
  seasonId: string;
  seasonPlayerId: string;
  effectKey: string;
  /** The season's tuning. Strength and duration come from here. */
  config: IeeConfig;
  /**
   * The player's roll counter as it will stand once this grant has landed.
   *
   * A wheel drop passes the roll being resolved, because the same transaction
   * sets `season_players.roll_seq` to it; an item used between turns passes the
   * recipient's current counter, which is the roll that already finished. Both
   * mean the same thing — "the last roll that counts as done" — and a status
   * lasting N rolls then covers the next N. Naming the field forces each caller
   * to state its clock, which is the whole subject of session 22.
   */
  anchorRollSeq: number;
  /** Season-wide resolved-roll counter, the clock cooldowns are measured on. */
  seasonRollSeq: number;
  source: string;
  sourceMoveId?: string | null;
  appliedBySeasonPlayerId?: string | null;
  /**
   * Params supplied explicitly by the caller's intent. Absent for every entry
   * in the catalog today, and when absent the season's tuning is used — which
   * is the point of this module.
   */
  params?: IeeParams;
}

/** True when the player already carries this status. */
export async function hasActiveEffect(
  seasonPlayerId: string,
  effectKey: string,
  tx: Tx = db,
): Promise<boolean> {
  const rows = await getActiveEffectRows(seasonPlayerId, tx);
  return rows.some((r) => r.effectKey === effectKey);
}

export async function grantEffect(
  tx: Tx,
  input: GrantEffectInput,
): Promise<EffectGrantResult | null> {
  const def = getEffect(input.effectKey);
  if (!def) {
    // A key with no definition means the catalog and a season pool have drifted.
    // Never fail a turn over it — the caller falls back.
    log.error("iee.grant.unknown_effect", { key: input.effectKey });
    return null;
  }

  const { params, expiresAfterRollSeq, chargesLeft } = resolveEffectGrant(
    def,
    input.config,
    input.anchorRollSeq,
  );
  const next = { chargesLeft, expiresAfterRollSeq };

  if (def.stacking !== "stack") {
    if (def.stacking === "unique" && (await hasActiveEffect(input.seasonPlayerId, def.key, tx))) {
      return { state: "blocked_unique", row: null, def };
    }
    if (def.stacking === "refresh") {
      // Never shortens: `refreshEffect` takes the later expiry and the larger
      // charge count. It used to overwrite whatever was there, so a hostile
      // item carrying the catalog's short duration could *cure* a longer status
      // the season had tuned — attacking a slowed rival made them faster.
      const refreshed = await refreshEffect(input.seasonPlayerId, def.key, next, tx);
      if (refreshed) return { state: "refreshed", row: refreshed, def };
    }
  }

  const row = await insertEffect(
    {
      seasonId: input.seasonId,
      seasonPlayerId: input.seasonPlayerId,
      effectKey: def.key,
      params: input.params ?? params,
      polarity: def.polarity,
      chargesLeft,
      expiresAfterRollSeq,
      appliedBySeasonPlayerId: input.appliedBySeasonPlayerId ?? null,
      source: input.source,
      sourceMoveId: input.sourceMoveId ?? null,
      seasonRollSeq: input.seasonRollSeq,
    },
    tx,
  );
  return { state: "granted", row, def };
}

export interface GrantItemInput {
  seasonId: string;
  seasonPlayerId: string;
  itemKey: string;
  config: IeeConfig;
  seasonRollSeq: number;
  source: string;
  sourceMoveId?: string | null;
  params?: IeeParams;
}

export async function grantInventoryItem(
  tx: Tx,
  input: GrantItemInput,
): Promise<PlayerInventoryRow | null> {
  const def = getItem(input.itemKey);
  if (!def) {
    log.error("iee.grant.unknown_item", { key: input.itemKey });
    return null;
  }
  const entry = input.config.entries[def.key];
  return grantItem(
    {
      seasonId: input.seasonId,
      seasonPlayerId: input.seasonPlayerId,
      itemKey: def.key,
      params: input.params ?? resolveParams(def.key, catalogDefaults(), entry),
      // `durationOverride` doubles as an item's charge count — one control with
      // two meanings, flagged in IEE_AUDIT.md §B3. Kept as it was rather than
      // changed quietly: splitting the field is a config decision, not a fix.
      charges: Math.max(1, entry?.durationOverride ?? def.usage.charges),
      source: input.source,
      sourceMoveId: input.sourceMoveId ?? null,
      seasonRollSeq: input.seasonRollSeq,
    },
    tx,
  );
}
