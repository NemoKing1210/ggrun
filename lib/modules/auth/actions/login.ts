"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticate, AuthError } from "@/lib/modules/auth/service";
import { createSession } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { log } from "@/lib/infrastructure/logger";
import { makeToError } from "@/lib/use-cases/shared/action-error";
import type { FormState } from "./types";

const credentialsSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

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