"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/lib/shared/types/action-state";
import { useToast } from "./useToast";

type Options = {
  successTitle?: string;
  /** when true, error toast auto from state.error; when false, suppress */
  showError?: boolean;
  showSuccess?: boolean;
  /** map ok string to custom description */
  okToDescription?: (ok: string) => string | undefined;
};

/**
 * Watches an ActionState (from useActionState) and emits toasts on ok/error.
 * Keeps last emitted value to avoid duplicate toasts on re-render.
 */
export function useActionToast(state: ActionState, opts: Options = {}) {
  const { toast } = useToast();
  const prev = useRef<string>("");

  useEffect(() => {
    const key = `${state.ok ?? ""}|${state.error ?? ""}|${state.debug ?? ""}`;
    if (!key || key === "| |" || key === prev.current) return;
    // only emit when something present
    if (!state.ok && !state.error) return;
    prev.current = key;

    if (state.error && opts.showError !== false) {
      toast({
        title: state.error,
        description: undefined,
        variant: "error",
        debug: state.debug,
        duration: 6500,
      });
    } else if (state.ok && opts.showSuccess !== false) {
      const desc = opts.okToDescription?.(state.ok) ?? undefined;
      const title = opts.successTitle ?? state.ok;
      // if okToDescription returns something, treat ok as title and desc as description
      const isMapped = Boolean(desc);
      toast({
        title: isMapped ? title : state.ok,
        description: desc ?? (isMapped ? desc : undefined),
        variant: "success",
        duration: 3500,
      });
    }
  }, [state.ok, state.error, state.debug, toast, opts]);
}
