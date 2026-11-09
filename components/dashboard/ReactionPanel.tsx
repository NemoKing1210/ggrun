"use client";

import { useActionState, useEffect, useState } from "react";
import { BoltIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

import { WheelOverlay, type WheelEntries } from "@/components/game/WheelOverlay";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { EntryView, WheelOutcome } from "@/lib/engine";
import { answerDecisionAction, judgeDecisionAction, type DecisionActionState } from "@/lib/modules/iee/actions";

/**
 * A turn paused for the player's reaction (docs/IEE_CONSTRUCTOR_SPEC.md §7.4):
 * the throw, the move it makes as it stands, and the reaction items it offers.
 */
export interface ReactionWindowCard {
  id: string;
  outcome: "passed" | "dropped";
  faces: number[];
  /** The dice result after the result modifiers. */
  result: number;
  /** Where the player stands, and where the move would end before its cell acts. */
  from: number;
  to: number;
  offers: { instanceId: string; view: EntryView }[];
  /** Judges' tab: whose turn waits. */
  player?: string;
}

const NO_ENTRIES: WheelEntries = {};
const INITIAL: DecisionActionState = {};

function WindowCard({
  card,
  mode,
  onWheel,
}: {
  card: ReactionWindowCard;
  mode: "player" | "judge";
  onWheel: (wheel: WheelOutcome) => void;
}) {
  const { t, locale } = useI18n();
  const r = t.iee.reaction;
  const [state, formAction, pending] = useActionState(mode === "judge" ? judgeDecisionAction : answerDecisionAction, INITIAL);
  // The landing the answer played spun its wheel already: the overlay shows what it gave.
  useEffect(() => {
    if (state.wheel && state.wheel.kind !== "fallback") onWheel(state.wheel);
  }, [state.wheel, onWheel]);

  const move = card.to === card.from ? r.moveNone : card.to > card.from ? r.moveForward : r.moveBack;
  return (
    <li className="hud-card overflow-hidden p-0">
      <div className="h-1 w-full bg-amber/70" aria-hidden />
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={card.outcome === "passed" ? "military" : "danger"}>{card.outcome === "passed" ? r.passed : r.dropped}</Badge>
          {card.player ? <Badge variant="dim">{format(t.iee.decision.judgeFor, { player: card.player })}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label={format(r.shown, { faces: card.faces.join(" + "), result: String(card.result) })}>
          {card.faces.map((face, i) => (
            <span
              key={`${i}-${face}`}
              className="ammo-counter flex h-10 w-10 items-center justify-center border border-amber bg-amber/10 text-lg text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              {face}
            </span>
          ))}
          <span className="font-mono text-xs text-dim">{format(r.shown, { faces: card.faces.join(" + "), result: String(card.result) })}</span>
        </div>
        <p className="text-sm">{format(move, { from: String(card.from), to: String(card.to) })}</p>
        <p className="text-xs text-dim">{mode === "judge" ? r.judgeHint : r.hint}</p>
        {mode === "player" && card.offers.length > 0 ? (
          <ul className="grid gap-1.5 sm:grid-cols-2" aria-label={r.heading}>
            {card.offers.map((offer) => (
              <li key={offer.instanceId} className="flex items-center gap-3 border border-[#3d3d34] bg-[#1a1a1a] p-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                <IeeArtTile
                  entryKey={offer.view.key}
                  kind="item"
                  glyph={offer.view.glyph}
                  art={offer.view.art}
                  polarity={offer.view.polarity}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{offer.view.name[locale]}</span>
                  <span className="block text-[12px] leading-snug text-zinc-400">{offer.view.ruleText[locale]}</span>
                </span>
                <form action={formAction}>
                  <input type="hidden" name="decisionId" value={card.id} />
                  <input type="hidden" name="option" value="react" />
                  <input type="hidden" name="picks" value={offer.instanceId} />
                  <button
                    type="submit"
                    className="hud-btn hud-btn-primary !px-3 !py-1 text-xs"
                    disabled={pending}
                    aria-label={`${r.useButton}: ${offer.view.name[locale]}`}
                  >
                    {r.useButton}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={formAction}>
          <input type="hidden" name="decisionId" value={card.id} />
          <input type="hidden" name="option" value="accept" />
          <button type="submit" className="hud-btn inline-flex items-center gap-1.5 !px-4 !py-1.5 text-xs" disabled={pending}>
            <CheckCircleIcon className="size-4" aria-hidden />
            {mode === "judge" ? r.judgeAccept : r.acceptButton}
          </button>
        </form>
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
 * The player's turn paused after the dice (spec §7.4): their throw and the
 * reaction items it offers, above the game card — or, in the judges' tab, the
 * windows a judge may accept for their players. Stays mounted when the window
 * closes, so the wheel of the landing the answer played can still show.
 */
export function ReactionPanel({
  windows,
  wheelEntries = NO_ENTRIES,
  mode = "player",
}: {
  windows: readonly ReactionWindowCard[];
  wheelEntries?: WheelEntries;
  mode?: "player" | "judge";
}) {
  const { t } = useI18n();
  const r = t.iee.reaction;
  const [wheel, setWheel] = useState<WheelOutcome | null>(null);
  return (
    <>
      {windows.length > 0 ? (
        <section className="hud-card animate-hud-rise p-4" aria-label={mode === "judge" ? r.judgeHeading : r.heading}>
          <div className="mb-3 flex items-center gap-2">
            <BoltIcon className="size-4 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest text-amber">{mode === "judge" ? r.judgeHeading : r.heading}</h2>
            <span className="ammo-counter ml-auto text-xs text-dim">{windows.length}</span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {windows.map((card) => (
              <WindowCard key={card.id} card={card} mode={mode} onWheel={setWheel} />
            ))}
          </ul>
        </section>
      ) : null}
      {mode === "player" ? <WheelOverlay outcome={wheel} entries={wheelEntries} onClose={() => setWheel(null)} /> : null}
    </>
  );
}
