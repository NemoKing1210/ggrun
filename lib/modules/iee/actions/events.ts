"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import {
  GameLoopError,
  resolveEventUseCase,
  submitEventProofUseCase,
} from "@/lib/modules/game";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";

const toError = makeToError(GameLoopError);

export async function submitEventProofAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  const playerEventId = String(formData.get("playerEventId") ?? "");
  try {
    await submitEventProofUseCase({
      playerEventId,
      proof: String(formData.get("proof") ?? ""),
    });
    revalidatePath("/dashboard");
    revalidatePath("/feed");
    return { ok: "submitted" };
  } catch (e) {
    return await toError(e, "iee.event.submit", {
      actorId: actor?.id ?? null,
      playerEventId,
    });
  }
}

async function judge(
  formData: FormData,
  outcome: "approved" | "rejected",
): Promise<ActionState> {
  const actor = await getCurrentUser();
  const playerEventId = String(formData.get("playerEventId") ?? "");
  try {
    await resolveEventUseCase({
      playerEventId,
      outcome,
      adminNote: String(formData.get("adminNote") ?? ""),
    });
    revalidatePath("/admin/moderation");
    revalidatePath("/dashboard");
    revalidatePath("/feed");
    log.info("iee.event.judge", { actorId: actor?.id ?? null, playerEventId, outcome });
    return { ok: outcome };
  } catch (e) {
    return await toError(e, "iee.event.judge", {
      actorId: actor?.id ?? null,
      playerEventId,
    });
  }
}

export async function approveEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return judge(formData, "approved");
}

export async function rejectEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return judge(formData, "rejected");
}

 // --- Bulk verdicts ------------------------------------------------------------
 //
 // Same contract as the moderation bulk bar: every pending submission goes
 // through the single-item use-case (reward + ledger stay transactional per
 // item), failures keep their rows, only a total failure rethrows.

 function parseIds(formData: FormData): string[] {
  return String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
 }

 async function runBulkEvents(
  outcome: "approved" | "rejected",
  ids: string[],
  adminNote: string | null,
 ): Promise<void> {
  const actor = await getCurrentUser();
  if (ids.length === 0) return;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await resolveEventUseCase({ playerEventId: id, outcome, adminNote });
    } catch (e) {
      failed.push(id);
      log.error("iee.event.bulk_judge", {
        actorId: actor?.id ?? null,
        playerEventId: id,
        outcome,
        err: e,
      });
    }
  }
  const ok = ids.length - failed.length;
  log.info("iee.event.bulk_judge", {
    actorId: actor?.id ?? null,
    outcome,
    ok,
    failed: failed.length,
  });
  revalidatePath("/admin/moderation");
  revalidatePath("/dashboard");
  revalidatePath("/feed");
  if (ok === 0) throw new Error(`Bulk ${outcome} failed for all ${ids.length} submissions`);
 }

 export async function approveAllEventsAction(formData: FormData): Promise<void> {
  await runBulkEvents("approved", parseIds(formData), null);
 }

 export async function rejectAllEventsAction(formData: FormData): Promise<void> {
  const ids = parseIds(formData);
  const sharedNote = String(formData.get("sharedNote") ?? "").trim();
  if (ids.length === 0) return;
  if (sharedNote.length < 5) throw new Error("Shared reason required (min 5 characters)");
  await runBulkEvents("rejected", ids, sharedNote);
 }
