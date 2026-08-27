"use client";

import Link from "next/link";

import { cn } from "@/lib/cn";

type Props = {
  name: string;
  src?: string | null;
  href?: string;
  size?: "sm" | "md" | "lg";
  square?: boolean;
  className?: string;
};

/** Square HUD avatar with a fallback monogram. Renders as a Link when `href` is set. */
export function AvatarBadge({
  name,
  src,
  href,
  size = "md",
  square = false,
  className,
}: Props) {
  const dim = size === "lg" ? "size-14" : size === "sm" ? "size-6" : "size-8";
  const font = size === "lg" ? "text-base" : size === "sm" ? "text-[10px]" : "text-xs";
  const clip = square
    ? ""
    : "[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]";

  const inner = (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden bg-raised/60 text-current font-display ring-1 ring-dim/30",
        square ? "" : clip,
        dim,
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span className={cn("font-display tracking-wider", font)}>{name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0">
        {inner}
      </Link>
    );
  }
  return inner;
}