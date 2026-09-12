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
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction, logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import {
  getEffectRow,
  getInventoryItem,
  markEffectsEnded,
  revokeItem,
} from "@/lib/modules/iee/repository";

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

/** Takes a held item back. The row is kept, marked `revoked`, never deleted. */
export async function adminRevokeItem(input: {
  inventoryId: string;
  reason: string;
}): Promise<{ itemKey: string }> {
  const actor = await requireStaff();
  const reason = requireReason(input.reason);

  const row = await getInventoryItem(input.inventoryId);
  if (!row) throw new AdminError("ieeItemNotFound");
  // The guard is the UPDATE's own WHERE: a second submit matches nothing.
  const taken = await revokeItem(row.id);
  if (!taken) throw new AdminError("ieeItemAlreadyUsed");

  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_item_revoked",
    targetType: "player_inventory",
    targetId: row.id,
    payload: { itemKey: row.itemKey, seasonPlayerId: row.seasonPlayerId, reason },
  });
  // Public, like every other item event: the feed is the record players read.
  await logEvent({
    seasonId: row.seasonId,
    seasonPlayerId: row.seasonPlayerId,
    eventType: "item_revoked",
    payload: { itemKey: row.itemKey, by: "admin" },
  });
  log.info("iee.item.revoked", { actorId: actor.id, inventoryId: row.id });
  return { itemKey: row.itemKey };
}

/** Lifts a status. Ends as `revoked`, so the history says who ended it and why. */
export async function adminRevokeEffect(input: {
  effectId: string;
  reason: string;
}): Promise<{ effectKey: string }> {
  const actor = await requireStaff();
  const reason = requireReason(input.reason);

  const row = await getEffectRow(input.effectId);
  if (!row) throw new AdminError("ieeEffectNotFound");
  if (row.state !== "active") throw new AdminError("ieeEffectNotActive");
  // Guarded by `state = 'active'` in the WHERE, so a double submit is a no-op.
  await markEffectsEnded([row.id], "revoked");

  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_effect_revoked",
    targetType: "player_effects",
    targetId: row.id,
    payload: { effectKey: row.effectKey, seasonPlayerId: row.seasonPlayerId, reason },
  });
  await logEvent({
    seasonId: row.seasonId,
    seasonPlayerId: row.seasonPlayerId,
    eventType: "effect_revoked",
    payload: { effectKey: row.effectKey, by: "admin" },
  });
  log.info("iee.effect.revoked", { actorId: actor.id, effectId: row.id });
  return { effectKey: row.effectKey };
}
