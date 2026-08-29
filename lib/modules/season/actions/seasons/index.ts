"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  changeSeasonStatus,
  createSeason,
  resetSeason,
  updateSeasonSettings,
} from "@/lib/modules/season/service";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { format } from "@/lib/i18n/format";
import { log } from "@/lib/infrastructure/logger";

import { revalidateAdmin, toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";
import { parseSeasonSettingsForm } from "./form";
export async function createSeasonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  let createdId: string | null = null;
  try {
    const id = await createSeason({
      title: formData.get("title"),
      slug: formData.get("slug"),
      cloneBoardFromSeasonId: String(formData.get("cloneFrom") || "") || undefined,
    });
    log.info("season.create", { actorId: actor?.id ?? null, seasonId: id });
    revalidateAdmin();
    createdId = id;
  } catch (e) {
    return await toError(e, "season.create", { actorId: actor?.id ?? null });
  }
  if (createdId) redirect(`/admin/seasons/${createdId}`);
  return { ok: format((await getT()).t.admin.feedback.seasonCreated, { id: createdId ?? "" }) };
}

export async function changeStatusAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  const newStatus = String(formData.get("status")) as
    | "draft"
    | "active"
    | "paused"
    | "finished"
    | "archived";
  try {
    await changeSeasonStatus(seasonId, newStatus);
    log.info("season.status_change", {
      actorId: actor?.id ?? null,
      seasonId,
      newStatus,
    });
    revalidateAdmin(seasonId);
    return {
      ok: format((await getT()).t.admin.feedback.statusChanged, { status: newStatus }),
    };
  } catch (e) {
    return await toError(e, "season.status_change", {
      actorId: actor?.id ?? null,
      seasonId,
      newStatus,
    });
  }
}

export async function resetSeasonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  try {
    await resetSeason(seasonId);
    log.info("season.reset", { actorId: actor?.id ?? null, seasonId });
    revalidateAdmin(seasonId);
    revalidatePath("/board");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    revalidatePath("/feed");
    return { ok: (await getT()).t.admin.feedback.seasonReset ?? "Season reset" };
  } catch (e) {
    return await toError(e, "season.reset", { actorId: actor?.id ?? null, seasonId });
  }
}

export async function resetSeasonDirectAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  await resetSeason(seasonId);
  log.info("season.reset", { actorId: actor?.id ?? null, seasonId });
  revalidateAdmin(seasonId);
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/feed");
}

export async function updateSeasonSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));

  const parsed = parseSeasonSettingsForm(formData);
  if (parsed.error) {
    const code = parsed.error as "formConfigInvalidJson" | "formUnknown";
    if (code === "formConfigInvalidJson") {
      const legacy = String(formData.get("config") || "{}");
      const debug =
        process.env.NODE_ENV === "development"
          ? `JSON.parse failed: ${legacy.slice(0, 200)}`
          : undefined;
      return {
        error: errorText((await getT()).t.core.errors, code),
        debug,
      };
    }
    return { error: errorText((await getT()).t.core.errors, code) };
  }

  try {
    await updateSeasonSettings({ seasonId, config: parsed.config!, rulesMd: parsed.rulesMd ?? undefined });
    log.info("season.settings.update", { actorId: actor?.id ?? null, seasonId });
    revalidateAdmin(seasonId);
    revalidatePath("/rules");
    revalidatePath("/board");
    return { ok: (await getT()).t.admin.feedback.settingsSaved };
  } catch (e) {
    return await toError(e, "season.settings.update", {
      actorId: actor?.id ?? null,
      seasonId,
    });
  }
}
