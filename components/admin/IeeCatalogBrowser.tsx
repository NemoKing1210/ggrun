"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { IeeFilterBar, type ChipGroup } from "@/components/admin/IeeFilterBar";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  listEffects,
  listItems,
  matchesCatalogFilter,
  type EffectDef,
  type ItemDef,
  type Polarity,
  type Rarity,
} from "@/lib/engine";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { dictText } from "@/lib/i18n/dict-text";

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
 * Only `usage` comes from the server, because only the database knows it.
 */
export function IeeCatalogGrid({
  kind,
  usage,
}: {
  kind: "items" | "effects";
  usage: Record<string, number>;
}) {
  const { t } = useI18n();
  const a = t.iee.admin;
  const f = a.filters;

  const [query, setQuery] = useState("");
  const [polarity, setPolarity] = useState("all");
  const [rarity, setRarity] = useState("all");

  const defs: Array<ItemDef | EffectDef> = useMemo(
    () => (kind === "items" ? listItems() : listEffects()),
    [kind],
  );

  // The predicate is `matchesCatalogFilter` in the engine, not a local copy:
  // the season wizard filters the same catalog, and two lists that disagree
  // about what "matches" means is the bug this avoids.
  const shown = useMemo(
    () =>
      defs.filter((def) =>
        matchesCatalogFilter(
          {
            key: def.key,
            name: dictText(t, def.i18n.name),
            description: dictText(t, def.i18n.description),
            polarity: def.polarity,
            rarity: def.rarity,
          },
          { query, polarity: polarity as Polarity | "all", rarity: rarity as Rarity | "all" },
        ),
      ),
    [defs, query, polarity, rarity, t],
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
        total={defs.length}
        onReset={reset}
      />

      {shown.length === 0 ? (
        <div className="hud-card p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-widest text-dim">{f.empty}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((def) => (
            <EntryCard key={def.key} def={def} t={t} usage={usage[def.key] ?? 0} />
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
  def,
  t,
  usage,
}: {
  def: ItemDef | EffectDef;
  t: Dictionary;
  usage: number;
}) {
  const a = t.iee.admin;
  const isItem = "usage" in def;

  const duration = (d: EffectDef): string => {
    if (d.duration.kind === "permanent") return a.durationPermanent;
    if (d.duration.kind === "rolls")
      return format(a.durationRolls, { count: String(d.duration.value) });
    return format(a.durationCharges, { count: String(d.duration.value) });
  };

  return (
    <article className="hud-card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <IeeArtTile
          entryKey={def.key}
          kind={isItem ? "item" : "effect"}
          heroIcon={def.heroIcon}
          polarity={def.polarity}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg uppercase leading-tight tracking-wider text-zinc-100">
            {dictText(t, def.i18n.name)}
          </h3>
          <p className="font-mono text-[11px] text-dim">{def.key}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={polarityVariant(def.polarity)}>{t.iee.polarity[def.polarity]}</Badge>
            <Badge variant={rarityVariant(def.rarity)}>{t.iee.rarity[def.rarity]}</Badge>
          </div>
        </div>
      </div>

      <EntryDescription className="!mt-0 flex-1">
        {dictText(t, def.i18n.description)}
      </EntryDescription>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#2a2a22] pt-3">
        {isItem ? (
          <>
            <Fact label={a.columns.usage}>{a.usageMode[def.usage.mode]}</Fact>
            <Fact label={a.columns.target}>{a.target[def.usage.target]}</Fact>
            <Fact label={a.columns.window}>{a.window[def.usage.window]}</Fact>
            {/* Just the number: the `charges` string carries its own noun
                ("Зарядов: 1"), which under a "Charges" label reads as a
                stutter. A bare count needs no translation. */}
            <Fact label={a.columns.charges}>{def.usage.charges}</Fact>
          </>
        ) : (
          <>
            <Fact label={a.columns.duration}>{duration(def)}</Fact>
            <Fact label={a.columns.stacking}>{a.stacking[def.stacking]}</Fact>
            <div className="col-span-2 min-w-0">
              <dt className="font-display text-[10px] uppercase tracking-widest text-dim">
                {a.columns.hooks}
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {(Object.keys(def.hooks) as Array<keyof typeof a.hooks>).map((hook) => (
                  <Badge key={hook} variant="neutral" title={hook}>
                    {a.hooks[hook] ?? hook}
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
