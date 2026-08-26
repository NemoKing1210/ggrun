"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registerAction, type FormState } from "@/lib/auth/actions";

const initial: FormState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        Регистрация
      </h1>
      <div className="hazard-tape my-4" aria-hidden />
      <form action={formAction} className="flex flex-col gap-4">
        <label className="text-dim text-sm">
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="text-dim text-sm">
          Отображаемое имя
          <input name="displayName" type="text" autoComplete="nickname" />
        </label>
        <label className="text-dim text-sm">
          Пароль (мин. 8 символов)
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
          {pending ? "Создаём..." : "Создать аккаунт"}
        </button>
      </form>
      <p className="mt-4 text-sm text-dim">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-amber hover:underline">
          Вход
        </Link>
      </p>
    </div>
  );
}
