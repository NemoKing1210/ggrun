"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticate, AuthError, registerUser } from "@/lib/use-cases/auth";
import { createSession, destroySession } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { log } from "@/lib/log";
import { makeToError, type ActionState } from "@/lib/use-cases/action-error";

const credentialsSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export type FormState = ActionState;

const toError = makeToError(AuthError);

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
    const code = field === "password" ? "formPasswordRequired" : "formLoginRequired";
    log.debug("auth.login.invalid_input", { field });
    return {
      error: errorText(errors, code),
      debug:
        process.env.NODE_ENV === "development"
          ? JSON.stringify(parsed.error.issues, null, 2)
          : undefined,
    };
  }
  try {
    const user = await authenticate(parsed.data.login, parsed.data.password);
    await createSession(user.id);
    log.info("auth.login", { userId: user.id });
  } catch (e) {
    return await toError(e, "auth.login", { login: parsed.data.login });
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
  const inviteToken = formData.get("invite") ? String(formData.get("invite")) : null;
  try {
    const result = await registerUser({ email, password, displayName, inviteToken });
    if (result.requiresApproval) {
      log.info("auth.register.pending_approval", { userId: result.id, email });
      return { ok: "registrationPendingApproval" };
    }
    if (result.requiresVerification) {
      log.info("auth.register.pending_verification", { userId: result.id, email });
      const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const link = `${base.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(result.verificationToken ?? "")}`;
      // In production this would be emailed; for now we log it
      log.info("auth.register.verification_link", { userId: result.id, link });
      return {
        ok: "registrationCheckEmail",
        debug: process.env.NODE_ENV === "development" ? link : undefined,
      };
    }
    await createSession(result.id);
    log.info("auth.register", { userId: result.id, email });
  } catch (e) {
    return await toError(e, "auth.register", { email });
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  // Best-effort: don't have a session id easily here, just log the event.
  log.info("auth.logout");
  await destroySession();
  redirect("/login");
}
