"use client";

import * as React from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export function Select({ className, children, invalid, ...props }: Props) {
  return (
    <div className="relative">
      <select
        className={cn(
          "hud-select",
          "w-full appearance-none bg-[#1a1a1a] border border-[#3d3d34] px-3 py-2 pr-8 text-sm text-zinc-100",
          "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber/30",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors duration-150",
          "[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]",
          invalid && "border-danger focus:border-danger focus:ring-danger/30",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {/* HUD arrow */}
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-amber/70">
        <ChevronDownIcon className="h-4 w-4" aria-hidden />
      </span>
    </div>
  );
}
