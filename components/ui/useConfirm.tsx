"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/**
 * Promise-based confirmation hook. Call `confirm({ message, danger })` and
 * await the result; render the returned `dialog` once anywhere in the tree.
 * The dialog stays mounted so `Modal` can play its exit animation between
 * confirmations.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={options !== null}
      title={options?.title}
      message={options?.message ?? ""}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      danger={options?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
