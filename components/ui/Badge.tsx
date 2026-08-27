"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

type Variant = "amber" | "military" | "danger" | "dim" | "sky" | "violet" | "emerald" | "neutral";
type Size = "sm" | "md";

export function Badge({
  variant = "neutral",
  size = "sm",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant; size?: Size }) {
  const variants: Record<Variant, string> = {
    amber: "bg-amber text-black border-amber",
    military: "bg-military text-black border-military",
    danger: "bg-danger text-[#ffe8de] border-danger",
    dim: "bg-[#2a2a22] text-zinc-400 border-[#3d3d34]",
    sky: "bg-sky-500 text-black border-sky-400",
    violet: "bg-violet-500 text-white border-violet-400",
    emerald: "bg-emerald-500 text-black border-emerald-400",
    neutral: "bg-[#2a2a22] text-zinc-300 border-[#3d3d34]",
  };
  const sizes: Record<Size, string> = {
    sm: "px-2 py-0.5 text-[11px] tracking-widest",
    md: "px-2.5 py-1 text-xs tracking-wider",
  };
  return (
    <span
      className={cn(
        "hud-badge inline-flex items-center border font-display uppercase [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
