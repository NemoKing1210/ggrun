"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { and, eq, ne } from "drizzle-orm";
import {
 adminCreateUser,
 adminDeleteUser,
 adminRevokeSessions,
 adminSetUserBlocked,
 adminUpdateUser,
 adminVerifyEmail,
 updateUserSettings,
} from "@/lib/modules/player/service";
import { AdminError } from "@/lib/modules/season/service";
import { getCurrentUser, SESSION_COOKIE, tokenFingerprint } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { log } from "@/lib/infrastructure/logger";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";
import { db } from "@/lib/infrastructure/db";
import { sessions } from "@/db/schema";

export type UserFormState = ActionState;
export type SettingsFormState = ActionState;

const toError = makeToError(AdminError);

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await getCurrentUser();
  const input = {
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
    displayName: String(formData.get("displayName") || "") || undefined,
    role: formData.get("role"),
  };
  try {
    await adminCreateUser(input);
    log.info("user.create", {
      actorId: actor?.id ?? null,
      email: String(formData.get("email") ?? ""),
    });
    revalidatePath("/admin/users");
    return { ok: (await getT()).t.admin.users.userAdded };
  } catch (e) {
    return await toError(e, "user.create", { actorId: actor?.id ?? null });
  }
}

export async function updateUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await getCurrentUser();
  const userId = String(formData.get("userId"));
  const password = String(formData.get("password") || "");
  try {
    await adminUpdateUser({
      userId,
      email: String(formData.get("email") || "") || undefined,
      username: String(formData.get("username") || "") || undefined,
      displayName: String(formData.get("displayName") || "") || undefined,
      role: String(formData.get("role") || "") || undefined,
      ...(password ? { password } : {}),
    });
    log.info("user.update", { actorId: actor?.id ?? null, targetId: userId });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return { ok: (await getT()).t.admin.users.saved };
  } catch (e) {
    return await toError(e, "user.update", {
      actorId: actor?.id ?? null,
      targetId: userId,
    });
  }
}

export async function blockUserAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const userId = String(formData.get("userId"));
  const blocked = String(formData.get("blocked")) === "true";
  try {
    await adminSetUserBlocked(userId, blocked);
    log.info("user.block", {
      actorId: actor?.id ?? null,
      targetId: userId,
      blocked,
    });
  } catch (e) {
    log.error("user.block", {
      actorId: actor?.id ?? null,
      targetId: userId,
      blocked,
      err: e,
    });
    throw e;
  }
 revalidatePath("/admin/users");
 revalidatePath(`/admin/users/${userId}`);
}

export async function verifyEmailAction(formData: FormData): Promise<void> {
 const actor = await getCurrentUser();
 const userId = String(formData.get("userId") ?? "");
 try {
 await adminVerifyEmail(userId);
 log.info("user.verify_email", { actorId: actor?.id ?? null, targetId: userId });
 } catch (e) {
 log.error("user.verify_email", { actorId: actor?.id ?? null, targetId: userId, err: e });
 throw e;
 }
 revalidatePath("/admin/users");
 revalidatePath(`/admin/users/${userId}`);
}

/** Revokes one session of a user (admin console, sessions tab). */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const userId = String(formData.get("userId"));
  const sessionId = String(formData.get("sessionId"));
  try {
    await adminRevokeSessions(userId, sessionId);
    log.info("user.session.revoke", {
      actorId: actor?.id ?? null,
      targetId: userId,
      sessionId,
    });
  } catch (e) {
    log.error("user.session.revoke", {
      actorId: actor?.id ?? null,
      targetId: userId,
      sessionId,
      err: e,
    });
    throw e;
  }
  revalidatePath(`/admin/users/${userId}`);
}

/** Revokes ALL sessions of a user (admin console, sessions tab). */
export async function revokeAllSessionsAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const userId = String(formData.get("userId"));
  try {
    await adminRevokeSessions(userId);
    log.info("user.sessions.revoke_all", {
      actorId: actor?.id ?? null,
      targetId: userId,
    });
  } catch (e) {
    log.error("user.sessions.revoke_all", {
      actorId: actor?.id ?? null,
      targetId: userId,
      err: e,
    });
    throw e;
  }
  revalidatePath(`/admin/users/${userId}`);
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const userId = String(formData.get("userId"));
  try {
    await adminDeleteUser(userId);
    log.info("user.delete", { actorId: actor?.id ?? null, targetId: userId });
  } catch (e) {
    log.error("user.delete", { actorId: actor?.id ?? null, targetId: userId, err: e });
    throw e;
  }
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/** Saves the current user's profile & preferences (settings page). */
export async function updateUserSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const actor = await getCurrentUser();
  const parseArr = (key: string): string[] => {
    const raw = formData.get(key);
    if (raw === null) return [];
    try {
      const arr = JSON.parse(String(raw));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const linksRaw = parseArr("links");
  const links: Array<{ network: string; url: string }> = [];
  for (let i = 0; i < linksRaw.length; i += 1) {
    const item = linksRaw[i];
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const network = String(o.network ?? "").trim();
      const url = String(o.url ?? "").trim();
      if (network && url) links.push({ network, url });
    }
  }
  const input = {
    displayName: String(formData.get("displayName") || ""),
    bio: String(formData.get("bio") || ""),
    avatarUrl: String(formData.get("avatarUrl") || ""),
    bannerUrl: String(formData.get("bannerUrl") || ""),
    accent: String(formData.get("accent") || "amber"),
    locale: String(formData.get("locale") || "en"),
    links,
  };
  try {
    await updateUserSettings(input);
    const locale = String(formData.get("locale") || "en");
    const jar = await cookies();
    jar.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    log.info("user.settings.update", {
      actorId: actor?.id ?? null,
      locale,
      linksCount: links.length,
    });
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: (await getT()).t.settings.saved };
  } catch (e) {
    return await toError(e, "user.settings.update", { actorId: actor?.id ?? null });
  }
}

/** Revokes one own session from the settings page (/settings). */
export async function revokeOwnSessionAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const currentHash = token ? tokenFingerprint(token) : null;
  const [target] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!target || target.userId !== actor.id) {
    log.warn("user.session.revoke_own.forbidden", { actorId: actor.id, sessionId });
    throw new AdminError("authLoginRequired");
  }
  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, actor.id)));
  log.info("user.session.revoke_own", { actorId: actor.id, sessionId });
  const isCurrent = currentHash !== null && target.tokenHash === currentHash;
  if (isCurrent) {
    jar.delete(SESSION_COOKIE);
    revalidatePath("/settings");
    redirect("/login");
  }
  revalidatePath("/settings");
}

/** Revokes all own sessions except the current one (/settings). */
export async function revokeOtherSessionsAction(_formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    await db.delete(sessions).where(eq(sessions.userId, actor.id));
    log.info("user.sessions.revoke_others.all", { actorId: actor.id });
    revalidatePath("/settings");
    jar.delete(SESSION_COOKIE);
    redirect("/login");
    return;
  }
  const currentHash = tokenFingerprint(token);
  await db.delete(sessions).where(and(eq(sessions.userId, actor.id), ne(sessions.tokenHash, currentHash)));
  log.info("user.sessions.revoke_others", { actorId: actor.id });
  revalidatePath("/settings");
}
