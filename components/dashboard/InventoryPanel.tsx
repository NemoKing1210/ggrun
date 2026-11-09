"use client";

import { useActionState, useEffect, useState } from "react";
import {
  BoltIcon,
  ClockIcon,
  FireIcon,
  GiftIcon,
  MapPinIcon,
  ShieldExclamationIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { HEX_CLIP, IeeArtTile, SQUARE_CLIP } from "@/components/iee/IeeArtTile";
import { CardMeta, DurationMeter, PlayerEntryCard } from "@/components/iee/PlayerEntryCard";
import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { EntryView, UseChoice } from "@/lib/engine";
import { filterAllows } from "@/lib/engine/iee/use-guards";
import { pickGamesAction, useItemAction } from "@/lib/modules/iee/actions";

/**
 * A held item. `view` is the entry as this season plays it — name, rule text
 * with the season's numbers, glyph, usage — so the panel never needs the
 * catalog (docs/IEE_CONSTRUCTOR_SPEC.md §8).
 */
export type InventoryRow = {
  id: string;
  /** Uses left — firings, for a passive or cursed item; null for a passive one that stays while held. */
  chargesLeft: number | null;
  source: string;
  view: EntryView;
  /**
   * What a use may pick from the season's catalog, for an item that asks for
   * one (spec §6.12) — worked out on the server with the server's own rule.
   */
  entryOptions?: EntryView[];
  /**
   * What a use may pick for the next game, for an item that asks (wave C, spec
   * §6.16): the genres and decades the season's pool offers — a game is
   * searched for as the player types.
   */
  pick?: PickOffer;
};

/** What the season's pool offers a pick for the next game (wave C, spec §6.16); the cells an object may stand on (wave D, §6.18). */
export type PickOffer =
  | { kind: "genre"; options: string[] }
  | { kind: "years"; options: number[] }
  | { kind: "game" }
  | { kind: "cell"; options: number[] };

/** A status in force. `remaining` counts in `view.duration.unit`; null = permanent. */
export type StatusRow = {
  id: string;
  remaining: number | null;
  castByUsername: string | null;
  view: EntryView;
};

export type TargetRow = {
  seasonPlayerId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  position: number;
  targetable: boolean;
  /** Out of reach now — an effect of theirs says nobody may aim at them (wave B, spec §6.13). */
  untargetable?: boolean;
};

/**
 * Empty state as empty slots.
 *
 * A single grey sentence in a tall panel reads as a page that failed to load.
 * Drawn slots say what the panel is *for* before the sentence explains it, and
 * they hold the panel's height so the layout does not collapse.
 */
function EmptySlots({ kind, hint }: { kind: "item" | "effect"; hint: string }) {
  const clip = kind === "item" ? SQUARE_CLIP : HEX_CLIP;
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className="flex gap-2.5" aria-hidden>
        {Array.from({ length: kind === "item" ? 4 : 3 }, (_, i) => (
          <span
            key={i}
            className={`size-12 border border-dashed border-dim/25 bg-black/20 ${clip}`}
          />
        ))}
      </div>
      <p className="max-w-xs text-center text-sm leading-relaxed text-dim">{hint}</p>
    </div>
  );
}

function PanelHeading({
  icon: Icon,
  children,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-4 text-amber" aria-hidden />
      <h2 className="font-display text-sm uppercase tracking-widest text-amber">{children}</h2>
      {count > 0 && <span className="ammo-counter ml-auto text-xs text-dim">{count}</span>}
    </div>
  );
}

/** Whether one of the player's own instances is what an item's pick may take (spec §6.10). */
function choosable(choice: UseChoice, kind: "item" | "effect", view: EntryView): boolean {
  return (
    (choice.what === "any" || choice.what === kind) &&
    (choice.entryId === null || choice.entryId === view.entryId) &&
    (choice.rarity === null || choice.rarity.includes(view.rarity)) &&
    (choice.character === null || choice.character === view.character)
  );
}

type UseStep = "target" | "choice" | "entry" | "pick";

/**
 * What using an item asks for, in order: whom it is aimed at, what of one's
 * own, what from the catalog, what for the next game (wave C).
 */
function stepsOf(view: EntryView): UseStep[] {
  const usage = view.usage;
  if (!usage || usage.activation !== "active") return [];
  const steps: UseStep[] = [];
  if (usage.target === "other" || usage.target === "any") steps.push("target");
  if (usage.choice) steps.push("choice");
  if (usage.entryChoice) steps.push("entry");
  if (usage.pick) steps.push("pick");
  return steps;
}

