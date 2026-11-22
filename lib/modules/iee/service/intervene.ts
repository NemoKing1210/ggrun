/**
 * Staff intervention on items and statuses.
 *
 * `revokeItem` and `cleanseEffects` were written, tested and called by nothing.
 * Their own comments promised an audit entry "by the caller" and there was no
 * caller — so on event day a judge could adjust a position, a balance or a
 * status, and had no way at all to take back an item that dropped by mistake or
 * lift a status that should never have landed. Every other staff mutation in
 * this project requires a reason and writes an audit row; these now do too.
 *
 * Removal only. Granting is a separate decision — handing out an item is a
 * different kind of act from correcting one, and it needs the season's pool and
 * its caps to mean something.
 */
import { db } from "@/lib/infrastructure/db";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction, logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine";
import type { IeeInstanceRow } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";

import { endInstance } from "../executor";
import { executionContext } from "../executor/context";
import { getSeasonRegistry } from "../registry";
import { getInstanceRow } from "../repository/instances";

// The same error type the rest of the admin surface throws, so the action
// layer's `makeToError(AdminError)` translates these without a special case.
import { AdminError } from "@/lib/modules/season/service/errors";

async function requireStaff() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new AdminError("adminStaffRequired");
  return user;
}

function requireReason(raw: string | undefined): string {
  const reason = raw?.trim() ?? "";
  if (reason.length < 5) throw new AdminError("formReasonRequired");
  return reason;
}

/**
 * Ends one instance as `revoked`, inside a transaction, through the executor —
 * the journal records which judge ended it and why. Null when it had already
 * ended: the guard is the UPDATE, so a double submit is a no-op.
 */
async function revoke(
  row: IeeInstanceRow,
  actorUserId: string,
  reason: string,
): Promise<IeeInstanceRow | null> {
  const season = await getSeasonById(row.seasonId);
  const parsed = SeasonConfigSchema.safeParse(season?.config);
  const config = (parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG).iee;
  return db.transaction(async (tx) => {
    const exec = await executionContext({ tx, seasonId: row.seasonId, config, actorUserId });
    return endInstance(exec, { instanceId: row.id, reason: "revoked", note: reason });
  });
}

/** Takes a held item back. The row is kept, ended as `revoked`, never deleted. */
export async function adminRevokeItem(input: {
  inventoryId: string;
  reason: string;
}): Promise<{ itemKey: string }> {
  const actor = await requireStaff();
  const reason = requireReason(input.reason);

  const row = await getInstanceRow(input.inventoryId);
  if (!row || row.kind !== "item") throw new AdminError("ieeItemNotFound");
  const taken = await revoke(row, actor.id, reason);
  if (!taken) throw new AdminError("ieeItemAlreadyUsed");
  const entry = (await getSeasonRegistry(row.seasonId)).get(row.revisionId);
  const itemKey = entry?.key ?? row.revisionId;

  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_item_revoked",
    targetType: "iee_instance",
    targetId: row.id,
    payload: { itemKey, seasonPlayerId: row.holderPlayerId, reason },
  });
  // Public, like every other item event: the feed is the record players read.
  await logEvent({
    seasonId: row.seasonId,
    seasonPlayerId: row.holderPlayerId,
    eventType: "item_revoked",
    payload: { itemKey, name: entry?.names ?? null, by: "admin" },
  });
  log.info("iee.item.revoked", { actorId: actor.id, instanceId: row.id });
  return { itemKey };
}

/** Lifts a status. Ends as `revoked`, so the history says who ended it and why. */
export async function adminRevokeEffect(input: {
  effectId: string;
  reason: string;
}): Promise<{ effectKey: string }> {
  const actor = await requireStaff();
  const reason = requireReason(input.reason);

  const row = await getInstanceRow(input.effectId);
  if (!row || row.kind !== "effect") throw new AdminError("ieeEffectNotFound");
  if (row.status !== "active") throw new AdminError("ieeEffectNotActive");
  const ended = await revoke(row, actor.id, reason);
  if (!ended) throw new AdminError("ieeEffectNotActive");
  const entry = (await getSeasonRegistry(row.seasonId)).get(row.revisionId);
  const effectKey = entry?.key ?? row.revisionId;

  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_effect_revoked",
    targetType: "iee_instance",
    targetId: row.id,
    payload: { effectKey, seasonPlayerId: row.holderPlayerId, reason },
  });
  await logEvent({
    seasonId: row.seasonId,
    seasonPlayerId: row.holderPlayerId,
    eventType: "effect_revoked",
    payload: { effectKey, name: entry?.names ?? null, by: "admin" },
  });
  log.info("iee.effect.revoked", { actorId: actor.id, instanceId: row.id });
  return { effectKey };
}
