/**
 * Activating an item from the inventory.
 *
 * Named "activate" rather than "use" on purpose: a server function whose name
 * begins with `use` trips React's rules-of-hooks lint.
 *
 * Two things matter here above all else:
 *  - the charge is spent by a guarded UPDATE, so a double-submitted form spends
 *    exactly one (§15.6 step 4);
 *  - `target` is enforced on the server, never merely hidden in the UI.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { ledgerEntries, seasonPlayers, users, type SeasonPlayer } from "@/db/schema";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import {
  cleanseEffects,
  consumeItemCharge,
  getInventoryItem,
  getMoveCount,
  getSeasonRollSeq,
} from "@/lib/modules/iee/repository";
import {
  checkItemUse,
  getEffect,
  getItem,
  grantAnchor,
  type IeePlayerSnapshot,
  type ItemUseResult,
} from "@/lib/engine";

import { GameLoopError } from "./errors";
import { grantEffect, grantInventoryItem, hasActiveEffect } from "./grant";
import { getOpenRollRow, parseSeasonConfig } from "./helpers";

/** Read-only projection the catalog's pure `apply` receives. */
async function snapshot(sp: SeasonPlayer): Promise<IeePlayerSnapshot> {
  return {
    seasonPlayerId: sp.id,
    position: sp.position,
    balancePoints: sp.balancePoints,
    rollSeq: sp.rollSeq,
    moveCount: await getMoveCount(sp.id),
    rank: 1,
    status: sp.status,
  };
}

