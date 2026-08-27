"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-zinc-500">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
