"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  UserIcon,
  LockClosedIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  BoltIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { loginAction } from "@/lib/modules/auth/actions/login";
import type { FormState } from "@/lib/modules/auth/actions/types";
import { devQuickLoginAction } from "@/lib/infrastructure/auth/dev-login";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/Input";
import { DebugError } from "@/components/ui/DebugError";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";

const initial: FormState = {};

export function LoginForm() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="hud-card p-5 sm:p-6 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <ShieldCheckIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl uppercase tracking-widest leading-none text-amber">{t.core.auth.loginTitle}</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-dim">{t.core.auth.loginSubtitle}</p>
        </div>
        <Badge variant="dim" size="sm" className="ml-auto hidden sm:inline-flex font-mono">SECURE</Badge>
      </div>
      <div className="hazard-tape my-4 opacity-60" aria-hidden />

      <form action={formAction} className="flex flex-col gap-4">
        <Field label={t.core.auth.loginIdentifier}>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
            <Input name="login" type="text" required autoComplete="username" placeholder={t.core.auth.loginPlaceholder} className="!pl-9" autoFocus />
          </div>
        </Field>
        <Field label={t.core.auth.password}>
          <div className="relative">
            <LockClosedIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
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
        </Field>

        {state.error && (
          <div className="border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <div className="flex gap-2">
              <ExclamationTriangleIcon className="size-4 shrink-0 text-danger mt-0.5" aria-hidden />
              <p className="text-sm text-red-300" role="alert">{state.error}</p>
            </div>
            <DebugError debug={state.debug} title="login" />
          </div>
        )}

        <button type="submit" className="hud-btn hud-btn-primary w-full inline-flex items-center justify-center gap-2 !py-2.5" disabled={pending}>
          {pending ? (
            t.core.auth.signingIn
          ) : (
            <>
              {t.core.auth.signIn} <ArrowRightIcon className="size-4" aria-hidden />
            </>
          )}
        </button>

        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dim">
          <span className="h-px flex-1 bg-[#2a2a22]" aria-hidden />
          {t.core.auth.orDivider}
          <span className="h-px flex-1 bg-[#2a2a22]" aria-hidden />
        </div>

        <p className="text-center text-sm text-dim">
          {t.core.auth.noAccount}{" "}
          <Link href="/register" className="font-mono text-amber hover:underline uppercase tracking-widest text-xs">
            {t.core.auth.goToRegister} <ArrowRightIcon className="inline size-3.5" aria-hidden />
          </Link>
        </p>
      </form>

      {process.env.NODE_ENV !== "production" && (
        <div className="mt-6 border border-dashed border-amber/30 bg-amber/5 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <div className="flex items-center gap-1.5">
            <BoltIcon className="size-3.5 text-amber" aria-hidden />
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber">{t.core.auth.devQuick}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={devQuickLoginAction}>
              <input type="hidden" name="devUser" value="admin" />
              <button type="submit" className="hud-btn !py-1.5 !px-3 text-xs">🛡 {t.core.auth.devAsAdmin}</button>
            </form>
            <form action={devQuickLoginAction}>
              <input type="hidden" name="devUser" value="player" />
              <button type="submit" className="hud-btn !py-1.5 !px-3 text-xs">▶ {t.core.auth.devAsPlayer}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
