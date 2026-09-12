"use client";

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Toast, ToastInput, ToastVariant } from "./types";
import { ToastItem } from "./Toast";

type ToastContextValue = {
  toasts: Toast[];
  toast: (input: ToastInput) => string;
  success: (title: string, opts?: Omit<ToastInput, "title" | "variant">) => string;
  error: (title: string, opts?: Omit<ToastInput, "title" | "variant">) => string;
  warning: (title: string, opts?: Omit<ToastInput, "title" | "variant">) => string;
  info: (title: string, opts?: Omit<ToastInput, "title" | "variant">) => string;
  dismiss: (id: string) => void;
  clearAll: () => void;
  /** imperative alias for toast */
  push: (input: ToastInput) => string;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;
function genId() {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4200,
  error: 6500,
  warning: 5500,
  info: 4500,
  default: 4000,
};

function normalize(input: ToastInput): Toast {
  const variant = input.variant ?? "default";
  const duration = input.duration === undefined ? DEFAULT_DURATION[variant] : input.duration;
  return {
    id: input.id ?? genId(),
    title: input.title,
    description: input.description,
    variant,
    icon: input.icon === undefined ? false : input.icon,
    duration,
    dismissible: input.dismissible ?? true,
    showProgress: input.showProgress ?? duration !== false,
    actions: input.actions ?? [],
    onClick: input.onClick,
    onDismiss: input.onDismiss,
    debug: input.debug,
    createdAt: Date.now(),
  };
}

export function ToastProvider({ children, maxVisible = 5 }: { children: ReactNode; maxVisible?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());
  const remaining = useRef<Map<string, number>>(new Map());
  const startedAt = useRef<Map<string, number>>(new Map());
  const paused = useRef<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const raf = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    const t = toasts.find((x) => x.id === id);
    t?.onDismiss?.();
    setToasts((prev) => prev.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    remaining.current.delete(id);
    startedAt.current.delete(id);
    paused.current.delete(id);
    setProgress((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }, [toasts]);

  const schedule = useCallback((toast: Toast) => {
    if (toast.duration === false) return;
    remaining.current.set(toast.id, toast.duration);
    startedAt.current.set(toast.id, Date.now());
    const id = window.setTimeout(() => dismiss(toast.id), toast.duration);
    timers.current.set(toast.id, id);
  }, [dismiss]);

  const push = useCallback((input: ToastInput) => {
    const toast = normalize(input);
    // dedupe by id if provided: replace
    setToasts((prev) => {
      const exists = prev.find((t) => t.id === toast.id);
      if (exists) return prev.map((t) => (t.id === toast.id ? toast : t));
      const next = [toast, ...prev];
      if (next.length > maxVisible) return next.slice(0, maxVisible);
      return next;
    });
    // schedule after state commit (next tick)
    window.setTimeout(() => schedule(toast), 0);
    return toast.id;
  }, [maxVisible, schedule]);

  // convenience
  const success = useCallback((title: string, opts?: Omit<ToastInput, "title" | "variant">) => push({ ...opts, title, variant: "success" }), [push]);
  const errorFn = useCallback((title: string, opts?: Omit<ToastInput, "title" | "variant">) => push({ ...opts, title, variant: "error" }), [push]);
  const warning = useCallback((title: string, opts?: Omit<ToastInput, "title" | "variant">) => push({ ...opts, title, variant: "warning" }), [push]);
  const info = useCallback((title: string, opts?: Omit<ToastInput, "title" | "variant">) => push({ ...opts, title, variant: "info" }), [push]);

  const clearAll = useCallback(() => {
    for (const id of timers.current.values()) window.clearTimeout(id);
    timers.current.clear();
    remaining.current.clear();
    startedAt.current.clear();
    paused.current.clear();
    setToasts([]);
    setProgress({});
  }, []);

  const pause = useCallback((id: string) => {
    if (paused.current.has(id)) return;
    paused.current.add(id);
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    const tot = remaining.current.get(id);
    const start = startedAt.current.get(id);
    if (tot !== undefined && start !== undefined) {
      const elapsed = Date.now() - start;
      remaining.current.set(id, Math.max(0, tot - elapsed));
    }
  }, []);

  const resume = useCallback((id: string) => {
    if (!paused.current.has(id)) return;
    paused.current.delete(id);
    const rem = remaining.current.get(id);
    if (rem === undefined || rem === false as unknown as number) return;
    startedAt.current.set(id, Date.now());
    const timer = window.setTimeout(() => dismiss(id), rem);
    timers.current.set(id, timer);
  }, [dismiss]);

  // progress ticker
  useEffect(() => {
    if (toasts.length === 0) {
      if (raf.current) cancelAnimationFrame(raf.current);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const next: Record<string, number> = {};
      for (const t of toasts) {
        if (t.duration === false || paused.current.has(t.id)) {
          // keep last value
          next[t.id] = progress[t.id] ?? 1;
          continue;
        }
        const total = t.duration;
        const rem = remaining.current.get(t.id);
        const start = startedAt.current.get(t.id);
        if (rem === undefined || start === undefined) {
          next[t.id] = 1;
          continue;
        }
        // if paused, rem is already adjusted; else compute remaining
        const elapsed = paused.current.has(t.id) ? 0 : now - start;
        const currentRem = Math.max(0, rem - elapsed);
        next[t.id] = currentRem / total;
      }
      setProgress(next);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [toasts, progress]);

  // dismiss on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && toasts.length) {
        dismiss(toasts[0]!.id);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [toasts, dismiss]);

  const ctx: ToastContextValue = {
    toasts,
    toast: push,
    success,
    error: errorFn,
    warning,
    info,
    dismiss,
    clearAll,
    push,
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            aria-relevant="additions"
            className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-end gap-2 px-3 sm:items-end sm:px-4"
            style={{ top: "max(16px, env(safe-area-inset-top, 0px))" }}
          >
            <div className="flex w-full max-w-[420px] flex-col gap-2">
              <AnimatePresence initial={false}>
                {toasts.map((t) => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, x: 24, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-auto"
                  >
                    <ToastItem
                      toast={t}
                      onDismiss={() => dismiss(t.id)}
                      onPause={() => pause(t.id)}
                      onResume={() => resume(t.id)}
                      progress={progress[t.id] ?? 1}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
