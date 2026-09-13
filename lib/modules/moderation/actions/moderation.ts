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
  const userId = formData.get("userId");
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
  revalidatePath("/admin/moderation");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  if (typeof userId === "string") revalidatePath(`/admin/users/${userId}`);
  return { ok: "approved" };
}

export async function rejectRerollAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  const adminNote = formData.get("adminNote");
  const userId = formData.get("userId");
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
  revalidatePath("/admin/moderation");
  revalidatePath("/dashboard");
  if (typeof userId === "string") revalidatePath(`/admin/users/${userId}`);
  return { ok: "rejected" };
}

// --- Completion requests (passed/dropped) ---------------------------------

export async function approveCompletionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  const userId = formData.get("userId");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  try {
    const { approveCompletionRequest } = await import("@/lib/modules/game");
    await approveCompletionRequest(requestId);
    log.info("completion.approve", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "completion.approve", { actorId: actor?.id ?? null, requestId });
  }
  revalidatePath("/admin/moderation");
  revalidatePath("/admin/completions");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  revalidatePath("/feed");
  if (typeof userId === "string") revalidatePath(`/admin/users/${userId}`);
  return { ok: "approved" };
}

export async function rejectCompletionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  const adminNote = formData.get("adminNote");
  const userId = formData.get("userId");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  if (typeof adminNote !== "string" || !adminNote.trim()) return { error: "Reason required" };
  try {
    const { rejectCompletionRequest } = await import("@/lib/modules/game");
    await rejectCompletionRequest(requestId, adminNote);
    log.info("completion.reject", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "completion.reject", { actorId: actor?.id ?? null, requestId });
  }
  revalidatePath("/admin/moderation");
  revalidatePath("/admin/completions");
  revalidatePath("/dashboard");
  if (typeof userId === "string") revalidatePath(`/admin/users/${userId}`);
  return { ok: "rejected" };
}
 // --- Bulk verdicts ----------------------------------------------------------
 //
 // Quick-action bar above the queue: one confirm processes every visible
 // pending request through the same single-item use-cases as the per-card
 // buttons, so audit, ledger and feed writes stay identical. Items that fail
 // (e.g. already resolved in another tab) keep their pending row — the judge
 // sees exactly what is left. Only a total failure rethrows.

 function parseIds(formData: FormData): string[] {
  const raw = String(formData.get("ids") ?? "");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
 }

 async function runBulk(
  kind: string,
  ids: string[],
  apply: (id: string) => Promise<void>,
  revalidate: () => void,
 ): Promise<void> {
  const actor = await getCurrentUser();
  if (ids.length === 0) return;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await apply(id);
    } catch (e) {
      failed.push(id);
      log.error(`moderation.bulk_${kind}`, {
        actorId: actor?.id ?? null,
        requestId: id,
        err: e,
      });
    }
  }
  const ok = ids.length - failed.length;
  log.info(`moderation.bulk_${kind}`, {
    actorId: actor?.id ?? null,
    ok,
    failed: failed.length,
  });
  revalidate();
  if (ok === 0) throw new Error(`Bulk ${kind} failed for all ${ids.length} requests`);
 }

 function revalidateModeration(): void {
  revalidatePath("/admin/moderation");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  revalidatePath("/feed");
 }

 export async function approveAllRerollsAction(formData: FormData): Promise<void> {
  const ids = parseIds(formData);
  await runBulk("reroll_approve", ids, approveRerollRequest, revalidateModeration);
 }

 export async function rejectAllRerollsAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const ids = parseIds(formData);
  const sharedNote = String(formData.get("sharedNote") ?? "").trim();
  if (ids.length === 0) return;
  if (sharedNote.length < 5) throw new Error("Shared reason required (min 5 characters)");
  await runBulk(
    "reroll_reject",
    ids,
    (id) => rejectRerollRequest(id, sharedNote),
    revalidateModeration,
  );
  log.info("moderation.bulk_reroll_reject_note", {
    actorId: actor?.id ?? null,
    count: ids.length,
  });
 }

 export async function approveAllCompletionsAction(formData: FormData): Promise<void> {
  const { approveCompletionRequest } = await import("@/lib/modules/game");
  const ids = parseIds(formData);
  await runBulk("completion_approve", ids, approveCompletionRequest, revalidateModeration);
 }

 export async function rejectAllCompletionsAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const { rejectCompletionRequest } = await import("@/lib/modules/game");
  const ids = parseIds(formData);
  const sharedNote = String(formData.get("sharedNote") ?? "").trim();
  if (ids.length === 0) return;
  if (sharedNote.length < 5) throw new Error("Shared reason required (min 5 characters)");
  await runBulk(
    "completion_reject",
    ids,
    (id) => rejectCompletionRequest(id, sharedNote),
    revalidateModeration,
  );
  log.info("moderation.bulk_completion_reject_note", {
    actorId: actor?.id ?? null,
    count: ids.length,
  });
 }
