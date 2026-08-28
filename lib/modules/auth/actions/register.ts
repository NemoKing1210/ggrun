"use server";

import { redirect } from "next/navigation";

import { registerUser } from "@/lib/modules/auth/service";
import { createSession } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { makeToError } from "@/lib/use-cases/shared/action-error";
import { AuthError } from "@/lib/modules/auth/service";
import type { FormState } from "./types";

const toError = makeToError(AuthError);

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