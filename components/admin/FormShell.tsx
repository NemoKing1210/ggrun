"use client";

import { useActionState } from "react";

import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";
import { DebugError } from "@/components/ui/DebugError";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

type Action = (
  prev: AdminFormState,
  formData: FormData,
) => Promise<AdminFormState>;

/** Admin form wrapper: useActionState + error/success display. */
export function FormShell({
  action,
  children,
  submitLabel,
  hideSubmit = false,
  submitClassName = "hud-btn hud-btn-primary self-start",
  className,
  confirmMessage,
  confirmDanger = true,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  hideSubmit?: boolean;
  submitClassName?: string;
  className?: string;
  /** When set, the submit button asks for in-app confirmation first. */
  confirmMessage?: string;
  confirmDanger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const label = pending ? "..." : (submitLabel ?? "OK");
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      {children}
      {state.error && (
        <div>
          <p className="text-danger text-sm" role="alert">
            {state.error}
          </p>
          <DebugError debug={state.debug} title="form" />
        </div>
      )}
      {!hideSubmit &&
        (confirmMessage ? (
          <ConfirmButton
            message={confirmMessage}
            danger={confirmDanger}
            className={submitClassName}
            disabled={pending}
          >
            {label}
          </ConfirmButton>
        ) : (
          <button type="submit" className={submitClassName} disabled={pending}>
            {label}
          </button>
        ))}
    </form>
  );
}
