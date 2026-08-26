"use server";

import { revalidatePath } from "next/cache";

import {
  adminCreateUser,
  adminDeleteUser,
  adminSetUserBlocked,
  adminUpdateUser,
} from "@/lib/use-cases/users";
import { AdminError } from "@/lib/use-cases/admin";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";

export type UserFormState = { error?: string; ok?: string };

async function toError(e: unknown): Promise<UserFormState> {
  const { t } = await getT();
  if (e instanceof AdminError) {
    return { error: errorText(t.core.errors, e.code, e.params) };
  }
  if (e instanceof Error) return { error: errorText(t.core.errors, e.message) };
  return { error: errorText(t.core.errors, "formUnknown") };
}

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await adminCreateUser({
      email: formData.get("email"),
      username: formData.get("username"),
      password: formData.get("password"),
      displayName: String(formData.get("displayName") || "") || undefined,
      role: formData.get("role"),
    });
    revalidatePath("/admin/users");
    return { ok: (await getT()).t.admin.users.userAdded };
  } catch (e) {
    return await toError(e);
  }
}

export async function updateUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    const password = String(formData.get("password") || "");
    await adminUpdateUser({
      userId: String(formData.get("userId")),
      email: String(formData.get("email") || "") || undefined,
      username: String(formData.get("username") || "") || undefined,
      displayName: String(formData.get("displayName") || "") || undefined,
      role: String(formData.get("role") || "") || undefined,
      ...(password ? { password } : {}),
    });
    revalidatePath("/admin/users");
    return { ok: (await getT()).t.admin.users.saved };
  } catch (e) {
    return await toError(e);
  }
}

export async function blockUserAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("userId"));
  const blocked = String(formData.get("blocked")) === "true";
  await adminSetUserBlocked(userId, blocked);
  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  await adminDeleteUser(String(formData.get("userId")));
  revalidatePath("/admin/users");
}
