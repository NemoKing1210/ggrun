import Link from "next/link";

import { AvatarFallback } from "@/components/ui/AvatarFallback";
import { cn } from "@/lib/shared/utils/cn";

type Props = {
  name: string;
  src?: string | null;
  /** Stable per-user seed (user id preferred). Defaults to `name`. */
  seed?: string | null;
  href?: string;
  size?: "sm" | "md" | "lg";
  square?: boolean;
  className?: string;
};

/** Square HUD avatar with a deterministic emoji fallback. Renders as a Link when `href` is set. */
export function AvatarBadge({
  name,
  src,
  seed,
  href,
  size = "md",
  square = false,
  className,
}: Props) {
  const dim = size === "lg" ? "size-14" : size === "sm" ? "size-6" : "size-8";
  const emojiFont = size === "lg" ? "text-3xl" : size === "sm" ? "text-[15px]" : "text-xl";
  const clip = square
    ? ""
    : "[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]";

  const inner = src ? (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden bg-raised/60 text-current font-display ring-1 ring-dim/30",
        square ? "" : clip,
        dim,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
    </span>
  ) : (
    <AvatarFallback
      seed={seed ?? name}
      name={name}
      className={cn("ring-1 ring-dim/30", square ? "" : clip, dim, className)}
      emojiClassName={emojiFont}
    />
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