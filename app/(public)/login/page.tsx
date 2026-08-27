"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type FormState } from "@/lib/auth/actions";
import { devQuickLoginAction } from "@/lib/auth/dev-login";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/Input";
import { DebugError } from "@/components/ui/DebugError";
import { Field } from "@/components/ui/Field";

const initial: FormState = {};

export default function LoginPage() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">{t.core.auth.loginTitle}</h1>
      <div className="hazard-tape my-4" aria-hidden />
      <form action={formAction} className="flex flex-col gap-4">
        <Field label={t.core.auth.loginIdentifier}>
          <Input name="login" type="text" required autoComplete="username" placeholder={t.core.auth.loginPlaceholder} />
        </Field>
        <Field label={t.core.auth.password}>
          <Input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
        </Field>
        {state.error && (
          <div>
            <p className="text-danger text-sm border border-danger/30 bg-danger/10 p-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]" role="alert">
              {state.error}
            </p>
            <DebugError debug={state.debug} title="login" />
          </div>
        )}
        <button type="submit" className="hud-btn hud-btn-primary" disabled={pending}>
          {pending ? t.core.auth.signingIn : t.core.auth.signIn}
        </button>
      </form>
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-6 hud-card p-4 border-dashed">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-dim">{t.core.auth.devQuick}</p>
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
        {t.core.auth.noAccount} <Link href="/register" className="text-amber hover:underline">{t.core.auth.goToRegister}</Link>
      </p>
    </div>
  );
}
