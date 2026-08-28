"use server";

import { revalidatePath } from "next/cache";

import { approveRerollRequest, rejectRerollRequest } from "@/lib/modules/game";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";

import { toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";

export async function approveRerollAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  try {
    await approveRerollRequest(requestId);
    log.info("reroll.approve", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "reroll.approve", {
      actorId: actor?.id ?? null,
      requestId,
    });
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  return { ok: "approved" };
}

export async function rejectRerollAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  const adminNote = formData.get("adminNote");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  if (typeof adminNote !== "string" || !adminNote.trim())
    return { error: "Reason required" };
  try {
    await rejectRerollRequest(requestId, adminNote);
    log.info("reroll.reject", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "reroll.reject", {
      actorId: actor?.id ?? null,
      requestId,
    });
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/dashboard");
  return { ok: "rejected" };
}

// --- Completion requests (passed/dropped) ---------------------------------

export async function approveCompletionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  try {
    const { approveCompletionRequest } = await import("@/lib/modules/game");
    await approveCompletionRequest(requestId);
    log.info("completion.approve", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "completion.approve", { actorId: actor?.id ?? null, requestId });
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/admin/completions");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  revalidatePath("/feed");
  return { ok: "approved" };
}

export async function rejectCompletionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  const adminNote = formData.get("adminNote");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  if (typeof adminNote !== "string" || !adminNote.trim()) return { error: "Reason required" };
  try {
    const { rejectCompletionRequest } = await import("@/lib/modules/game");
    await rejectCompletionRequest(requestId, adminNote);
    log.info("completion.reject", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "completion.reject", { actorId: actor?.id ?? null, requestId });
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/admin/completions");
  revalidatePath("/dashboard");
  return { ok: "rejected" };
}
