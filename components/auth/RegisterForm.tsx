"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  EnvelopeIcon,
  UserIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  UserPlusIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";

import { registerAction } from "@/lib/modules/auth/actions/register";
import type { FormState } from "@/lib/modules/auth/actions/types";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/Input";
import { DebugError } from "@/components/ui/DebugError";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";

const initial: FormState = {};

export function RegisterForm({
  invite,
  registrationEnabled,
  maintenanceMode,
}: {
  invite?: string | null;
  registrationEnabled?: boolean;
  maintenanceMode?: boolean;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const [showPassword, setShowPassword] = useState(false);
  const isClosed = registrationEnabled === false && !invite;

  return (
    <div className="hud-card p-5 sm:p-6 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <UserPlusIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl uppercase tracking-widest leading-none text-amber">{t.core.auth.registerTitle}</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-dim">{t.core.auth.registerSubtitle}</p>
        </div>
        <Badge variant="dim" size="sm" className="ml-auto hidden sm:inline-flex font-mono">NEW OPS</Badge>
      </div>
      <div className="hazard-tape my-4 opacity-60" aria-hidden />

      {maintenanceMode && (
        <div className="mb-4 flex gap-2 border border-amber/30 bg-amber/10 p-3 text-sm text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <ShieldCheckIcon className="size-4 shrink-0 mt-0.5" aria-hidden />
          <span>{t.core.maintenance.text}</span>
        </div>
      )}

      {isClosed ? (
        <div className="hud-card border-danger/30 bg-danger/10 p-5 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <ExclamationTriangleIcon className="mx-auto size-6 text-danger" aria-hidden />
          <p className="mt-2 font-display uppercase tracking-widest text-danger">{t.core.auth.registrationClosed}</p>
          <p className="mt-1 text-sm text-zinc-400">{t.core.errors.authRegistrationDisabled}</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">{t.core.auth.registrationClosedHint}</p>
          <div className="mt-3 inline-flex items-center gap-1.5 border border-dim/30 bg-raised px-2 py-1 font-mono text-xs text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            <LinkIcon className="size-3.5" aria-hidden /> Invite required
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {invite && <input type="hidden" name="invite" value={invite} />}
          {invite && (
            <div className="flex gap-2 border border-military/30 bg-military/10 p-2.5 text-xs text-military [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <CheckCircleIcon className="size-4 shrink-0" aria-hidden />
              <div>
                <span className="font-display uppercase tracking-widest">{t.core.auth.inviteBadge}</span>
                <span className="ml-2 font-mono text-military/80">{t.core.auth.inviteHint}</span>
              </div>
            </div>
          )}

          <Field label={t.core.auth.email}>
            <div className="relative">
              <EnvelopeIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
              <Input name="email" type="email" required autoComplete="email" placeholder="you@gg.run" className="!pl-9" />
            </div>
          </Field>
          <Field label={t.core.auth.displayName}>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
              <Input name="displayName" type="text" autoComplete="nickname" placeholder="NemoKing" className="!pl-9" />
            </div>
          </Field>
          <Field label={t.core.auth.passwordHint}>
            <div className="relative">
              <LockClosedIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
              <Input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="••••••••"
                className="!pl-9 !pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dim hover:text-amber"
                aria-label={showPassword ? t.core.auth.passwordHide : t.core.auth.passwordShow}
                title={showPassword ? t.core.auth.passwordHide : t.core.auth.passwordShow}
              >
                {showPassword ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-zinc-500">
              <ShieldCheckIcon className="size-3" aria-hidden /> {t.core.auth.secureNote}
            </p>
          </Field>

          {state.error && (
            <div className="border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <div className="flex gap-2">
                <ExclamationTriangleIcon className="size-4 shrink-0 text-danger mt-0.5" aria-hidden />
                <p className="text-sm text-red-300" role="alert">{state.error}</p>
              </div>
              <DebugError debug={state.debug} title="register" />
            </div>
          )}

          {state.ok && (
            <div className="border border-military/30 bg-military/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <div className="flex gap-2">
                <CheckCircleIcon className="size-4 shrink-0 text-military mt-0.5" aria-hidden />
                <p className="text-sm font-medium text-military">{t.core.errors[state.ok as keyof typeof t.core.errors] ?? state.ok}</p>
              </div>
              {state.debug && (
                <div className="mt-3 border-t border-military/20 pt-3">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">{t.core.auth.verificationLinkDev}</p>
                  <p className="mt-1 break-all font-mono text-xs text-amber">{state.debug}</p>
                  <a href={state.debug} className="mt-2 inline-flex hud-btn !py-1.5 !px-3 text-xs gap-1">
                    {t.core.auth.openVerificationLink} <ArrowRightIcon className="size-3" aria-hidden />
                  </a>
                </div>
              )}
              <DebugError debug={state.debug} title="register" />
            </div>
          )}

          <button type="submit" className="hud-btn hud-btn-primary w-full inline-flex items-center justify-center gap-2 !py-2.5" disabled={pending}>
            {pending ? (
              t.core.auth.creating
            ) : (
              <>
                {t.core.auth.createAccount} <SparklesIcon className="size-4" aria-hidden />
              </>
            )}
          </button>

          <p className="flex items-center justify-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">
            <span className="size-1 bg-military [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
            {t.core.auth.secureNote}
          </p>
        </form>
      )}

      <div className="mt-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dim">
        <span className="h-px flex-1 bg-[#2a2a22]" aria-hidden />
        {t.core.auth.orDivider}
        <span className="h-px flex-1 bg-[#2a2a22]" aria-hidden />
      </div>
      <p className="mt-4 text-center text-sm text-dim">
        {t.core.auth.haveAccount}{" "}
        <Link href="/login" className="font-mono text-amber hover:underline uppercase tracking-widest text-xs">
          {t.core.auth.goToLogin} <ArrowRightIcon className="inline size-3.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
