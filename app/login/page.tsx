"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type FormState } from "@/lib/auth/actions";
import { devQuickLoginAction } from "@/lib/auth/dev-login";
import { useI18n } from "@/lib/i18n/client";

const initial: FormState = {};

export default function LoginPage() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {t.core.auth.loginTitle}
      </h1>
      <div className="hazard-tape my-4" aria-hidden />
      <form action={formAction} className="flex flex-col gap-4">
        <label className="text-dim text-sm">
          {t.core.auth.loginIdentifier}
          <input name="login" type="text" required autoComplete="username" />
        </label>
        <label className="text-dim text-sm">
          {t.core.auth.password}
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        {state.error && (
          <p className="text-danger text-sm" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" className="hud-btn hud-btn-primary" disabled={pending}>
          {pending ? t.core.auth.signingIn : t.core.auth.signIn}
        </button>
      </form>
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-6 border border-dashed border-[#55554a] p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-dim">
            {t.core.auth.devQuick}
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={devQuickLoginAction}>
              <input type="hidden" name="devUser" value="admin" />
              <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                {t.core.auth.devAsAdmin}
              </button>
            </form>
            <form action={devQuickLoginAction}>
              <input type="hidden" name="devUser" value="player" />
              <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                {t.core.auth.devAsPlayer}
              </button>
            </form>
          </div>
        </div>
      )}
      <p className="mt-4 text-sm text-dim">
        {t.core.auth.noAccount}{" "}
        <Link href="/register" className="text-amber hover:underline">
          {t.core.auth.goToRegister}
        </Link>
      </p>
    </div>
  );
}
