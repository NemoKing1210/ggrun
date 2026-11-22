import {
  AdjustmentsHorizontalIcon,
  ArchiveBoxXMarkIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowPathRoundedSquareIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ArrowUturnLeftIcon,
  ArrowsPointingInIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  BanknotesIcon,
  BeakerIcon,
  BoltIcon,
  BookOpenIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  ChevronDoubleUpIcon,
  ClockIcon,
  CpuChipIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DocumentDuplicateIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  EyeDropperIcon,
  EyeSlashIcon,
  FireIcon,
  ForwardIcon,
  FunnelIcon,
  GlobeAltIcon,
  HandRaisedIcon,
  HeartIcon,
  LinkIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MapIcon,
  MapPinIcon,
  NoSymbolIcon,
  PauseCircleIcon,
  PuzzlePieceIcon,
  ScaleIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  Square2StackIcon,
  StarIcon,
  StopCircleIcon,
  TagIcon,
  TrophyIcon,
  ViewColumnsIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";

import { ieeArtSrc } from "@/components/iee/art";
import type { EntryArt } from "@/lib/engine";

type IconType = React.ComponentType<{ className?: string }>;

/**
 * The glyphs an entry may name (spec §12) — exactly the list in
 * `lib/engine/iee/dsl/glyphs.ts`; `IeeIcon.test.tsx` holds the two together,
 * so adding a glyph is one line there and one import here.
 *
 * Named imports rather than `import * as Heroicons`: `next.config.ts` sets
 * `optimizePackageImports: ["@heroicons/react"]`, and a namespace import is
 * exactly the shape that defeats it. Same list-them-explicitly convention as
 * `TEMPLATE_ICONS` in SeasonSettingsForm.
 */
export const IEE_ICONS: Record<string, IconType> = {
  AdjustmentsHorizontalIcon,
  ArchiveBoxXMarkIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowPathRoundedSquareIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ArrowUturnLeftIcon,
  ArrowsPointingInIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  BanknotesIcon,
  BeakerIcon,
  BoltIcon,
  BookOpenIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  ChevronDoubleUpIcon,
  ClockIcon,
  CpuChipIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DocumentDuplicateIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  EyeDropperIcon,
  EyeSlashIcon,
  FireIcon,
  ForwardIcon,
  FunnelIcon,
  GlobeAltIcon,
  HandRaisedIcon,
  HeartIcon,
  LinkIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MapIcon,
  MapPinIcon,
  NoSymbolIcon,
  PauseCircleIcon,
  PuzzlePieceIcon,
  ScaleIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  Square2StackIcon,
  StarIcon,
  StopCircleIcon,
  TagIcon,
  TrophyIcon,
  ViewColumnsIcon,
  ViewfinderCircleIcon,
};

/** Where an entry's picture comes from: an image, or a glyph (null = the kind's). */
export type IconSource = { image: string } | { glyph: string | null };

/**
 * The fallback chain of spec §12: the entry's icon → the artwork shipped in
 * `public/iee` (system pack only) → the entry's glyph → the pack's icon → the
 * kind's glyph.
 *
 * A caller without the entry's `art` (a staff list that only has a key) draws
 * by key as before: shipped artwork, then the glyph. A glyph missing from the
 * map counts as no glyph — an invisible row is worse than a plain one; the
 * publish check is what keeps an entry's glyph on the list, this is only the
 * safety net under it.
 */
export function iconSource({
  kind,
  entryKey,
  glyph,
  art,
}: {
  kind: "item" | "effect";
  entryKey?: string | null;
  glyph?: string | null;
  art?: EntryArt | null;
}): IconSource {
  if (art?.iconUrl) return { image: art.iconUrl };
  const shipped = !art || art.system ? ieeArtSrc(kind, entryKey) : null;
  if (shipped) return { image: shipped };
  if (glyph && IEE_ICONS[glyph]) return { glyph };
  if (art?.packIconUrl) return { image: art.packIconUrl };
  return { glyph: null };
}

/** An entry's picture at icon size — for the tuning surfaces (DESIGN.md). */
export function IeeIcon({
  glyph,
  kind,
  entryKey,
  art,
  alt = "",
  className = "size-4",
}: {
  /** The entry's `glyph` (an `EntryView` field); null = the kind's glyph. */
  glyph?: string | null;
  kind: "item" | "effect";
  /** The entry's key — finds the shipped artwork of a system entry. */
  entryKey?: string | null;
  /** The view's `art`: the entry's and the pack's icons. */
  art?: EntryArt | null;
  alt?: string;
  className?: string;
}) {
  const source = iconSource({ kind, entryKey, glyph, art });
  if ("image" in source) {
    return (
      // A plain <img>, deliberately: these are already-optimised square
      // images rendered at icon size, so `next/image` would add a
      // `/_next/image` round-trip per entry to re-optimise something that
      // needs none. Matches how the app renders avatars and game covers.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.image}
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        loading="lazy"
        decoding="async"
        className={`${className} object-contain`}
      />
    );
  }
  const Icon = (source.glyph && IEE_ICONS[source.glyph]) || (kind === "item" ? CubeIcon : BoltIcon);
  return <Icon className={className} />;
}
