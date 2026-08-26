"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticate, AuthError, registerUser } from "@/lib/use-cases/auth";
import { createSession, destroySession } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";

const credentialsSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export type FormState = { error?: string };

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getT();
  const errors = t.core.errors;
  const parsed = credentialsSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      error: errorText(
        errors,
        field === "password" ? "formPasswordRequired" : "formLoginRequired",
      ),
    };
  }
  try {
    const user = await authenticate(parsed.data.login, parsed.data.password);
    await createSession(user.id);
  } catch (e) {
    if (e instanceof AuthError) return { error: errorText(errors, e.code) };
    throw e;
  }
  redirect("/dashboard");
}

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getT();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  try {
    const user = await registerUser({ email, password, displayName });
    await createSession(user.id);
  } catch (e) {
    if (e instanceof AuthError) return { error: errorText(t.core.errors, e.code) };
    throw e;
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