/** A use in progress: the item, and what has been picked so far. */
type UseFlow = { row: InventoryRow; target: string | null; choice: string | null };

/** The step a use waits on; null once nothing is left to pick. */
function stepOf(flow: UseFlow): UseStep | null {
  for (const step of stepsOf(flow.row.view)) {
    if (step === "target" && flow.target === null) return step;
    if (step === "choice" && flow.choice === null) return step;
    if (step === "entry" || step === "pick") return step;
  }
  return null;
}

/** The step after this one, or null when this one is the last — then it submits. */
function nextAfter(flow: UseFlow, step: UseStep): UseStep | null {
  const steps = stepsOf(flow.row.view);
  return steps[steps.indexOf(step) + 1] ?? null;
}

const OPTION_CLASS =
  "flex w-full items-center gap-3 border border-[#3d3d34] bg-[#1a1a1a] p-2 text-left transition-colors hover:border-amber/50 disabled:cursor-not-allowed disabled:opacity-50 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]";

/**
 * Held items and active statuses.
 *
 * The picture leads, the sentence follows, and the footer carries the facts a
 * player acts on — how much of the effect is left, when an item may be used
 * and on whom. Those last two used to be discoverable only by clicking Use and
 * seeing what happened.
 *
 * The target picker only offers players the server would accept — but the flag
 * is a courtesy, not the rule: `activateInventoryItem` re-checks every one of them.
 */
