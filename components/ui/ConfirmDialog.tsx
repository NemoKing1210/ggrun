"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n/client";

/**
 * HUD confirmation dialog built on `Modal`. Replaces the native
 * `window.confirm` browser popup everywhere destructive/notable actions need
 * an explicit second step. `danger` swaps the accent and confirm button to the
 * rust-red palette for irreversible actions.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const accent = danger
    ? "bg-danger/10 border-danger/40 text-danger"
    : "bg-amber/10 border-amber/40 text-amber";

  return (
    <Modal open={open} onClose={onCancel} panelClassName="max-w-md">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex size-10 shrink-0 items-center justify-center border [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${accent}`}
        >
          <ExclamationTriangleIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg uppercase tracking-wider leading-none">
            {title ?? t.core.common.confirmTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{message}</p>
        </div>
      </div>

      <div className="hazard-tape mt-4 h-1.5 opacity-60" aria-hidden />

      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="hud-btn">
          {cancelLabel ?? t.core.common.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`hud-btn ${danger ? "hud-btn-danger" : "hud-btn-primary"}`}
        >
          {confirmLabel ?? t.core.common.confirm}
        </button>
      </div>
    </Modal>
  );
}
