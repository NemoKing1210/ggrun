import {
  ArrowDownTrayIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  BeakerIcon,
  BoltIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

import { ieeArtSrc } from "@/components/iee/art";

type IconType = React.ComponentType<{ className?: string }>;

/**
 * Every catalog entry has declared a `heroIcon` since session 11, when the
 * field was changed from an artwork path to a Heroicon name precisely so that
 * "every entry renders today". Nothing rendered it: until this component,
 * `grep heroIcon components app` returned one hit, and it was for game-pool
 * templates.
 *
 * Named imports rather than `import * as Heroicons`: `next.config.ts` sets
 * `optimizePackageImports: ["@heroicons/react"]`, and a namespace import is
 * exactly the shape that defeats it. Same list-them-explicitly convention as
 * `TEMPLATE_ICONS` in SeasonSettingsForm.
 */
export const IEE_ICONS: Record<string, IconType> = {
  ArrowDownTrayIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  BeakerIcon,
  BoltIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
};

/**
 * Artwork when the entry has it (see `art.ts` for the naming rule), the
 * declared glyph otherwise.
 *
 * A new entry whose icon is missing from the map falls back to a generic glyph
 * rather than to a hole — an invisible row is worse than a plain one. The
 * catalog test is what forces the real icon to be added; this is only the
 * safety net under it.
 */
export function IeeIcon({
  heroIcon,
  kind,
  entryKey,
  alt = "",
  className = "size-4",
}: {
  heroIcon?: string | null;
  kind: "item" | "effect";
  /** Catalog key — needed to find artwork; without it only the glyph shows. */
  entryKey?: string | null;
  alt?: string;
  className?: string;
}) {
  const art = ieeArtSrc(kind, entryKey);
  if (art) {
    return (
      // A plain <img>, deliberately: these are already-optimised square webp
      // files rendered at icon size, so `next/image` would add a
      // `/_next/image` round-trip per entry to re-optimise something that
      // needs none. Matches how the app renders avatars and game covers.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={art}
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        loading="lazy"
        decoding="async"
        className={`${className} object-contain`}
      />
    );
  }
  const Icon = (heroIcon && IEE_ICONS[heroIcon]) || (kind === "item" ? CubeIcon : BoltIcon);
  return <Icon className={className} />;
}