async function getSeasonPlayer(id: string): Promise<SeasonPlayer | null> {
  const rows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function activateInventoryItem(params: {
  inventoryId: string;
  targetSeasonPlayerId?: string | null;
}): Promise<{ itemKey: string; targetUsername: string | null }> {
  const actor = await getCurrentUser();
  if (!actor) throw new GameLoopError("gameLoginRequired");

  const row = await getInventoryItem(params.inventoryId);
  if (!row) throw new GameLoopError("ieeItemNotFound");
  if (row.state !== "held" || row.chargesLeft <= 0) {
    throw new GameLoopError("ieeItemAlreadyUsed");
  }

  const sp = await getSeasonPlayer(row.seasonPlayerId);
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  // Only the holder uses their own item — staff included. A judge who needs to
  // intervene revokes or grants, which is audited; they do not play for people.
  if (sp.playerId !== actor.id) throw new GameLoopError("gameNotAllowed");

  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  if (season.status !== "active") throw new GameLoopError("gameSeasonNotActive");
  const config = parseSeasonConfig(season.config);

  const def = getItem(row.itemKey);
  if (!def) throw new GameLoopError("ieeItemNotFound");

  // Resolve the candidate the form named; the rules themselves are pure.
  const wanted = params.targetSeasonPlayerId?.trim() || null;
  const candidate = wanted ? await getSeasonPlayer(wanted) : null;
  const actorSnapshot = await snapshot(sp);
  const candidateSnapshot = candidate ? await snapshot(candidate) : null;

  const verdict = checkItemUse({
    usage: def.usage,
    hasOpenRoll: Boolean(await getOpenRollRow(sp.id)),
    actor: actorSnapshot,
    target: candidateSnapshot,
    targetInSameSeason: candidate ? candidate.seasonId === sp.seasonId : true,
    allowTargetingOthers: config.iee.allowTargetingOthers,
    pvpProtectionMoves: config.iee.pvpProtectionMoves,
  });
  if (!verdict.ok) throw new GameLoopError(verdict.code);

  const target: SeasonPlayer | null =
    verdict.target === "self" ? sp : verdict.target === "other" ? candidate : null;

  // --- the catalog decides what happens; it never writes --------------------
  const result: ItemUseResult = def.apply({
    itemKey: def.key,
    params: (row.params ?? {}) as Record<string, string | number | boolean>,
    actor: actorSnapshot,
    target:
      target === null
        ? null
        : target.id === sp.id
          ? actorSnapshot
          : (candidateSnapshot ?? (await snapshot(target))),
  });
  if (result.rejected) throw new GameLoopError(result.rejected);

  const targetUsername = target
    ? ((
        await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, target.playerId))
          .limit(1)
      )[0]?.username ?? null)
    : null;

  // A `unique` status that is already on the target rejects the new grant
  // (ITEMS_EFFECTS_EVENTS.md §5.3). The wheel honours that by never drawing the
  // slice; here it has to be checked, and it has to be checked *before* the
  // charge is spent — the old code inserted a second row instead, so two
  // `unlucky` statuses stacked and shrank the dice twice. Refusing the use
  // costs the attacker nothing but a click; spending a charge on nothing would
  // be a worse answer than either.
  for (const grant of result.grantEffects ?? []) {
    const effectDef = getEffect(grant.effectKey);
    if (!effectDef || effectDef.stacking !== "unique") continue;
    if (await hasActiveEffect(grant.to, effectDef.key)) {
      throw new GameLoopError("ieeTargetAlreadyAffected");
    }
  }

  // A status never touches a move that is already in flight — see `grantAnchor`,
  // which owns the rule and is tested without a database.
  const anchors = new Map<string, number>();
  for (const grant of result.grantEffects ?? []) {
    if (anchors.has(grant.to)) continue;
    const recipient = grant.to === sp.id ? sp : target;
    anchors.set(
      grant.to,
      grantAnchor(recipient?.rollSeq ?? 0, Boolean(await getOpenRollRow(grant.to))),
    );
  }

  const seasonRollSeq = await getSeasonRollSeq(sp.seasonId);

  await db.transaction(async (tx) => {
    // The guard is the WHERE clause: a second submit matches nothing.
    const spent = await consumeItemCharge(row.id, tx);
    if (!spent) throw new GameLoopError("ieeItemAlreadyUsed");

    for (const grant of result.grantEffects ?? []) {
      // The recipient's own counter, pushed one roll out when they have a game
      // in flight — see the note where `anchors` is built. Strength and
      // duration come from the season's tuning, which this path used to ignore
      // entirely.
      await grantEffect(tx, {
        seasonId: sp.seasonId,
        seasonPlayerId: grant.to,
        effectKey: grant.effectKey,
        config: config.iee,
        anchorRollSeq: anchors.get(grant.to) ?? 0,
        seasonRollSeq,
        source: "item",
        appliedBySeasonPlayerId: sp.id,
        ...(grant.params ? { params: grant.params } : {}),
      });
    }

    for (const grant of result.grantItems ?? []) {
      await grantInventoryItem(tx, {
        seasonId: sp.seasonId,
        seasonPlayerId: grant.to,
        itemKey: grant.itemKey,
        config: config.iee,
        seasonRollSeq,
        source: "item",
        ...(grant.params ? { params: grant.params } : {}),
      });
    }

    for (const entry of result.balance ?? []) {
      if (entry.delta === 0) continue;
      // Points always move through the ledger — never a second currency path.
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: entry.to,
        delta: entry.delta,
        reason: entry.reason,
      });
      const recipient = await getSeasonPlayer(entry.to);
      if (recipient) {
        await tx
          .update(seasonPlayers)
          .set({ balancePoints: Math.max(0, recipient.balancePoints + entry.delta) })
          .where(eq(seasonPlayers.id, entry.to));
      }
    }

    for (const entry of result.cleanse ?? []) {
      await cleanseEffects(
        entry.from,
        {
          ...(entry.effectKeys === "all" ? {} : { effectKeys: entry.effectKeys }),
          ...(entry.polarity ? { polarity: entry.polarity } : {}),
        },
        tx,
      );
    }
  });

  // Always public: this is both the requested log and the deterrent (§8.3).
  await logEvent({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "item_used",
    payload: {
      ...(result.feedPayload ?? {}),
      itemKey: def.key,
      targetSeasonPlayerId: target?.id ?? null,
      targetUsername,
    },
  });
  log.info("iee.item.used", {
    actorId: actor.id,
    itemKey: def.key,
    targetSeasonPlayerId: target?.id ?? null,
  });

  return { itemKey: def.key, targetUsername };
}
