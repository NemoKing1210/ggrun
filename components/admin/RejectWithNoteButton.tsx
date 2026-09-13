"use client";

import { useRef, useState, type MouseEvent } from "react";
import { XCircleIcon } from "@heroicons/react/24/outline";

import { Modal } from "@/components/ui/Modal";

/**
 * Reject trigger that collects the mandatory reason in a HUD modal instead of
 * an inline field. Must sit inside the verdict `<form>`: the reason travels in
 * a hidden input, and confirm submits the form programmatically.
 *
 * Ref-based (not state-based) on purpose: the hidden input is written
 * synchronously right before `requestSubmit()`, so the posted value can never
 * lag a pending state flush. The modal lives in a portal, so the form is
 * captured from the trigger (`button.form`) when the dialog opens.
 */
export function RejectWithNoteButton({
  submitLabel,
  title,
  notePlaceholder,
  confirmLabel,
  cancelLabel,
  tooShortError,
  minLength = 5,
  fieldName = "adminNote",
  count,
  className,
  disabled,
}: {
  submitLabel: string;
  title: string;
  notePlaceholder: string;
  confirmLabel: string;
  cancelLabel: string;
  tooShortError: string;
  minLength?: number;
  /** Hidden input name — "adminNote" for single verdicts, "sharedNote" for bulk. */
  fieldName?: string;
  /** When set, renders a mono ×N suffix on the trigger. */
  count?: number;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const onOpen = (e: MouseEvent<HTMLButtonElement>) => {
    formRef.current = e.currentTarget.form;
    setTooShort(false);
    setOpen(true);
  };

  const onConfirm = () => {
    const value = textRef.current?.value.trim() ?? "";
    if (value.length < minLength) {
      setTooShort(true);
      textRef.current?.focus();
      return;
    }
    if (hiddenRef.current) hiddenRef.current.value = value;
    setOpen(false);
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <input ref={hiddenRef} type="hidden" name={fieldName} value="" readOnly />
      <button type="button" onClick={onOpen} className={className} disabled={disabled}>
        <XCircleIcon className="size-4" aria-hidden />
        {submitLabel}
        {count !== undefined && (
          <span className="font-mono opacity-70">×{count}</span>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} panelClassName="max-w-md">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center border bg-danger/10 border-danger/40 text-danger [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <XCircleIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg uppercase tracking-wider leading-none">{title}</h2>
            <textarea
              ref={textRef}
              rows={3}
              minLength={minLength}
              required
              placeholder={notePlaceholder}
              aria-label={title}
              autoFocus
              onChange={() => setTooShort(false)}
              className="mt-3 w-full text-sm"
            />
            {tooShort && (
              <p className="mt-1.5 font-mono text-xs text-danger" role="alert">
                {tooShortError}
              </p>
            )}
          </div>
        </div>

        <div className="hazard-tape mt-4 h-1.5 opacity-60" aria-hidden />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="hud-btn">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="hud-btn hud-btn-danger">
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}
