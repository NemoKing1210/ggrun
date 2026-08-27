"use client";

import * as React from "react";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  variant?: "default" | "danger" | "military";
  size?: "sm" | "md";
};

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  variant = "default",
  size = "md",
}: SwitchProps) {
  // Track like hud-btn: beveled square, clipped corner, inset shadows
  const trackClip = size === "sm" ? "[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" : "[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]";
  const thumbClip = "[clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]";

  const trackVariant =
    variant === "danger"
      ? checked
        ? "bg-danger border-[#8a2817] shadow-[0_0_10px_rgba(176,52,31,0.55),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-2px_0_rgba(0,0,0,0.35)]"
        : "bg-[#33332b] border-danger/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-2px_0_rgba(0,0,0,0.35)]"
      : variant === "military"
        ? checked
          ? "bg-military border-[#5a6b32] shadow-[0_0_10px_rgba(124,143,74,0.5),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-2px_0_rgba(0,0,0,0.35)]"
          : "bg-[#33332b] border-[#55554a] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-2px_0_rgba(0,0,0,0.35)]"
        : checked
          ? "bg-amber border-[var(--hud-amber-border)] shadow-[0_0_10px_rgb(var(--hud-amber-glow)/0.45),inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.3)]"
          : "bg-[#33332b] border-[#55554a] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-2px_0_rgba(0,0,0,0.35)]";

  const trackSize = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const thumbSize = size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";

  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <label
      htmlFor={id}
      className={`group flex items-start gap-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} select-none`}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex shrink-0 items-center border transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1b1a] active:brightness-90 ${trackClip} ${trackSize} ${trackVariant}`}
      >
        {/* hazard stripe overlay when ON */}
        <span
          aria-hidden
          className={`absolute inset-0 pointer-events-none transition-opacity ${checked ? "opacity-[0.10]" : "opacity-0"} ${trackClip}`}
          style={{
            backgroundImage:
              variant === "danger"
                ? "repeating-linear-gradient(45deg, transparent 0 6px, #fff 6px 8px)"
                : checked
                  ? "repeating-linear-gradient(45deg, transparent 0 6px, #000 6px 7px)"
                  : undefined,
          }}
        />
        {/* square thumb, also beveled like button */}
        <span
          className={`inline-block transform bg-[#e6e1d3] border border-[#9a958a] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.5)] transition-transform duration-150 ease-out ${thumbClip} ${thumbSize} ${
            checked ? (size === "sm" ? "translate-x-[17px]" : "translate-x-[20px]") : "translate-x-[2px]"
          }`}
        />
        {/* inner highlight line on track top edge */}
        <span aria-hidden className="pointer-events-none absolute inset-x-[1px] top-[1px] h-[1px] bg-white/10" />
      </button>
      <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        <span
          className={`text-sm leading-none font-medium tracking-wide transition-colors font-display uppercase ${
            checked
              ? variant === "danger"
                ? "text-danger"
                : variant === "military"
                  ? "text-military"
                  : "text-amber"
              : "text-zinc-300 group-hover:text-zinc-100"
          }`}
        >
          {label}
        </span>
        {description ? <span className="text-xs leading-snug text-zinc-500">{description}</span> : null}
      </span>
    </label>
  );
}
