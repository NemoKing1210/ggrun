"use client";

import * as React from "react";

import { cn } from "@/lib/shared/utils/cn";

type Props = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ className, invalid, ...props }: Props) {
  return (
    <input
      className={cn(
        "hud-input",
        "w-full bg-[#1a1a1a] border border-[#3d3d34] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500",
        "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber/30",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-colors duration-150",
        "[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]",
        invalid && "border-danger focus:border-danger focus:ring-danger/30",
        className,
      )}
      {...props}
    />
  );
}
