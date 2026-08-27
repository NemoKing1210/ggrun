"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export function Range({ className, ...props }: Props) {
  return (
    <input
      type="range"
      className={cn(
        "hud-range w-full h-2 appearance-none bg-[#1a1a1a] border border-[#3d3d34] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]",
        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--hud-amber-border)] [&::-webkit-slider-thumb]:[clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgb(var(--hud-amber-glow)/0.4)]",
        "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:bg-amber [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--hud-amber-border)] [&::-moz-range-thumb]:rounded-none",
        "focus:outline-none focus:border-amber",
        className,
      )}
      {...props}
    />
  );
}
