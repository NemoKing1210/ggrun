"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  authenticate,
  AuthError,
  registerUser,
} from "@/lib/use-cases/auth";
import { createSession, destroySession } from "@/lib/auth/session";

const credentialsSchema = z.object({
  login: z.string().min(1, "Укажите логин"),
  password: z.string().min(1, "Укажите пароль"),
});

export type FormState = { error?: string };

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message };
  }
  try {
    const user = await authenticate(parsed.data.login, parsed.data.password);
    await createSession(user.id);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/dashboard");
}

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  try {
    const user = await registerUser({ email, password, displayName });
    await createSession(user.id);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
