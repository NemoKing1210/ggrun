import { getEffect, type EffectBadge } from "@/lib/engine";
import { dictText } from "@/lib/i18n/dict-text";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Compact "what is on this player right now" chips for list surfaces — the
 * leaderboard rows and the board's occupant list.
 *
 * Deliberately not the `Badge` component: that one is `"use client"`, and a
 * leaderboard of thirty players would open thirty client boundaries to render
 * text that never changes. Same HUD treatment, no hydration.
 *
 * Statuses are public. They are already in the feed the moment they land
 * (§8.3: the victim learns who hit them, and everyone else sees it too), so
 * showing them next to a name reveals nothing new — it just spares the reader
 * from reconstructing the feed to understand why a leader stopped moving.
 */
export function EffectBadges({
  badges,
  t,
  max = 3,
  className = "",
}: {
  badges: readonly EffectBadge[];
  t: Dictionary;
  max?: number;
  className?: string;
}) {
  if (badges.length === 0) return null;

  const name = (key: string) => {
    const def = getEffect(key);
    return def ? dictText(t, def.i18n.name) : key;
  };

  const shown = badges.slice(0, max);
  const rest = badges.length - shown.length;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 align-middle ${className}`}>
      {shown.map((badge) => (
        <span
          key={badge.effectKey}
          title={name(badge.effectKey)}
          className={`inline-flex items-center border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${
            badge.polarity === "negative"
              ? "border-danger/50 bg-danger/15 text-danger"
              : "border-military/50 bg-military/15 text-military"
          }`}
        >
          {name(badge.effectKey)}
        </span>
      ))}
      {rest > 0 ? (
        <span
          title={badges.slice(max).map((b) => name(b.effectKey)).join(", ")}
          className="inline-flex items-center border border-dim/30 bg-raised px-1.5 py-0.5 font-mono text-[10px] text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
