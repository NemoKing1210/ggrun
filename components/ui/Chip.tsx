"use client";

import * as React from "react";

import { cn } from "@/lib/shared/utils/cn";

type Props = {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "default" | "amber" | "military" | "danger";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
};

export function Chip({ active = false, onClick, children, variant = "default", size = "md", className, disabled }: Props) {
  const base =
    "inline-flex items-center border font-medium transition-colors duration-150 select-none [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]";
  const sizes = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  const press = disabled ? "" : "active:translate-y-px";
  const styles = active
    ? variant === "danger"
      ? "bg-danger text-[#ffe8de] border-danger shadow-[0_0_6px_rgba(176,52,31,0.4)]"
      : variant === "military"
        ? "bg-military text-black border-military"
        : variant === "amber"
          ? "bg-amber text-black border-amber shadow-[0_0_6px_rgb(var(--hud-amber-glow)/0.4)]"
          : "bg-amber text-black border-amber shadow-[0_0_8px_rgb(var(--hud-amber-glow)/0.35)]"
    : "bg-[#1a1a1a] text-zinc-300 border-zinc-700 hover:border-amber/50 hover:text-zinc-100";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(base, sizes, styles, press, disabled && "opacity-50 cursor-not-allowed", className)}
    >
      {children}
    </button>
  );
}
