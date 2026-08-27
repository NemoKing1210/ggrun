"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registerAction, type FormState } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/Input";
import { DebugError } from "@/components/ui/DebugError";
import { Field } from "@/components/ui/Field";

const initial: FormState = {};

export function RegisterForm({ invite, registrationEnabled, maintenanceMode }: { invite?: string | null; registrationEnabled?: boolean; maintenanceMode?: boolean }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const isClosed = registrationEnabled === false && !invite;
  return (
    <>
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">{t.core.auth.registerTitle}</h1>
      <div className="hazard-tape my-4" aria-hidden />
      {maintenanceMode && (
        <div className="border border-amber/30 bg-amber/10 p-3 text-sm text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          {t.core.maintenance.text}
        </div>
      )}
      {isClosed ? (
        <div className="hud-card border-danger/30 bg-danger/10 p-4 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <p className="font-display uppercase tracking-widest text-danger">{t.core.auth.registrationClosed}</p>
          <p className="mt-2 text-sm text-zinc-400">{t.core.errors.authRegistrationDisabled}</p>
          <p className="mt-1 text-xs text-zinc-500">{t.core.auth.registrationClosedHint}</p>
        </div>
      ) : (
      <form action={formAction} className="flex flex-col gap-4">
        {invite && <input type="hidden" name="invite" value={invite} />}
        {invite && (
          <div className="border border-military/30 bg-military/10 p-2 text-xs text-military [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            ✓ Invite link active — registration bypass enabled
          </div>
        )}
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
        {state.ok && (
          <div className="border border-military/30 bg-military/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <p className="text-sm font-medium text-military">{t.core.errors[state.ok as keyof typeof t.core.errors] ?? state.ok}</p>
            {state.debug && (
              <div className="mt-2">
                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">{t.core.auth.verificationLinkDev}</p>
                <p className="mt-1 break-all font-mono text-xs text-amber">{state.debug}</p>
                <a href={state.debug} className="mt-2 inline-flex hud-btn !py-1 !px-2 text-xs">{t.core.auth.openVerificationLink}</a>
              </div>
            )}
            <DebugError debug={state.debug} title="register" />
          </div>
        )}
        <button type="submit" className="hud-btn hud-btn-primary" disabled={pending}>
          {pending ? t.core.auth.creating : t.core.auth.createAccount}
        </button>
      </form>
      )}
      <p className="mt-4 text-sm text-dim">
        {t.core.auth.haveAccount} <Link href="/login" className="text-amber hover:underline">{t.core.auth.goToLogin}</Link>
      </p>
    </>
  );
}