"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { AdminError } from "@/lib/use-cases/admin";
import { makeToError, type ActionState } from "@/lib/use-cases/action-error";
import {
  updateSiteSettingsUseCase,
  createInviteUseCase,
  deleteInviteUseCase,
  approveUserUseCase,
  rejectUserUseCase,
  resendVerificationUseCase,
} from "@/lib/use-cases/site-settings";
import { log } from "@/lib/log";

const toError = makeToError(AdminError);

export async function updateSiteSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  try {
    const registrationEnabled = formData.get("registrationEnabled") === "on" || formData.get("registrationEnabled") === "true";
    const maintenanceMode = formData.get("maintenanceMode") === "on" || formData.get("maintenanceMode") === "true";
    const registrationMode = String(formData.get("registrationMode") ?? "open") as
      | "open"
      | "manual_approval"
      | "email_link";
    await updateSiteSettingsUseCase({ registrationEnabled, registrationMode, maintenanceMode });
    log.info("site.settings.action", { actorId: actor?.id ?? null });
    revalidatePath("/admin/settings");
    const { t } = await getT();
    return { ok: t.admin.siteSettings.saved };
  } catch (e) {
    return await toError(e, "site.settings.update", { actorId: (await getCurrentUser())?.id ?? null });
  }
}

export async function createInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const maxUses = Number(formData.get("maxUses") ?? 1);
    const expires = String(formData.get("expires") ?? "never");
    const expiresInHours =
      expires === "24h" ? 24 : expires === "7d" ? 24 * 7 : null;
    await createInviteUseCase({ maxUses: Number.isNaN(maxUses) ? 1 : maxUses, expiresInHours });
    revalidatePath("/admin/settings");
    const { t } = await getT();
    return { ok: t.admin.siteSettings.saved };
  } catch (e) {
    return await toError(e, "site.invite.create");
  }
}

export async function deleteInviteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await deleteInviteUseCase(id);
  revalidatePath("/admin/settings");
}

export async function approveUserAction(formData: FormData): Promise<void> {
  const id = String(formData.get("userId"));
  await approveUserUseCase(id);
  revalidatePath("/admin/settings");
}

export async function rejectUserAction(formData: FormData): Promise<void> {
  const id = String(formData.get("userId"));
  await rejectUserUseCase(id);
  revalidatePath("/admin/settings");
}

export async function resendVerificationAction(formData: FormData): Promise<void> {
  const id = String(formData.get("userId"));
  await resendVerificationUseCase(id);
  revalidatePath("/admin/settings");
}
