"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckIcon, ScaleIcon } from "@heroicons/react/24/outline";

import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { EntryView, IeeLocaleText } from "@/lib/engine";
import { answerDecisionAction, judgeDecisionAction } from "@/lib/modules/iee/actions";

/** One of the player's bonus items, as a choice offers it — what they hold now. */
export interface DecisionItem {
  id: string;
  view: EntryView;
}

/**
 * A choice an entry put to the player (docs/IEE_CONSTRUCTOR_SPEC.md §7.6):
 * what the picks are — the items that go, or those kept while the rest burn —
 * how many, whether they may give nothing instead, and the default.
 */
export interface DecisionCard {
  id: string;
  name: IeeLocaleText;
  /** The asking entry's rule text, when the season plays it. */
  ruleText: IeeLocaleText | null;
  then: "discard" | "retain";
  count: number;
  orKeep: boolean;
  defaultChoice: { option: string; picks?: string[] };
  /** Judges' tab: whose choice it is. */
  player?: string;
}

const NO_ITEMS: readonly DecisionItem[] = [];

const PICK_CLASS =
  "flex w-full items-center gap-3 border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]";

function DecisionForm({ card, items, mode }: { card: DecisionCard; items: readonly DecisionItem[]; mode: "player" | "judge" }) {
  const { t, locale } = useI18n();
  const d = t.iee.decision;
  const [state, formAction, pending] = useActionState(mode === "judge" ? judgeDecisionAction : answerDecisionAction, {});
  const [picked, setPicked] = useState<string[]>([]);
  // A pick that is no longer held drops out: the list is what the player holds now.
  useEffect(
    () =>
      setPicked((ids) => {
        const kept = ids.filter((id) => items.some((item) => item.id === id));
        return kept.length === ids.length ? ids : kept;
      }),
    [items],
  );

  // With giving nothing beside it, a discard is paid in full; otherwise all there is, up to `count`.
  const need = card.then === "discard" && card.orKeep ? card.count : Math.min(card.count, items.length);
  const enough = card.then === "discard" && card.orKeep ? items.length >= card.count : items.length > 0;
  const toggle = (id: string) =>
    setPicked((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (need === 1) return [id];
      return ids.length < need ? [...ids, id] : ids;
    });

  const many = card.count > 1 ? "many" : "one";
  const ask =
    card.then === "retain"
      ? d.retain[many]
      : card.orKeep
        ? d.discardOrKeep[many]
        : d.discard[many];
  const nameOf = (id: string) => items.find((item) => item.id === id)?.view.name[locale];
  const defaultNames = (card.defaultChoice.picks ?? []).map(nameOf).filter((n): n is string => Boolean(n));
  const defaultWhat =
    card.defaultChoice.option === "endure"
      ? d.defaultEndure
      : card.defaultChoice.option === "retain"
        ? format(d.defaultRetain, { items: defaultNames.map((n) => `«${n}»`).join(", ") || "—" })
        : format(d.defaultDiscard, { items: defaultNames.map((n) => `«${n}»`).join(", ") || "—" });

  return (
    <li className="hud-card overflow-hidden p-0">
      <div className="h-1 w-full bg-amber/70" aria-hidden />
      <div className="flex flex-col gap-3 p-3">
        <div>
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-display text-sm uppercase tracking-wide text-amber">{card.name[locale]}</span>
            {card.player ? <Badge variant="dim">{format(d.judgeFor, { player: card.player })}</Badge> : null}
          </p>
          {card.ruleText ? <p className="mt-1 text-[13px] leading-snug text-zinc-400">{card.ruleText[locale]}</p> : null}
        </div>
        <p className="text-sm">{format(ask, { count: String(card.count) })}</p>
        {!enough && !card.orKeep ? <p className="text-xs text-dim">{d.nothingLeft}</p> : null}
        {items.length > 0 ? (
          <ul className="grid gap-1.5 sm:grid-cols-2" role="group" aria-label={ask}>
            {items.map((item) => {
              const on = picked.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={pending || (!on && need > 1 && picked.length >= need)}
                    className={`${PICK_CLASS} ${on ? "border-amber bg-amber/10" : "border-[#3d3d34] bg-[#1a1a1a] hover:border-amber/50"}`}
                    onClick={() => toggle(item.id)}
                  >
                    <IeeArtTile
                      entryKey={item.view.key}
                      kind="item"
                      glyph={item.view.glyph}
                      art={item.view.art}
                      polarity={item.view.polarity}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{item.view.name[locale]}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.iee.rarity[item.view.rarity]}</span>
                    {on ? <CheckIcon className="size-4 shrink-0 text-amber" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {enough ? (
            <form action={formAction}>
              <input type="hidden" name="decisionId" value={card.id} />
              <input type="hidden" name="option" value={card.then} />
              {picked.map((id) => (
                <input key={id} type="hidden" name="picks" value={id} />
              ))}
              <button type="submit" className="hud-btn hud-btn-primary !px-4 !py-1.5 text-xs" disabled={pending || picked.length !== need}>
                {card.then === "retain" ? d.retainButton : d.discardButton}
                {need > 1 ? ` · ${format(d.picked, { picked: String(picked.length), count: String(need) })}` : ""}
              </button>
            </form>
          ) : null}
          {card.orKeep ? (
            <form action={formAction}>
              <input type="hidden" name="decisionId" value={card.id} />
              <input type="hidden" name="option" value="endure" />
              <button type="submit" className="hud-btn !px-4 !py-1.5 text-xs" disabled={pending}>
                {d.endureButton}
              </button>
            </form>
          ) : null}
          {mode === "judge" || (!enough && !card.orKeep) ? (
            <form action={formAction}>
              <input type="hidden" name="decisionId" value={card.id} />
              {mode === "player" ? <input type="hidden" name="option" value={card.then} /> : null}
              <button type="submit" className="hud-btn !px-4 !py-1.5 text-xs" disabled={pending}>
                {d.defaultButton}
              </button>
            </form>
          ) : null}
        </div>
        <p className="font-mono text-[11px] text-dim">{format(d.defaultIs, { what: defaultWhat })}</p>
        {state.error ? (
          <p role="alert" className="text-xs text-danger">
            {state.error}
          </p>
        ) : null}
        <DebugError debug={state.debug} />
      </div>
    </li>
  );
}

/**
 * The choices waiting for a player (spec §7.6), above their inventory — or,
 * in the judges' tab, for a judge to make for them. Every answer is checked
 * again on the server against what the player holds then.
 */
export function DecisionPanel({
  decisions,
  items,
  itemsByDecision,
  mode = "player",
}: {
  decisions: readonly DecisionCard[];
  /** The player's bonus items now. */
  items?: readonly DecisionItem[];
  /** In the judges' tab, each decision's player's items, by decision. */
  itemsByDecision?: Readonly<Record<string, readonly DecisionItem[]>>;
  mode?: "player" | "judge";
}) {
  const { t } = useI18n();
  if (decisions.length === 0) return null;
  return (
    <section className="hud-card animate-hud-rise p-4" aria-label={mode === "judge" ? t.iee.decision.judgeHeading : t.iee.decision.heading}>
      <div className="mb-3 flex items-center gap-2">
        <ScaleIcon className="size-4 text-amber" aria-hidden />
        <h2 className="font-display text-sm uppercase tracking-widest text-amber">
          {mode === "judge" ? t.iee.decision.judgeHeading : t.iee.decision.heading}
        </h2>
        <span className="ammo-counter ml-auto text-xs text-dim">{decisions.length}</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {decisions.map((card) => (
          <DecisionForm key={card.id} card={card} items={itemsByDecision?.[card.id] ?? items ?? NO_ITEMS} mode={mode} />
        ))}
      </ul>
    </section>
  );
}
