"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { AdminError } from "@/lib/use-cases/admin";
import { makeToError, type ActionState } from "@/lib/use-cases/action-error";
import {
  updateSiteSettingsUseCase,
  updateProviderKeysUseCase,
  createInviteUseCase,
  deleteInviteUseCase,
  approveUserUseCase,
  rejectUserUseCase,
  resendVerificationUseCase,
  testProxyUseCase,
} from "@/lib/use-cases/site-settings";
import { log } from "@/lib/log";

const toError = makeToError(AdminError);

export async function updateProviderKeysAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    // Empty string means "clear" -> null; missing field means keep as-is.
    // Frontend sends all 4 fields; if user left masked placeholder unchanged we treat as undefined.
    const get = (k: string): string | null | undefined => {
      if (!formData.has(k)) return undefined;
      const v = String(formData.get(k) ?? "");
      // Sentinel "__KEEP__" means don't touch
      if (v === "__KEEP__") return undefined;
      const t = v.trim();
      return t ? t : null;
    };
    await updateProviderKeysUseCase({
      rawgApiKey: get("rawgApiKey"),
      igdbClientId: get("igdbClientId"),
      igdbClientSecret: get("igdbClientSecret"),
      steamApiKey: get("steamApiKey"),
      gamespotApiKey: get("gamespotApiKey"),
      proxyEnabled: (() => {
        const v = formData.get("proxyEnabled");
        if (v === null) return undefined;
        const s = String(v).toLowerCase();
        return s === "true" || s === "1" || s === "on" || s === "yes";
      })(),
      proxyUrl: get("proxyUrl"),
    });
    revalidatePath("/admin/settings");
    revalidatePath("/admin/games");
    const { t } = await getT();
    return { ok: t.admin.siteSettings.saved };
  } catch (e) {
    return await toError(e, "site.provider_keys.update", { actorId: (await getCurrentUser())?.id ?? null });
  }
}

export async function testProxyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const proxyUrl = String(formData.get("proxyUrl") ?? "__USE_CURRENT__");
    const result = await testProxyUseCase(proxyUrl);
    const { t } = await getT();
    if (result.ok) return { ok: t.admin.siteSettings.proxyTestOk };
    return {
      error: format(t.admin.siteSettings.proxyTestFail, { detail: result.error ?? "" }),
    };
  } catch (e) {
    return await toError(e, "site.proxy.test", { actorId: (await getCurrentUser())?.id ?? null });
  }
}

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
