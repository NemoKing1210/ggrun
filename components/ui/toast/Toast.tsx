"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { Toast } from "./types";

const VARIANT_CFG = {
  success: {
    border: "border-military/60",
    bar: "bg-military",
    iconWrap: "bg-military text-black border-military/50",
    Icon: CheckCircleIcon,
    progress: "bg-military",
    label: "SUCCESS",
    labelText: "text-military",
  },
  error: {
    border: "border-danger/60",
    bar: "bg-danger",
    iconWrap: "bg-danger text-white border-danger/50",
    Icon: XCircleIcon,
    progress: "bg-danger",
    label: "ERROR",
    labelText: "text-danger",
  },
  warning: {
    border: "border-amber/60",
    bar: "bg-amber",
    iconWrap: "bg-amber text-black border-amber/50",
    Icon: ExclamationTriangleIcon,
    progress: "bg-amber",
    label: "WARNING",
    labelText: "text-amber",
  },
  info: {
    border: "border-sky-600/60",
    bar: "bg-sky-500",
    iconWrap: "bg-sky-500 text-white border-sky-500/50",
    Icon: InformationCircleIcon,
    progress: "bg-sky-500",
    label: "INFO",
    labelText: "text-sky-400",
  },
  default: {
    border: "border-zinc-700",
    bar: "bg-zinc-600",
    iconWrap: "bg-[#232323] text-zinc-300 border-zinc-700",
    Icon: InformationCircleIcon,
    progress: "bg-amber",
    label: "NOTE",
    labelText: "text-dim",
  },
} as const;

export function ToastItem({
  toast,
  onDismiss,
  onPause,
  onResume,
  progress,
}: {
  toast: Toast;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
  progress: number; // 0..1
}) {
  const cfg = VARIANT_CFG[toast.variant];
  const [debugOpen, setDebugOpen] = useState(false);

  const hasActions = toast.actions.length > 0;
  const clickable = Boolean(toast.onClick);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
      onClick={toast.onClick}
      className={`group relative flex w-full overflow-hidden border bg-[#0f0f0f] shadow-[0_8px_28px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${cfg.border} ${clickable ? "cursor-pointer hover:brightness-[1.06]" : ""} transition-[filter,border-color]`}
    >
      {/* left accent bar */}
      <div className={`w-[3px] shrink-0 ${cfg.bar}`} aria-hidden />

      <div className="flex min-w-0 flex-1 gap-3 px-3 py-3">
        {/* icon */}
        {toast.icon !== false && (
          <span
            className={`inline-flex size-8 shrink-0 items-center justify-center border [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${cfg.iconWrap}`}
            aria-hidden
          >
            {toast.icon ? (
              toast.icon
            ) : (
              <cfg.Icon className="size-4" />
            )}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${cfg.labelText}`}>{cfg.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">· {new Date(toast.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              </div>
              <h4 className="mt-0.5 font-display text-sm uppercase tracking-wider leading-tight text-zinc-100">{toast.title}</h4>
              {toast.description && (
                <p className="mt-1 text-sm leading-snug text-zinc-400 line-clamp-4">{toast.description}</p>
              )}
            </div>

            {toast.dismissible && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                aria-label="Dismiss"
                className="inline-flex size-7 shrink-0 items-center justify-center border border-zinc-700 bg-[#1a1a1a] text-zinc-400 hover:border-amber/50 hover:text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] transition-colors"
              >
                <XMarkIcon className="size-3.5" />
              </button>
            )}
          </div>

          {hasActions && (
            <div className="mt-3 flex flex-wrap gap-2">
              {toast.actions.map((a, i) => (
                <button
                  key={`${a.label}-${i}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    a.onClick();
                  }}
                  className={
                    a.variant === "primary"
                      ? "hud-btn hud-btn-primary !px-3 !py-1.5 text-xs"
                      : a.variant === "danger"
                        ? "hud-btn hud-btn-danger !px-3 !py-1.5 text-xs"
                        : "hud-btn !px-3 !py-1.5 text-xs !bg-[#1c1c1c] !border-zinc-700 hover:!border-amber/40 hover:!text-amber"
                  }
                >
                  {a.icon ? <span className="mr-1.5 inline-flex">{a.icon}</span> : null}
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {toast.debug && (
            <div className="mt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDebugOpen((v) => !v);
                }}
                className="font-mono text-[10px] uppercase tracking-widest text-dim hover:text-amber underline decoration-dotted underline-offset-4"
              >
                {debugOpen ? "hide debug" : "show debug"}
              </button>
              {debugOpen && (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words border border-amber/20 bg-black/40 p-2 font-mono text-[11px] leading-snug text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  {toast.debug}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* progress bar */}
      {toast.showProgress && toast.duration !== false && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-black/40">
          <div
            className={`h-full ${cfg.progress} transition-none`}
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
