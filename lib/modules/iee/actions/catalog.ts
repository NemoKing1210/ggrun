"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { log } from "@/lib/infrastructure/logger";
import { AdminError } from "@/lib/modules/season/service/errors";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";

import {
  createEventTemplateUseCase,
  deleteEventTemplateUseCase,
  setEventTemplateActiveUseCase,
  updateEventTemplateUseCase,
  type EventTemplateInput,
} from "../service/catalog";

const toError = makeToError(AdminError);

const CATALOG_PATH = "/admin/catalog";

/** Empty string -> null; a blank numeric field means "no deadline". */
function readDeadline(formData: FormData): number | null {
  const raw = String(formData.get("defaultDeadlineHours") ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readReward(formData: FormData): EventTemplateInput["reward"] {
  const points = String(formData.get("rewardPoints") ?? "").trim();
  const itemKey = String(formData.get("rewardItemKey") ?? "").trim();
  const effectKey = String(formData.get("rewardEffectKey") ?? "").trim();
  const reward: EventTemplateInput["reward"] = {};
  if (points) {
    const n = Number(points);
    if (Number.isFinite(n) && n > 0) reward.points = Math.trunc(n);
  }
  if (itemKey) reward.itemKey = itemKey;
  if (effectKey) reward.effectKey = effectKey;
  return reward;
}

function readBool(formData: FormData, name: string): boolean {
  const v = String(formData.get(name) ?? "").toLowerCase();
  return v === "on" || v === "true" || v === "1" || v === "yes";
}

export async function createEventTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await createEventTemplateUseCase({
      key: String(formData.get("key") ?? ""),
      title: String(formData.get("title") ?? ""),
      descriptionMd: String(formData.get("descriptionMd") ?? ""),
      reward: readReward(formData),
      requiresProof: readBool(formData, "requiresProof"),
      defaultDeadlineHours: readDeadline(formData),
    });
    revalidatePath(CATALOG_PATH);
    const { t } = await getT();
    return { ok: t.iee.admin.saved };
  } catch (e) {
    return await toError(e, "iee.event_template.create", {
      actorId: (await getCurrentUser())?.id ?? null,
    });
  }
}

export async function updateEventTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateEventTemplateUseCase(String(formData.get("id") ?? ""), {
      title: String(formData.get("title") ?? ""),
      descriptionMd: String(formData.get("descriptionMd") ?? ""),
      reward: readReward(formData),
      requiresProof: readBool(formData, "requiresProof"),
      defaultDeadlineHours: readDeadline(formData),
    });
    revalidatePath(CATALOG_PATH);
    const { t } = await getT();
    return { ok: t.iee.admin.saved };
  } catch (e) {
    return await toError(e, "iee.event_template.update", {
      actorId: (await getCurrentUser())?.id ?? null,
    });
  }
}

/** Void 1-arg shape — safe to pass straight to `<form action={…}>`. */
export async function toggleEventTemplateAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const isActive = readBool(formData, "isActive");
  try {
    await setEventTemplateActiveUseCase(id, isActive);
    revalidatePath(CATALOG_PATH);
  } catch (e) {
    log.error("iee.event_template.toggle_failed", { id, error: String(e) });
    throw e;
  }
}

export async function deleteEventTemplateAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  try {
    await deleteEventTemplateUseCase(id);
    revalidatePath(CATALOG_PATH);
  } catch (e) {
    log.error("iee.event_template.delete_failed", { id, error: String(e) });
    throw e;
  }
}
