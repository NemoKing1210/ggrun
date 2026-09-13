import { avatarEmojiFor, avatarTintFor } from "@/lib/shared/avatar";
import { cn } from "@/lib/shared/utils/cn";

type Props = {
  /** Stable per-user seed — user id when available, otherwise username. */
  seed: string | null | undefined;
  /** Accessible name (`displayName ?? username`). Announced to screen readers. */
  name: string;
  /** Box layout owned by the caller: sizing, borders, ring, clip. Background and typography are owned by the fallback. */
  className?: string;
  /** Glyph size, e.g. `"text-base"`. Scale ~1.5× of the old two-letter initials for the same box. */
  emojiClassName?: string;
};

/**
 * Emoji avatar shown when the user has no uploaded picture.
 * Deterministic per `seed` — the same user always gets the same glyph + tint.
 */
export function AvatarFallback({ seed, name, className, emojiClassName }: Props) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br leading-none select-none",
        avatarTintFor(seed),
        className,
      )}
    >
      <span aria-hidden className={cn("translate-y-[-5%] leading-none", emojiClassName)}>
        {avatarEmojiFor(seed)}
      </span>
    </span>
  );
}
