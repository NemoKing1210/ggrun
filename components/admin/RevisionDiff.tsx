"use client";

import { ArrowRightIcon } from "@heroicons/react/24/outline";

import type { EntryView } from "@/lib/engine";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { RevisionDiff as Diff } from "@/lib/modules/iee/catalog/diff";

function usageText(u: EntryView["usage"], t: Dictionary): string {
  if (!u) return "—";
  return [t.iee.admin.window[u.window], t.iee.admin.target[u.target], format(t.iee.admin.charges, { count: String(u.charges) })].join(" · ");
}

function durationText(d: EntryView["duration"], t: Dictionary): string {
  if (!d) return "—";
  const a = t.iee.admin;
  const count = String(d.count ?? "");
  switch (d.unit) {
    case "rolls":
      return format(a.durationRolls, { count });
    case "moves":
      return format(a.durationMoves, { count });
    case "passed_games":
      return format(a.durationPassed, { count });
    case "triggers":
      return format(a.durationCharges, { count });
    case "next_game":
      return a.durationNextGame;
    case "instant":
      return a.durationInstant;
    default:
      return a.durationPermanent;
  }
}

function Line({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <li className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <span className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{label}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="text-zinc-500 line-through decoration-zinc-600">{from}</span>
        <ArrowRightIcon className="size-3.5 shrink-0 text-amber" aria-hidden />
        <span className="text-zinc-100">{to}</span>
      </span>
    </li>
  );
}

/**
 * What a switch to another revision changes, before the switch (spec §4.2):
 * each field a player meets the entry by, old → new.
 */
export function RevisionDiffView({ diff }: { diff: Diff }) {
  const { t } = useI18n();
  const d = t.iee.stage.diff;
  if (diff.same) return <p className="text-sm text-zinc-400">{d.same}</p>;
  const loc = (l: string) => (t.ieeEditor.locales as Record<string, string>)[l] ?? l;
  return (
    <ul className="flex flex-col gap-1.5">
      {diff.name.map((c) => (
        <Line key={`name-${c.locale}`} label={`${d.name} ${loc(c.locale)}`} from={c.from} to={c.to} />
      ))}
      {diff.ruleText.map((c) => (
        <Line key={`text-${c.locale}`} label={`${d.ruleText} ${loc(c.locale)}`} from={c.from} to={c.to} />
      ))}
      {diff.flavor.map((c) => (
        <Line key={`flavor-${c.locale}`} label={`${d.flavor} ${loc(c.locale)}`} from={c.from || "—"} to={c.to || "—"} />
      ))}
      {diff.character && (
        <Line label={d.character} from={t.ieeEditor.character[diff.character.from]} to={t.ieeEditor.character[diff.character.to]} />
      )}
      {diff.rarity && <Line label={d.rarity} from={t.iee.rarity[diff.rarity.from]} to={t.iee.rarity[diff.rarity.to]} />}
      {diff.usage && <Line label={d.usage} from={usageText(diff.usage.from, t)} to={usageText(diff.usage.to, t)} />}
      {diff.duration && <Line label={d.duration} from={durationText(diff.duration.from, t)} to={durationText(diff.duration.to, t)} />}
      {diff.stacking && (
        <Line
          label={d.stacking}
          from={diff.stacking.from ? t.iee.admin.stacking[diff.stacking.from] : "—"}
          to={diff.stacking.to ? t.iee.admin.stacking[diff.stacking.to] : "—"}
        />
      )}
      {diff.tags && (
        <li className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{d.tags}</span>
          <span className="flex flex-wrap gap-x-2 font-mono text-xs">
            {diff.tags.added.map((tag) => (
              <span key={`+${tag}`} className="text-military">
                +{tag}
              </span>
            ))}
            {diff.tags.removed.map((tag) => (
              <span key={`-${tag}`} className="text-danger">
                −{tag}
              </span>
            ))}
          </span>
        </li>
      )}
      {diff.power && (
        <Line
          label={d.power}
          from={diff.power.from === null ? "—" : diff.power.from.toFixed(1)}
          to={diff.power.to === null ? "—" : diff.power.to.toFixed(1)}
        />
      )}
    </ul>
  );
}
