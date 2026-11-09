"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { IeeFilterBar, type ChipGroup } from "@/components/admin/IeeFilterBar";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { matchesCatalogFilter, type EntryView, type Polarity, type Rarity } from "@/lib/engine";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
const POLARITIES: Polarity[] = ["positive", "negative"];

const polarityVariant = (p: Polarity) => (p === "positive" ? "emerald" : "danger");
const rarityVariant = (r: Rarity) =>
  r === "legendary" ? "amber" : r === "epic" ? "violet" : r === "rare" ? "sky" : "dim";

/**
 * The catalog, as a card grid.
 *
 * It was a `min-w-[52rem]` table that scrolled sideways for six and eight rows
 * on a page that was otherwise mostly empty, with the description capped at
 * `max-w-md` while the viewport had room to spare. Fourteen entries are a
 * gallery, not a spreadsheet.
 *
 * A client component, and unlike the dashboard and the season editor — which
 * already ship the engine catalog to the browser — it is not free here: this
 * page had no client catalog before, and `next build` puts it at 13.6 kB /
 * 315 kB first load against a 224 kB shared baseline. That is the trade being
 * made, on a staff-only page, for a filter that answers a keystroke instead of
 * a round-trip. If the size ever matters more than the responsiveness, the
 * same filter runs server-side off `?q=` with no other change, because the
 * predicate lives in the engine rather than in this file.
 *
 * The entries arrive from the server as views (spec §8) — the client never
 * holds the compiler — together with `usage`, which only the database knows.
 */
export function IeeCatalogGrid({
  entries,
  usage,
}: {
  entries: readonly EntryView[];
  /** Seasons that attach each entry, by entry id. */
  usage: Record<string, number>;
}) {
  const { t, locale } = useI18n();
  const a = t.iee.admin;
  const f = a.filters;

  const [query, setQuery] = useState("");
  const [polarity, setPolarity] = useState("all");
  const [rarity, setRarity] = useState("all");

  // The predicate is `matchesCatalogFilter` in the engine, not a local copy:
  // the season wizard filters the same entries, and two lists that disagree
  // about what "matches" means is the bug this avoids.
  const shown = useMemo(
    () =>
      entries.filter((view) =>
        matchesCatalogFilter(
          {
            key: view.key,
            name: view.name[locale],
            description: view.ruleText[locale],
            polarity: view.polarity,
            rarity: view.rarity,
          },
          { query, polarity: polarity as Polarity | "all", rarity: rarity as Rarity | "all" },
        ),
      ),
    [entries, query, polarity, rarity, locale],
  );

  const groups: ChipGroup[] = [
    {
      id: "polarity",
      label: f.polarity,
      value: polarity,
      onChange: setPolarity,
      options: POLARITIES.map((p) => ({ value: p, label: t.iee.polarity[p] })),
    },
    {
      id: "rarity",
      label: f.rarity,
      value: rarity,
      onChange: setRarity,
      options: RARITIES.map((r) => ({ value: r, label: t.iee.rarity[r] })),
    },
  ];

  const reset = () => {
    setQuery("");
    setPolarity("all");
    setRarity("all");
  };

  return (
    <>
      <IeeFilterBar
        query={query}
        onQuery={setQuery}
        groups={groups}
        shown={shown.length}
        total={entries.length}
        onReset={reset}
      />

      {shown.length === 0 ? (
        <div className="hud-card p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-widest text-dim">{f.empty}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((view) => (
            <EntryCard key={view.entryId} view={view} t={t} locale={locale} usage={usage[view.entryId] ?? 0} />
          ))}
        </div>
      )}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-display text-[10px] uppercase tracking-widest text-dim">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-zinc-300">{children}</dd>
    </div>
  );
}

function EntryCard({
  view,
  t,
  locale,
  usage,
}: {
  view: EntryView;
  t: Dictionary;
  locale: Locale;
  usage: number;
}) {
  const a = t.iee.admin;
  const hookLabels = a.hooks as Record<string, string>;

  const duration = (d: NonNullable<EntryView["duration"]>): string => {
    const count = String(d.count ?? "");
    switch (d.unit) {
      case "rolls":
        return format(a.durationRolls, { count });
      case "triggers":
        return format(a.durationCharges, { count });
      case "moves":
        return format(a.durationMoves, { count });
      case "passed_games":
        return format(a.durationPassed, { count });
      case "next_game":
        return a.durationNextGame;
      case "instant":
        return a.durationInstant;
      default:
        return a.durationPermanent;
    }
  };

  return (
    <article className="hud-card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <IeeArtTile
          entryKey={view.key}
          kind={view.kind}
          glyph={view.glyph}
          art={view.art}
          polarity={view.polarity}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg uppercase leading-tight tracking-wider text-zinc-100">
            {view.name[locale]}
          </h3>
          <p className="font-mono text-[11px] text-dim">{view.key}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={polarityVariant(view.polarity)}>{t.iee.polarity[view.polarity]}</Badge>
            <Badge variant={rarityVariant(view.rarity)}>{t.iee.rarity[view.rarity]}</Badge>
          </div>
        </div>
      </div>

      <EntryDescription className="!mt-0 flex-1">{view.ruleText[locale]}</EntryDescription>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#2a2a22] pt-3">
        {view.usage ? (
          <>
            <Fact label={a.columns.usage}>{a.usageMode[view.usage.activation]}</Fact>
            {/* Only an active item is used: when and on whom mean nothing for the others. */}
            {view.usage.activation === "active" ? (
              <>
                <Fact label={a.columns.target}>{a.target[view.usage.target]}</Fact>
                <Fact label={a.columns.window}>{a.window[view.usage.window]}</Fact>
              </>
            ) : null}
            {/* Just the number: the `charges` string carries its own noun
                ("Зарядов: 1"), which under a "Charges" label reads as a
                stutter. A bare count needs no translation; a passive item
                without charges works for good. */}
            <Fact label={a.columns.charges}>{view.usage.charges ?? "∞"}</Fact>
          </>
        ) : (
          <>
            {view.duration ? <Fact label={a.columns.duration}>{duration(view.duration)}</Fact> : null}
            {view.stacking ? <Fact label={a.columns.stacking}>{a.stacking[view.stacking]}</Fact> : null}
            <div className="col-span-2 min-w-0">
              <dt className="font-display text-[10px] uppercase tracking-widest text-dim">
                {a.columns.hooks}
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {view.triggers.map((trigger) => (
                  <Badge key={trigger} variant="neutral" title={trigger}>
                    {hookLabels[trigger] ?? trigger}
                  </Badge>
                ))}
              </dd>
            </div>
          </>
        )}
      </dl>

      <p className="border-t border-[#2a2a22] pt-2">
        {usage > 0 ? (
          <span className="font-mono text-sm text-amber">
            {format(a.usedInSeasons, { count: String(usage) })}
          </span>
        ) : (
          <span className="font-mono text-sm text-dim">{a.usedInNone}</span>
        )}
      </p>
    </article>
  );
}
