"use client";

import { FlagIcon } from "@heroicons/react/24/outline";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

/** A text in the reader's language, falling back to Russian — the content language. */
type Localized = { ru: string; en?: string; uk?: string };

export interface RollConditionItem {
  id: string;
  text: Localized;
  /** The entry that added it; null when it reads no name. */
  from: Localized | null;
}

/**
 * What a game must be passed with (docs/IEE_CONSTRUCTOR_SPEC.md §6.17): the
 * completion conditions its holder's entries gave it — on the game card, in
 * the judge's completion request, in the game history.
 */
export function RollConditions({ conditions, compact = false }: { conditions: readonly RollConditionItem[]; compact?: boolean }) {
  const { t, locale } = useI18n();
  const c = t.iee.conditions;
  if (conditions.length === 0) return null;
  const read = (text: Localized) => (text as Record<string, string | undefined>)[locale]?.trim() || text.ru;
  return (
    <section aria-label={c.heading} className={`border-l-2 border-amber/40 bg-amber/[0.04] px-3 py-2 ${compact ? "mt-2" : "mt-3"}`}>
      <p className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-widest text-amber">
        <FlagIcon className="size-3.5" aria-hidden /> {c.heading}
      </p>
      {!compact && <p className="mt-0.5 text-xs text-dim">{c.hint}</p>}
      <ul className="mt-1.5 flex flex-col gap-1">
        {conditions.map((cond) => (
          <li key={cond.id} className="text-sm leading-snug text-zinc-200">
            {read(cond.text)}
            {cond.from ? <span className="ml-1.5 font-mono text-[11px] text-dim">{format(c.from, { entry: read(cond.from) })}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
