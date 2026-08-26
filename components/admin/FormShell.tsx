"use client";

import { useActionState } from "react";

import type { AdminFormState } from "@/lib/use-cases/admin-actions";

type Action = (
  prev: AdminFormState,
  formData: FormData,
) => Promise<AdminFormState>;

/** Обёртка формы админки: useActionState + вывод ошибки/успеха. */
export function FormShell({
  action,
  children,
  submitLabel,
  hideSubmit = false,
  submitClassName = "hud-btn hud-btn-primary self-start",
  className,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  hideSubmit?: boolean;
  submitClassName?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      {children}
      {state.error && (
        <p className="text-danger text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-military text-sm">{state.ok}</p>}
      {!hideSubmit && (
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? "..." : (submitLabel ?? "OK")}
        </button>
      )}
    </form>
  );
}
