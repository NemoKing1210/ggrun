import { ClockIcon } from "@heroicons/react/24/outline";

import { EntryDescription } from "@/components/iee/EntryDescription";

/*
 * How a held item or an active status looks to its player — the dashboard's
 * inventory and status panels, and the constructor's preview of an entry
 * being built, which has to look exactly like what a player will get.
 */

/** Cards use the 6px cut, per docs/DESIGN.md §2. */
const CARD_CLIP =
  "[clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]";

/**
 * Remaining duration as a segmented bar.
 *
 * A bare "1 roll left" tells you the number but not the shape of it — one of
 * one reads the same as one of five, and those are very different situations
 * to be in. The total is the season's duration for the entry, so the bar shows
 * spent against remaining and the number stops being the only signal.
 *
 * Falls back to the plain string when there is no total to divide by, or when
 * the total is long enough that pips would turn into a hairline comb.
 */
export function DurationMeter({
  left,
  total,
  label,
  tone,
}: {
  left: number;
  total: number | null;
  label: string;
  tone: "danger" | "military" | "amber";
}) {
  const fill = tone === "danger" ? "bg-danger" : tone === "military" ? "bg-military" : "bg-amber";
  const showPips = total !== null && total > 0 && total <= 8 && left <= total;

  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <ClockIcon className="size-3.5 shrink-0 text-dim" aria-hidden />
      {showPips ? (
        <span className="inline-flex items-center gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-1.5 border ${
                i < left ? `${fill} border-transparent` : "border-dim/40 bg-transparent"
              }`}
            />
          ))}
        </span>
      ) : null}
      <span className="ammo-counter text-xs text-zinc-300">{label}</span>
    </span>
  );
}

/** A meta fact in a card footer: small stamped label with its glyph. */
export function CardMeta({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

/** The shared card shell: accent stripe, artwork, header, description, footer. */
export function PlayerEntryCard({
  tile,
  title,
  badge,
  description,
  flavor,
  footer,
  stripe,
  frame,
  index,
}: {
  tile: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  description: string;
  /** The entry's hand-written flavor line, under what it does. */
  flavor?: string | null;
  footer: React.ReactNode;
  stripe: string;
  frame: string;
  /** Stagger position for the mount entrance; omits the delay when undefined. */
  index?: number;
}) {
  return (
    <li
      style={index === undefined ? undefined : { animationDelay: `${Math.min(index * 30, 240)}ms` }}
      className={`animate-hud-rise relative border ${frame} ${CARD_CLIP}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${stripe}`} aria-hidden />
      <div className="flex items-start gap-3 p-3 pl-4">
        {tile}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-base uppercase leading-tight tracking-wider text-zinc-100">
              {title}
            </h3>
            {badge}
          </div>
          <EntryDescription>{description}</EntryDescription>
          {flavor ? <p className="mt-1 text-sm italic leading-relaxed text-zinc-400">{flavor}</p> : null}
          {footer ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-2">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
