"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type FormState } from "@/lib/auth/actions";

const initial: FormState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        Вход
      </h1>
      <div className="hazard-tape my-4" aria-hidden />
      <form action={formAction} className="flex flex-col gap-4">
        <label className="text-dim text-sm">
          Email или ник
          <input name="login" type="text" required autoComplete="username" />
        </label>
        <label className="text-dim text-sm">
          Пароль
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
          {pending ? "Входим..." : "Войти"}
        </button>
      </form>
      <p className="mt-4 text-sm text-dim">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-amber hover:underline">
          Регистрация
        </Link>
      </p>
    </div>
  );
}
