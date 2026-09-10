import { ieeArtSrc } from "@/components/iee/art";
import { IeeIcon } from "@/components/iee/IeeIcon";
import type { Polarity } from "@/lib/engine";

export type TileSize = "sm" | "md" | "lg";

/**
 * The artwork, as the first thing a reader sees.
 *
 * `IeeIcon` stays the inline 16-20px glyph for the *tuning* surfaces — pool
 * rows, the drop table — where a dozen entries are scanned to adjust numbers.
 * This is for the *discovery* surfaces: the wheel result, the inventory, the
 * status panel, the rules page, the catalog card. There the picture is what
 * the entry will be remembered by, so it leads and the text follows.
 *
 * ## Square is a thing you carry, hex is a state you are in
 *
 * The catalog pairs items and effects almost one to one — `lead_weights`
 * grants `heavy_boots`, `lodestone` grants `tailwind`, `spare_die` grants
 * `lucky`, `jinx` grants `unlucky`. Any "heavy object" drawn for one reads
 * identically as the other, so no amount of care from the artist can carry
 * that distinction: it has to be structural.
 *
 * Items take the 4px clipped square every other control in the app uses — the
 * inventory-slot idiom. Effects take a hexagon, which is deliberately the one
 * shape in the interface that is *not* the house cut, because its whole job is
 * to not look like a slot. It stays angular, so `DESIGN.md` §1 still holds;
 * the exception is recorded there.
 *
 * The frame also carries polarity, so a debuff reads as a debuff before a word
 * is read.
 */

const SIZE: Record<TileSize, { box: string; icon: string }> = {
  sm: { box: "size-10", icon: "size-5" },
  md: { box: "size-14", icon: "size-7" },
  lg: { box: "size-24", icon: "size-12" },
};

export const SQUARE_CLIP =
  "[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]";
export const HEX_CLIP = "[clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]";

export function IeeArtTile({
  entryKey,
  kind,
  heroIcon,
  polarity,
  size = "md",
  className = "",
}: {
  entryKey?: string | null;
  kind: "item" | "effect";
  heroIcon?: string | null;
  /** Effects only — tints the frame so a debuff reads before the text does. */
  polarity?: Polarity;
  size?: TileSize;
  className?: string;
}) {
  const art = ieeArtSrc(kind, entryKey);
  const s = SIZE[size];
  const isEffect = kind === "effect";
  const clip = isEffect ? HEX_CLIP : SQUARE_CLIP;

  const frame = isEffect
    ? polarity === "negative"
      ? "border-danger/60 bg-danger/15 text-danger"
      : "border-military/60 bg-military/15 text-military"
    : "border-amber/40 bg-amber/10 text-amber";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border ${clip} ${s.box} ${frame} ${className}`}
      aria-hidden
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          loading="lazy"
          decoding="async"
          className={`size-full object-cover ${clip}`}
        />
      ) : (
        <IeeIcon heroIcon={heroIcon} kind={kind} className={s.icon} />
      )}
    </span>
  );
}
