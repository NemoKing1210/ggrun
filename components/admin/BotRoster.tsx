"use client";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/client";
import { dictText } from "@/lib/i18n/dict-text";
import { format } from "@/lib/i18n/format";
import { getItem } from "@/lib/engine";
import type { BotActivityBroadcast } from "@/lib/realtime/protocol";
import { Badge } from "@/components/ui/Badge";
import { EffectBadges } from "@/components/iee/EffectBadges";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { useNow } from "@/components/admin/use-bots-live";
import type { BotsText, ConsoleRosterRow } from "@/components/admin/BotsRunCard";

/** How long a step stays "now" before it reads as the last thing that happened. */
const LIVE_WINDOW_MS = 15_000;

const PLAYER_VARIANT: Record<string, "emerald" | "sky" | "danger" | "dim"> = {
  active: "emerald",
  finished: "sky",
  eliminated: "danger",
  withdrawn: "dim",
};

function itemLabel(dict: Dictionary, itemKey: string): string {
  const def = getItem(itemKey);
  return def ? dictText(dict, def.i18n.name) : itemKey;
}

/** Localized word for a journal action, for the "last action" line. */
function actionWord(t: BotsText, action: string): string {
  switch (action) {
    case "roll":
      return t.actionRoll;
    case "resolve":
      return t.actionResolve;
    case "item":
      return t.actionItem;
    case "tick":
      return t.actionTick;
    case "run_created":
      return t.actionCreated;
    case "cleanup":
      return t.actionCleanup;
    case "run_paused":
    case "run_resumed":
    case "run_restarted":
    case "run_stopped":
      return t.actionLifecycle;
    default:
      return action;
  }
}

/** Human-readable "what is this bot doing right now", from a structured step. */
function activityText(t: BotsText, dict: Dictionary, step: BotActivityBroadcast): string {
  switch (step.kind) {
    case "roll":
      return t.actRolled;
    case "resolve":
      if (step.outcome === "passed") return format(t.actPassed, { position: step.position ?? 0 });
      if (step.outcome === "dropped") return t.actDropped;
      return t.actRerolled;
    case "item": {
      const name = step.itemKey ? itemLabel(dict, step.itemKey) : "";
      return step.targetUsername
        ? format(t.actUsedItemOn, { item: name, target: step.targetUsername })
        : format(t.actUsedItem, { item: name });
    }
    case "skip":
      return t.actSkipped;
    case "error":
      return t.actError;
    default:
      return step.detail;
  }
}

function relative(t: BotsText, now: number, iso: string): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return t.timeNow;
  if (seconds < 60) return format(t.timeAgoS, { s: seconds });
  return format(t.timeAgoM, { m: Math.floor(seconds / 60) });
}

/** Newest step for one bot, or null. */
function latestFor(
  activity: readonly BotActivityBroadcast[],
  seasonPlayerId: string | null,
): BotActivityBroadcast | null {
  if (!seasonPlayerId) return null;
  for (let i = activity.length - 1; i >= 0; i -= 1) {
    const step = activity[i]!;
    if (step.seasonPlayerId === seasonPlayerId) return step;
  }
  return null;
}

/**
 * Per-bot live panel: who the bot is, what it holds, what is on it, how much it
 * has done and — the point of the whole thing — what it is doing right now.
 *
 * Item and effect names come from `useI18n()` rather than a prop because the
 * catalog stores dictionary *paths*; passing the whole dictionary through the
 * console would duplicate a payload the client already has.
 */
export function BotRoster({
  roster,
  activity,
  playerStatusLabels,
  t,
}: {
  roster: readonly ConsoleRosterRow[];
  activity: readonly BotActivityBroadcast[];
  playerStatusLabels: Record<string, string>;
  t: BotsText;
}) {
  const { t: dict } = useI18n();
  const now = useNow();

  if (roster.length === 0) {
    return <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-dim">{t.rosterEmpty}</p>;
  }

  return (
    <ul className="mt-2 flex flex-col gap-2">
      {roster.map((bot) => {
        const step = latestFor(activity, bot.seasonPlayerId);
        // Time-dependent bits wait for the client clock (hydration-safe).
        const fresh =
          step !== null && now !== null && now - new Date(step.at).getTime() < LIVE_WINDOW_MS;
        return (
          <li key={bot.username} className="border border-[#3d3d34] bg-[#141413] px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`size-1.5 shrink-0 ${fresh ? "animate-pulse bg-military" : "bg-[#3d3d34]"}`}
                aria-hidden
              />
              <span className="truncate font-mono text-xs text-amber">{bot.username}</span>
              <Badge variant={PLAYER_VARIANT[bot.status ?? ""] ?? "dim"}>
                {bot.status ? (playerStatusLabels[bot.status] ?? bot.status) : t.rosterNoMember}
              </Badge>
              <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-zinc-400">
                <span>
                  {t.rosterPosition} {bot.position ?? "—"}
                </span>
                <span>
                  {t.rosterPoints} {bot.balancePoints ?? "—"}
                </span>
              </span>
            </div>

            <p
              className={`mt-1 truncate font-mono text-[11px] ${
                fresh ? "text-military" : "text-dim"
              }`}
              title={step?.detail ?? bot.lastAction?.message ?? ""}
            >
              {step ? activityText(t, dict, step) : t.rosterIdle}
              {step && now !== null && (
                <span className="ml-2 text-dim">{relative(t, now, step.at)}</span>
              )}
            </p>

            {(bot.items.length > 0 || bot.effects.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {bot.items.length > 0 && (
                  <span className="flex items-center gap-1" aria-label={t.rosterItems}>
                    {bot.items.map((item) => (
                      <span key={item.inventoryId} className="inline-flex items-center gap-0.5">
                        <IeeArtTile
                          kind="item"
                          entryKey={item.itemKey}
                          heroIcon={getItem(item.itemKey)?.heroIcon}
                          size="sm"
                        />
                        {item.chargesLeft > 1 && (
                          <span className="font-mono text-[10px] text-dim">×{item.chargesLeft}</span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
                {bot.effects.length > 0 && (
                  <span aria-label={t.rosterEffects}>
                    <EffectBadges
                      badges={bot.effects.map((e) => ({
                        effectKey: e.effectKey,
                        polarity: e.polarity === "positive" ? "positive" : "negative",
                      }))}
                      t={dict}
                      max={4}
                    />
                  </span>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-dim">
              <span>
                {format(t.rosterCounters, {
                  roll: bot.counts.roll,
                  resolve: bot.counts.resolve,
                  item: bot.counts.item,
                  errors: bot.counts.errors,
                })}
              </span>
              {!step && bot.lastAction && now !== null && (
                <span className="truncate" title={bot.lastAction.message}>
                  {actionWord(t, bot.lastAction.action)} · {relative(t, now, bot.lastAction.createdAt)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
