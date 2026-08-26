"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registerAction, type FormState } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n/client";

const initial: FormState = {};

export default function RegisterPage() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(registerAction, initial);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {t.core.auth.registerTitle}
      </h1>
      <div className="hazard-tape my-4" aria-hidden />
      <form action={formAction} className="flex flex-col gap-4">
        <label className="text-dim text-sm">
          {t.core.auth.email}
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="text-dim text-sm">
          {t.core.auth.displayName}
          <input name="displayName" type="text" autoComplete="nickname" />
        </label>
        <label className="text-dim text-sm">
          {t.core.auth.passwordHint}
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {state.error && (
          <p className="text-danger text-sm" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" className="hud-btn hud-btn-primary" disabled={pending}>
          {pending ? t.core.auth.creating : t.core.auth.createAccount}
        </button>
      </form>
      <p className="mt-4 text-sm text-dim">
        {t.core.auth.haveAccount}{" "}
        <Link href="/login" className="text-amber hover:underline">
          {t.core.auth.goToLogin}
        </Link>
      </p>
    </div>
  );
}
