"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registerAction, type FormState } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/Input";
import { DebugError } from "@/components/ui/DebugError";
import { Field } from "@/components/ui/Field";
import { PageContainer } from "@/components/ui/PageContainer";

const initial: FormState = {};

export default function RegisterPage() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(registerAction, initial);
  return (
    <PageContainer>
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">{t.core.auth.registerTitle}</h1>
      <div className="hazard-tape my-4" aria-hidden />
      <form action={formAction} className="flex flex-col gap-4">
        <Field label={t.core.auth.email}>
          <Input name="email" type="email" required autoComplete="email" placeholder="you@gg.run" />
        </Field>
        <Field label={t.core.auth.displayName}>
          <Input name="displayName" type="text" autoComplete="nickname" placeholder="NemoKing" />
        </Field>
        <Field label={t.core.auth.passwordHint}>
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </Field>
        {state.error && (
          <div>
            <p className="text-danger text-sm border border-danger/30 bg-danger/10 p-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]" role="alert">
              {state.error}
            </p>
            <DebugError debug={state.debug} title="register" />
          </div>
        )}
        <button type="submit" className="hud-btn hud-btn-primary" disabled={pending}>
          {pending ? t.core.auth.creating : t.core.auth.createAccount}
        </button>
      </form>
      <p className="mt-4 text-sm text-dim">
        {t.core.auth.haveAccount} <Link href="/login" className="text-amber hover:underline">{t.core.auth.goToLogin}</Link>
      </p>
    </PageContainer>
  );
}