export function InventoryPanel({
  items,
  statuses,
  targets,
  allowTargeting,
  selfPosition,
  forbidden = false,
  deciding = false,
}: {
  items: InventoryRow[];
  statuses: StatusRow[];
  targets: TargetRow[];
  allowTargeting: boolean;
  /** Where the player stands — an item with a target filter offers only whom it allows. */
  selfPosition?: number;
  /** The player cannot use items now (wave B, spec §6.13): the uses are greyed out. */
  forbidden?: boolean;
  /** A choice waits for the player (wave B, spec §7.6): they answer it before using items. */
  deciding?: boolean;
}) {
  const { t, locale } = useI18n();
  const p = t.iee.panel;
  const [state, formAction, pending] = useActionState(useItemAction, {});
  // Kept from items for now: an effect forbids them, or a choice waits first.
  const held = forbidden || deciding;
  const heldWhy = forbidden ? p.forbidden : deciding ? p.deciding : undefined;
  const [flow, setFlow] = useState<UseFlow | null>(null);
  const step = flow ? stepOf(flow) : null;

  // Close the pickers once the action lands, so the list refreshes underneath.
  useEffect(() => {
    if (state.ok) setFlow(null);
  }, [state.ok]);

  // A target filter (spec §6.10): the picker offers only the players it allows,
  // judged as the server will judge them — the server checks again.
  const filter = flow?.row.view.usage?.filter ?? null;
  const offered =
    filter && selfPosition !== undefined
      ? targets.filter((target) =>
          filterAllows(filter, { seasonPlayerId: "self", position: selfPosition }, target, [
            { seasonPlayerId: "self", position: selfPosition, status: "active" },
            ...targets.map((o) => ({ seasonPlayerId: o.seasonPlayerId, position: o.position, status: "active" as const })),
          ]),
        )
      : targets;

  // What a use asks to pick: the player's own statuses and other items it may take.
  const choice = flow?.row.view.usage?.choice ?? null;
  const candidates = choice
    ? [
        ...statuses.map((row) => ({ id: row.id, kind: "effect" as const, view: row.view })),
        ...items.filter((row) => row.id !== flow?.row.id).map((row) => ({ id: row.id, kind: "item" as const, view: row.view })),
      ].filter((c) => choosable(choice, c.kind, c.view))
    : [];
  // And what it may pick from the season's catalog (spec §6.12).
  const entryOptions = flow?.row.entryOptions ?? [];

  // And what it may pick for the next game (wave C, spec §6.16): a game is searched for as the player types.
  const pickOffer = step === "pick" ? (flow?.row.pick ?? null) : null;
  const pickingGame = pickOffer?.kind === "game" ? flow!.row.id : null;
  const [gameQuery, setGameQuery] = useState("");
  const [games, setGames] = useState<{ id: string; title: string }[] | null>(null);
  useEffect(() => {
    if (!pickingGame) {
      // A picker closed — by a use that landed or by the player — starts afresh next time.
      setGameQuery("");
      setGames(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void pickGamesAction(pickingGame, gameQuery).then((found) => {
        if (alive) setGames(found);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pickingGame, gameQuery]);

  /**
   * One option of a step: the last step submits the use with everything
   * picked so far; an earlier one moves the flow on.
   */
  const option = (at: UseStep, field: string, value: string, disabled: boolean, content: React.ReactNode) => {
    if (!flow) return null;
    if (nextAfter(flow, at) !== null) {
      return (
        <button
          type="button"
          disabled={pending || disabled}
          className={OPTION_CLASS}
          onClick={() => setFlow({ ...flow, ...(at === "target" ? { target: value } : { choice: value }) })}
        >
          {content}
        </button>
      );
    }
    return (
      <form action={formAction}>
        <input type="hidden" name="inventoryId" value={flow.row.id} />
        {flow.target !== null && <input type="hidden" name="targetSeasonPlayerId" value={flow.target} />}
        {flow.choice !== null && <input type="hidden" name="choiceInstanceId" value={flow.choice} />}
        <input type="hidden" name={field} value={value} />
        <button type="submit" disabled={pending || disabled} className={OPTION_CLASS}>
          {content}
        </button>
      </form>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="hud-card p-4">
        <PanelHeading icon={GiftIcon} count={items.length}>
          {p.heading}
        </PanelHeading>

        {held && items.length > 0 && (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-danger">
            <ShieldExclamationIcon className="size-4 shrink-0" aria-hidden />
            {heldWhy}
          </p>
        )}
        {items.length === 0 ? (
          <EmptySlots kind="item" hint={p.empty} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((row, itemIdx) => {
              const usage = row.view.usage;
              const activation = usage?.activation ?? "active";
              // A reaction item is used in the reaction window, after the dice — never from here (spec §7.4).
              const reaction = activation === "active" && usage?.window === "after_dice";
              const active = activation === "active" && !reaction;
              // A cursed item is carried but inflicted: it wears the penalty's colours (spec §7.5).
              const cursed = activation === "cursed";
              const needsTarget = active && (usage?.target === "other" || usage?.target === "any");
              const blocked = !allowTargeting && usage?.target === "other";
              // Something to pick first: a target, one of the player's own, an item of the catalog.
              const asks = stepsOf(row.view).length > 0;

              return (
                <PlayerEntryCard
                  key={row.id}
                  index={itemIdx}
                  frame={cursed ? "border-danger/40 bg-danger/10" : "border-[#3d3d34] bg-[#1a1a1a]"}
                  stripe={cursed ? "bg-danger" : "bg-amber/70"}
                  tile={
                    <IeeArtTile
                      entryKey={row.view.key}
                      kind="item"
                      glyph={row.view.glyph}
                      art={row.view.art}
                      polarity={row.view.polarity}
                      size="md"
                    />
                  }
                  title={row.view.name[locale]}
                  badge={
                    <>
                      {row.chargesLeft !== null && row.chargesLeft > 1 && (
                        <Badge variant="amber">
                          {format(p.charges, { count: String(row.chargesLeft) })}
                        </Badge>
                      )}
                      {cursed ? (
                        <Badge variant="danger">{p.cursed}</Badge>
                      ) : !active && !reaction ? (
                        <Badge variant="military">{p.passive}</Badge>
                      ) : null}
                    </>
                  }
                  description={row.view.ruleText[locale]}
                  flavor={row.view.flavor?.[locale]}
                  footer={
                    <>
                      {usage && active && (
                        // Vocabulary shared with the catalog: these strings
                        // describe the entry, not the admin screen they were
                        // first written for.
                        <CardMeta icon={MapPinIcon}>{t.iee.admin.window[usage.window]}</CardMeta>
                      )}
                      {reaction && <CardMeta icon={BoltIcon}>{p.reactionMeta}</CardMeta>}
                      {usage && needsTarget && (
                        <CardMeta icon={UserIcon}>
                          {usage.filter ? p.filter[usage.filter] : t.iee.admin.target[usage.target]}
                        </CardMeta>
                      )}
                      {/* Never used: it says what sets it off instead of offering a button. */}
                      {!active && !reaction && (
                        <CardMeta icon={cursed ? FireIcon : BoltIcon}>{cursed ? p.cursedMeta : p.passiveMeta}</CardMeta>
                      )}
                      {active &&
                        (asks ? (
                          <button
                            type="button"
                            className="hud-btn hud-btn-primary ml-auto !px-4 !py-1.5 text-xs"
                            onClick={() => setFlow({ row, target: null, choice: null })}
                            disabled={pending || held || (needsTarget && blocked)}
                            title={held ? heldWhy : needsTarget && blocked ? p.targetingDisabled : undefined}
                          >
                            {p.use}
                          </button>
                        ) : (
                          <form action={formAction} className="ml-auto">
                            <input type="hidden" name="inventoryId" value={row.id} />
                            <button
                              type="submit"
                              className="hud-btn hud-btn-primary !px-4 !py-1.5 text-xs"
                              disabled={pending || held}
                              title={heldWhy}
                            >
                              {p.use}
                            </button>
                          </form>
                        ))}
                    </>
                  }
                />
              );
            })}
          </ul>
        )}

        {state.error && (
          <div className="mt-3">
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
            <DebugError debug={state.debug} title="inventory" />
          </div>
        )}
      </section>

      <section className="hud-card p-4">
        <PanelHeading icon={BoltIcon} count={statuses.length}>
          {p.statusesHeading}
        </PanelHeading>

        {statuses.length === 0 ? (
          <EmptySlots kind="effect" hint={p.statusesEmpty} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {statuses.map((row, statusIdx) => {
              const negative = row.view.polarity === "negative";
              const tone = negative ? "danger" : "military";

              // The season's duration is the denominator — it is what turns
              // "1 left" into "1 of 3 left".
              const unit = row.view.duration?.unit ?? "permanent";
              const total = row.view.duration?.count ?? null;
              const left = row.remaining;
              const leftLabel =
                left === null
                  ? null
                  : unit === "next_game"
                    ? p.expiresNextGame
                    : format(
                        unit === "rolls"
                          ? p.expiresIn
                          : unit === "triggers"
                            ? p.expiresCharges
                            : unit === "moves"
                              ? p.expiresMoves
                              : p.expiresPassed,
                        { count: String(left) },
                      );

              return (
                <PlayerEntryCard
                  key={row.id}
                  index={statusIdx}
                  frame={
                    negative ? "border-danger/40 bg-danger/10" : "border-military/40 bg-military/10"
                  }
                  stripe={negative ? "bg-danger" : "bg-military"}
                  tile={
                    <IeeArtTile
                      entryKey={row.view.key}
                      kind="effect"
                      glyph={row.view.glyph}
                      art={row.view.art}
                      polarity={row.view.polarity}
                      size="md"
                    />
                  }
                  title={row.view.name[locale]}
                  badge={
                    <Badge variant={negative ? "danger" : "military"}>
                      {negative ? t.iee.polarity.negative : t.iee.polarity.positive}
                    </Badge>
                  }
                  description={row.view.ruleText[locale]}
                  flavor={row.view.flavor?.[locale]}
                  footer={
                    <>
                      {left !== null && leftLabel !== null ? (
                        <DurationMeter left={left} total={total} tone={tone} label={leftLabel} />
                      ) : (
                        <CardMeta icon={ClockIcon}>{p.permanent}</CardMeta>
                      )}
                      <CardMeta icon={row.castByUsername ? UserIcon : MapPinIcon}>
                        {row.castByUsername
                          ? format(p.castBy, { name: row.castByUsername })
                          : p.fromCell}
                      </CardMeta>
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={step === "target"} onClose={() => setFlow(null)}>
        <div>
          <h3 className="font-display text-lg uppercase tracking-widest">{p.targetTitle}</h3>
          <p className="mt-1 text-sm text-dim">{p.targetHint}</p>
          <div className="hazard-tape mt-3 opacity-60" aria-hidden />
        </div>

        {offered.length === 0 ? (
          <p className="mt-4 text-sm text-dim">{p.targetNone}</p>
        ) : (
          <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {offered.map((target) => (
              <li key={target.seasonPlayerId}>
                {option(
                  "target",
                  "targetSeasonPlayerId",
                  target.seasonPlayerId,
                  !target.targetable || target.untargetable === true,
                  <>
                    <AvatarBadge
                      size="sm"
                      square
                      name={target.displayName ?? target.username}
                      seed={target.username}
                      src={target.avatarUrl}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">
                        {target.displayName ?? target.username}
                      </span>
                      <span className="ammo-counter text-[11px] text-dim">#{target.position}</span>
                    </span>
                    {(!target.targetable || target.untargetable === true) && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-dim">
                        <ShieldExclamationIcon className="size-3.5" aria-hidden />
                        {target.targetable ? p.targetOutOfReach : p.targetProtected}
                      </span>
                    )}
                  </>,
                )}
              </li>
            ))}
          </ul>
        )}

        {state.error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" className="hud-btn" onClick={() => setFlow(null)}>
            {p.cancel}
          </button>
        </div>
      </Modal>

      <Modal open={step === "choice"} onClose={() => setFlow(null)}>
        <div>
          <h3 className="font-display text-lg uppercase tracking-widest">{p.choiceTitle}</h3>
          <p className="mt-1 text-sm text-dim">{p.choiceHint}</p>
          <div className="hazard-tape mt-3 opacity-60" aria-hidden />
        </div>

        {candidates.length === 0 ? (
          <p className="mt-4 text-sm text-dim">{p.choiceNone}</p>
        ) : (
          <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.id}>
                {option(
                  "choice",
                  "choiceInstanceId",
                  c.id,
                  false,
                  <>
                    <IeeArtTile
                      entryKey={c.view.key}
                      kind={c.kind}
                      glyph={c.view.glyph}
                      art={c.view.art}
                      polarity={c.view.polarity}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{c.view.name[locale]}</span>
                  </>,
                )}
              </li>
            ))}
          </ul>
        )}

        {state.error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" className="hud-btn" onClick={() => setFlow(null)}>
            {p.cancel}
          </button>
        </div>
      </Modal>

      <Modal open={step === "pick"} onClose={() => setFlow(null)}>
        <div>
          <h3 className="font-display text-lg uppercase tracking-widest">{pickOffer ? p.pickTitle[pickOffer.kind] : ""}</h3>
          <p className="mt-1 text-sm text-dim">{pickOffer?.kind === "cell" ? p.pickCellHint : p.pickHint}</p>
          <div className="hazard-tape mt-3 opacity-60" aria-hidden />
        </div>

        {pickOffer?.kind === "game" ? (
          <>
            <input
              type="search"
              className="mt-4 w-full"
              placeholder={p.pickSearch}
              aria-label={p.pickSearch}
              value={gameQuery}
              onChange={(e) => setGameQuery(e.target.value)}
            />
            {games === null ? (
              <p className="mt-3 text-sm text-dim">{p.pickSearching}</p>
            ) : games.length === 0 ? (
              <p className="mt-3 text-sm text-dim">{p.pickNone}</p>
            ) : (
              <ul className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
                {games.map((g) => (
                  <li key={g.id}>{option("pick", "pickedGameId", g.id, false, <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{g.title}</span>)}</li>
                ))}
              </ul>
            )}
          </>
        ) : pickOffer?.kind === "cell" ? (
          pickOffer.options.length > 0 ? (
            <ul className="mt-4 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {pickOffer.options.map((cell) => (
                <li key={cell}>
                  {option("pick", "pickedCell", String(cell), false, <span className="ammo-counter flex-1 text-sm text-zinc-100">{format(p.pickCell, { n: String(cell) })}</span>)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-dim">{p.pickCellNone}</p>
          )
        ) : pickOffer && pickOffer.options.length > 0 ? (
          <ul className="mt-4 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {pickOffer.kind === "genre"
              ? pickOffer.options.map((genre) => (
                  <li key={genre}>{option("pick", "pickedGenre", genre, false, <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{genre}</span>)}</li>
                ))
              : pickOffer.options.map((from) => (
                  <li key={from}>
                    {option(
                      "pick",
                      "pickedYears",
                      `${from}-${from + 9}`,
                      false,
                      <span className="ammo-counter flex-1 text-sm text-zinc-100">{format(p.pickDecade, { from: String(from), to: String(from + 9) })}</span>,
                    )}
                  </li>
                ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-dim">{p.pickNone}</p>
        )}

        {state.error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" className="hud-btn" onClick={() => setFlow(null)}>
            {p.cancel}
          </button>
        </div>
      </Modal>

      <Modal open={step === "entry"} onClose={() => setFlow(null)}>
        <div>
          <h3 className="font-display text-lg uppercase tracking-widest">{p.entryTitle}</h3>
          <p className="mt-1 text-sm text-dim">{p.entryHint}</p>
          <div className="hazard-tape mt-3 opacity-60" aria-hidden />
        </div>

        {entryOptions.length === 0 ? (
          <p className="mt-4 text-sm text-dim">{p.entryNone}</p>
        ) : (
          <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {entryOptions.map((e) => (
              <li key={e.entryId}>
                {option(
                  "entry",
                  "chosenEntryId",
                  e.entryId,
                  false,
                  <>
                    <IeeArtTile entryKey={e.key} kind="item" glyph={e.glyph} art={e.art} polarity={e.polarity} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">{e.name[locale]}</span>
                      <span className="line-clamp-2 text-xs leading-snug text-dim">{e.ruleText[locale]}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-dim">{t.iee.rarity[e.rarity]}</span>
                  </>,
                )}
              </li>
            ))}
          </ul>
        )}

        {state.error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" className="hud-btn" onClick={() => setFlow(null)}>
            {p.cancel}
          </button>
        </div>
      </Modal>
    </div>
  );
}
