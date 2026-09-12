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
