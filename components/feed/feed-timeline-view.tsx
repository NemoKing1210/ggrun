"use client";

import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { BotBadge } from "@/components/ui/BotBadge";
import { isBotUsername } from "@/lib/shared/utils/bots";
import { AvatarWithPresence } from "@/components/ui/Presence";
import { AvatarFallback } from "@/components/ui/AvatarFallback";
import {
  ArrowsRightLeftIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  CubeIcon,
  GiftIcon,
  FlagIcon,
  ScaleIcon,
  MapPinIcon,
  ShieldCheckIcon,
  StarIcon,
  TrophyIcon,
  UserMinusIcon,
  UserPlusIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import type { SerializedFeedRow } from "./feed-wire";

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

function payloadOf(entry: SerializedFeedRow): Record<string, unknown> {
  if (entry.payload && typeof entry.payload === "object")
    return entry.payload as Record<string, unknown>;
  return {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function diceStr(payload: Record<string, unknown>): string | null {
  const d = payload.dice;
  if (!Array.isArray(d)) return null;
  const nums = d.filter((x): x is number => typeof x === "number");
  return nums.length ? nums.join(" + ") : null;
}

type Variant = "amber" | "military" | "danger" | "sky" | "violet" | "dim" | "neutral";

/**
 * An item's or effect's name as the row recorded it. The executor snapshots
 * the entry's names into the payload (spec §9.3), so history reads the same
 * after an entry is renamed or leaves the season; a row without a snapshot
 * shows its key.
 */
function entryName(p: Record<string, unknown>, key: string | null, locale: Locale): string {
  const name = p.name;
  if (name && typeof name === "object") {
    const text = name as Partial<Record<Locale, unknown>>;
    const local = text[locale] ?? text.ru;
    if (typeof local === "string" && local.length > 0) return local;
  }
  return key ?? "—";
}

const facesOf = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);
const sameFaces = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * What a reaction item did to the dice (wave B, spec §7.4, §9.3): a throw
 * again shows the faces before and after; a second throw that lost, both
 * throws; a change to the result, the result before and after. A row from
 * before the throws were recorded shows the faces.
 */
function reactionText(value: unknown, a: Dictionary["feed"]["actions"]): string | null {
  if (!value || typeof value !== "object") return null;
  const r = value as { before?: unknown; thrown?: unknown; after?: unknown; result?: { before?: unknown; after?: unknown } };
  const before = facesOf(r.before);
  const after = facesOf(r.after);
  if (before.length === 0) return null;
  const join = (faces: readonly number[]) => faces.join(" + ");
  const thrown = Array.isArray(r.thrown) ? r.thrown.map(facesOf).filter((t) => t.length > 0) : null;
  if (thrown && thrown.length === 0 && typeof r.result?.before === "number" && typeof r.result?.after === "number") {
    return format(a.reactedResult, { before: String(r.result.before), after: String(r.result.after) });
  }
  const last = thrown?.at(-1);
  if (last && sameFaces(after, before) && !sameFaces(last, after)) {
    return format(a.reactedKept, { before: join(before), thrown: join(last) });
  }
  return format(a.reacted, { before: join(before), after: join(after) });
}

/** The names a row recorded — the items a choice took or kept — in the reader's language. */
function namesIn(value: unknown, locale: Locale): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((name) => {
    const local = entryName({ name }, null, locale);
    return local === "—" ? [] : [local];
  });
}

function eventMeta(type: string): {
  variant: Variant;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
} {
  switch (type) {
    case "game_rolled":
    case "game_rerolled":
    case "reroll_requested":
      return { variant: "amber", Icon: CubeIcon, label: type };
    case "game_postponed":
      return { variant: "amber", Icon: ClockIcon, label: type };
    case "game_passed":
      return { variant: "military", Icon: CheckCircleIcon, label: type };
    case "game_dropped":
      return { variant: "danger", Icon: XCircleIcon, label: type };
    case "moved":
    case "moved_out_of_turn":
      return { variant: "sky", Icon: ArrowsRightLeftIcon, label: type };
    case "player_joined":
      return { variant: "violet", Icon: UserPlusIcon, label: type };
    case "player_left":
      return { variant: "danger", Icon: UserMinusIcon, label: type };
    case "player_finished":
      return { variant: "amber", Icon: TrophyIcon, label: type };
    case "season_started":
      return { variant: "amber", Icon: FlagIcon, label: type };
    case "admin_adjustment":
      return { variant: "dim", Icon: WrenchScrewdriverIcon, label: type };
    case "reroll_rejected":
      return { variant: "danger", Icon: XCircleIcon, label: type };
    case "reroll_approved":
      return { variant: "military", Icon: CheckCircleIcon, label: type };
    case "item_granted":
      return { variant: "military", Icon: GiftIcon, label: type };
    case "item_used":
      return { variant: "amber", Icon: BoltIcon, label: type };
    case "item_moved":
      return { variant: "amber", Icon: ArrowsRightLeftIcon, label: type };
    case "intercepted":
      return { variant: "sky", Icon: ShieldCheckIcon, label: type };
    case "decision_made":
      return { variant: "amber", Icon: ScaleIcon, label: type };
    case "object_placed":
      return { variant: "amber", Icon: MapPinIcon, label: type };
    case "object_triggered":
      return { variant: "danger", Icon: MapPinIcon, label: type };
    case "item_expired":
    case "item_revoked":
      return { variant: "dim", Icon: XCircleIcon, label: type };
    case "effect_applied":
      return { variant: "violet", Icon: SparklesIcon, label: type };
    case "effect_expired":
    case "effect_cleansed":
    case "effect_revoked":
      return { variant: "dim", Icon: SparklesIcon, label: type };
    case "event_assigned":
      return { variant: "sky", Icon: FlagIcon, label: type };
    case "event_submitted":
      return { variant: "amber", Icon: FlagIcon, label: type };
    case "event_approved":
      return { variant: "military", Icon: CheckCircleIcon, label: type };
    case "event_rejected":
      return { variant: "danger", Icon: XCircleIcon, label: type };
    default:
      return { variant: "neutral", Icon: SparklesIcon, label: type };
  }
}

const variantStyles: Record<Variant, string> = {
  amber: "border-amber bg-amber text-black",
  military: "border-military bg-military text-black",
  danger: "border-danger bg-danger text-white",
  sky: "border-sky-400 bg-sky-500 text-black",
  violet: "border-violet-400 bg-violet-500 text-white",
  dim: "border-dim/30 bg-raised text-dim",
  neutral: "border-dim/20 bg-raised text-dim",
};

const dotStyles: Record<Variant, string> = {
  amber: "bg-amber border-amber shadow-[0_0_8px_rgba(242,169,0,0.5)]",
  military: "bg-military border-military",
  danger: "bg-danger border-danger",
  sky: "bg-sky-500 border-sky-400",
  violet: "bg-violet-500 border-violet-400",
  dim: "bg-zinc-600 border-zinc-500",
  neutral: "bg-dim border-dim/40",
};

function PlayerLink({
  entry,
  fallback,
  botLabel,
}: {
  entry: SerializedFeedRow;
  fallback: string;
  botLabel: string;
}) {
  const name = entry.displayName ?? entry.username ?? fallback;
  const username = entry.username;
  const bot = isBotUsername(username);
  if (username) {
    return (
      <>
        <Link href={`/players/${username}`} className="font-semibold text-amber hover:underline">
          {name}
        </Link>
        {bot ? <BotBadge label={botLabel} className="ml-1.5 align-middle" /> : null}
      </>
    );
  }
  return (
    <>
      <span className="font-semibold text-amber">{name}</span>
      {bot ? <BotBadge label={botLabel} className="ml-1.5 align-middle" /> : null}
    </>
  );
}

function EventLine({
  entry,
  t,
  dict,
  locale,
}: {
  entry: SerializedFeedRow;
  t: Dictionary["feed"];
  dict: Dictionary;
  locale: Locale;
}) {
  const p = payloadOf(entry);
  const dice = diceStr(p);
  const diceSuffix = dice ? ` ${format(t.diceSuffix, { dice })}` : null;
  switch (entry.eventType) {
    case "game_rolled": {
      const title = str(p.title) ?? t.unknownTitle;
      // From a choice, or a set-aside game come back (wave C, IEE spec §7.12).
      const line =
        p.chosen === true
          ? format(t.actions.rolledChosen, { title, count: String(num(p.offered) ?? "?") })
          : p.returned === true
            ? format(t.actions.rolledReturned, { title })
            : format(t.actions.rolled, { title });
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {line}
        </>
      );
    }
    case "game_rerolled": {
      const title = str(p.title) ?? t.unknownTitle;
      const key = str(p.itemKey);
      // What came instead: a new game, one set aside earlier, or a choice (wave C, §7.12).
      const choosing = num(p.choosing);
      const into = choosing !== null ? format(t.actions.rerolledChoosing, { count: String(choosing) }) : format(t.actions.rerolledInto, { title });
      const returned = p.returned === true ? t.actions.returnedMark : null;
      if (key) {
        return (
          <>
            <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
            {t.actions.rerolledWith}
            <span className="font-bold text-amber">{entryName(p, key, locale)}</span>
            {into}
            {returned}
          </>
        );
      }
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {choosing !== null ? (
            <>
              {t.actions.rerolledBare}
              {into}
            </>
          ) : (
            format(t.actions.rerolled, { title })
          )}
          {returned}
        </>
      );
    }
    case "game_postponed": {
      // A game set aside with an item (wave C, IEE spec §6.16): when it comes back, and what came now.
      const key = str(p.itemKey);
      const roll = num(p.comesBackOn);
      const choosing = num(p.choosing);
      const next = str(p.newTitle);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {format(t.actions.postponed, { title: str(p.title) ?? t.unknownTitle })}
          <span className="font-bold text-amber">{entryName(p, key, locale)}</span>
          {roll !== null ? format(t.actions.postponedBack, { roll: String(roll) }) : null}
          {choosing !== null
            ? format(t.actions.postponedChoosing, { count: String(choosing) })
            : next
              ? format(t.actions.postponedNext, { title: next })
              : null}
          {p.returned === true ? t.actions.returnedMark : null}
        </>
      );
    }
    case "reroll_requested": {
      const reason = str(p.reason);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />{" "}
          requested reroll{reason ? `: “${reason}”` : ""}
        </>
      );
    }
    case "reroll_approved":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {t.actions.rerollApproved}
        </>
      );
    case "reroll_rejected": {
      const reason = str(p.reason);
      return (
        <>
          reroll rejected for{" "}
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {reason ? ` — ${reason}` : ""}
        </>
      );
    }
    case "game_passed":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {t.actions.passed}
          {diceSuffix}
        </>
      );
    case "game_dropped":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {t.actions.dropped}
          {diceSuffix}
        </>
      );
    case "moved": {
      const from = num(p.from);
      const to = num(p.to);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {format(t.actions.movedFrom, { from: from ?? "?" })}
          <span className="ammo-counter font-bold text-amber">{to ?? "?"}</span>
          {diceSuffix}
        </>
      );
    }
    case "moved_out_of_turn": {
      // An item or effect moved them (spec §7.3); the entry is named where the season reveals it.
      const from = num(p.from);
      const to = num(p.to);
      const key = str(p.key);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {format(t.actions.movedOutOfTurn, { from: from ?? "?" })}
          <span className="ammo-counter font-bold text-amber">{to ?? "?"}</span>
          {key ? format(t.actions.movedBy, { name: entryName(p, key, locale) }) : null}
        </>
      );
    }
    case "season_started":
      return <>{t.seasonStarted}</>;
    case "player_joined":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {t.actions.joined}
        </>
      );
    case "player_left":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {t.actions.left}
        </>
      );
    case "player_finished":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          <span className="font-bold text-amber-300">{t.actions.finished}</span>
        </>
      );
    case "item_granted": {
      const key = str(p.itemKey);
      // A cursed item is inflicted, not found (spec §7.5).
      const cursed = p.polarity === "negative";
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {cursed ? t.actions.itemCursed : t.actions.itemGranted}
          <span className={`font-bold ${cursed ? "text-danger" : "text-military"}`}>{entryName(p, key, locale)}</span>
        </>
      );
    }
    case "item_used": {
      const key = str(p.itemKey);
      const target = str(p.targetUsername);
      // A reaction item's use (wave B, spec §7.4): what it did to the dice.
      const reacted = reactionText(p.reaction, t.actions);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {t.actions.itemUsed}
          <span className="font-bold text-amber">{entryName(p, key, locale)}</span>
          {reacted ? <span className="font-mono text-xs text-dim">{reacted}</span> : null}
          {target ? (
            <>
              {t.actions.itemUsedOn}
              <Link href={`/players/${target}`} className="font-bold text-amber hover:underline">
                {target}
              </Link>
              {isBotUsername(target) ? (
                <BotBadge label={dict.core.common.bot} className="ml-1.5 align-middle" />
              ) : null}
            </>
          ) : null}
        </>
      );
    }
    case "item_moved": {
      // A bonus item changed hands (spec §6.12): on the receiver's line, named where the season reveals it.
      const key = str(p.itemKey);
      const from = str(p.fromUsername);
      // Taken by the rival who ended a move on the holder's cell (wave D, «Корона», spec §6.19).
      const verb =
        p.how === "stolen" ? t.actions.itemStolen : p.how === "traded" ? t.actions.itemTraded : p.how === "taken" ? t.actions.itemTaken : t.actions.itemReceived;
      const fromWord =
        p.how === "stolen"
          ? t.actions.itemStolenFrom
          : p.how === "traded"
            ? t.actions.itemTradedFrom
            : p.how === "taken"
              ? t.actions.itemTakenFrom
              : t.actions.itemReceivedFrom;
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {verb}
          <span className="font-bold text-military">{key ? entryName(p, key, locale) : t.actions.itemUnnamed}</span>
          {from ? (
            <>
              {fromWord}
              <Link href={`/players/${from}`} className="font-bold text-amber hover:underline">
                {from}
              </Link>
              {isBotUsername(from) ? <BotBadge label={dict.core.common.bot} className="ml-1.5 align-middle" /> : null}
            </>
          ) : null}
        </>
      );
    }
    case "intercepted": {
      // A player's entry answered what reached them (spec §6.13): on their line, the rival who sent it named.
      const key = str(p.key);
      const from = str(p.fromUsername);
      const words = t.actions.intercepted;
      const how =
        p.how === "reflected"
          ? words.reflected
          : p.how === "amplified"
            ? format(words.amplified, { factor: String(p.factor ?? 2) })
            : p.how === "replaced"
              ? Number(p.with ?? 0) > 0
                ? format(words.replaced, { cells: String(p.with) })
                : words.stayed
              : words.blocked;
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {words.lead}
          <span className="font-bold text-sky-400">{entryName(p, key, locale)}</span>
          {how}
          {from ? (
            <>
              {words.from}
              <Link href={`/players/${from}`} className="font-bold text-amber hover:underline">
                {from}
              </Link>
              {isBotUsername(from) ? <BotBadge label={dict.core.common.bot} className="ml-1.5 align-middle" /> : null}
            </>
          ) : null}
        </>
      );
    }
    case "object_placed": {
      // An item placed itself on the board (wave D, spec §6.18): on its owner's line, the cell named.
      const words = t.actions.object;
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {words.placed}
          <span className="font-bold text-amber">{entryName(p, str(p.itemKey), locale)}</span>
          {format(words.placedOn, { cell: String(p.cell ?? "?") })}
        </>
      );
    }
    case "object_triggered": {
      // An object acted on the move that entered its cell, and is gone (§6.18): on the mover's line, its owner named.
      const words = t.actions.object;
      const owner = str(p.ownerUsername);
      const extended = Number(p.extended ?? 0);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {words.entered}
          <span className="font-bold text-danger">{entryName(p, str(p.itemKey), locale)}</span>
          {format(words.enteredOn, { cell: String(p.cell ?? "?") })}
          {p.stopped === true ? words.stopped : null}
          {p.stopped === true && typeof p.to === "number" ? format(words.pushedTo, { to: String(p.to) }) : null}
          {extended > 0 ? format(words.extended, { n: String(extended) }) : null}
          {p.spun === "negative" ? words.spunPenalty : p.spun === "positive" ? words.spunBonus : null}
          {owner ? (
            <>
              {words.owner}
              <Link href={`/players/${owner}`} className="font-bold text-amber hover:underline">
                {owner}
              </Link>
              {words.ownerEnd}
            </>
          ) : null}
        </>
      );
    }
    case "decision_made": {
      // A choice an entry put to the player, answered (spec §7.6): what went, what stayed, and who chose.
      const words = t.actions.decision;
      const discarded = namesIn(p.discarded, locale);
      const burned = namesIn(p.burned, locale);
      const kept = namesIn(p.kept, locale);
      const list = (names: string[]) =>
        names.map((name, i) => (
          <span key={i}>
            {i > 0 ? ", " : ""}
            <span className="font-bold text-military">{name}</span>
          </span>
        ));
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {words.lead}
          <span className="font-bold text-amber">{entryName(p, str(p.key), locale)}</span>
          {p.option === "retain" ? (
            <>
              {kept.length > 0 ? (
                <>
                  {words.kept}
                  {list(kept)}
                </>
              ) : null}
              {burned.length > 0 ? (
                <>
                  {words.burned}
                  {list(burned)}
                </>
              ) : null}
            </>
          ) : discarded.length > 0 ? (
            <>
              {words.discarded}
              {list(discarded)}
            </>
          ) : (
            words.endured
          )}
          {p.how === "defaulted" ? words.defaulted : p.how === "judged" ? words.judged : null}
        </>
      );
    }
    case "item_expired":
    case "item_revoked": {
      const key = str(p.itemKey);
      // A cursed item that did its work is shaken off, not lost.
      const shed = p.character === "penalty";
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {shed ? t.actions.effectExpired : t.actions.itemExpired}
          <span className="text-dim">{entryName(p, key, locale)}</span>
        </>
      );
    }
    case "effect_applied": {
      const key = str(p.effectKey);
      const refreshed = p.refreshed === true;
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {refreshed ? t.actions.effectRefreshed : t.actions.effectApplied}
          <span className="font-bold text-violet-400">{entryName(p, key, locale)}</span>
        </>
      );
    }
    case "effect_expired":
    case "effect_cleansed":
    case "effect_revoked": {
      const key = str(p.effectKey);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {entry.eventType === "effect_expired"
            ? t.actions.effectExpired
            : t.actions.effectCleansed}
          <span className="text-dim">{entryName(p, key, locale)}</span>
        </>
      );
    }
    case "event_assigned":
    case "event_submitted":
    case "event_approved":
    case "event_rejected": {
      const title = str(p.title) ?? str(p.eventKey) ?? t.unknownTitle;
      const verb =
        entry.eventType === "event_assigned"
          ? t.actions.eventAssigned
          : entry.eventType === "event_submitted"
            ? t.actions.eventSubmitted
            : entry.eventType === "event_approved"
              ? t.actions.eventApproved
              : t.actions.eventRejected;
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {verb}
          <span className="font-bold text-sky-400">{title}</span>
        </>
      );
    }
    case "admin_adjustment": {
      const reason = str(p.reason);
      return (
        <>
          {t.adminAdjustmentPrefix}
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} botLabel={dict.core.common.bot} />
          {reason ? format(t.adminAdjustmentReason, { reason }) : null}
        </>
      );
    }
    default:
      return <>{format(t.defaultEvent, { type: entry.eventType })}</>;
  }
}

function Avatar({ entry, fallback }: { entry: SerializedFeedRow; fallback: string }) {
  const name = entry.displayName ?? entry.username ?? fallback;
  const inner = entry.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={entry.avatarUrl}
      alt=""
      loading="lazy"
      decoding="async"
      className="size-8 object-cover"
    />
  ) : (
    <AvatarFallback
      seed={entry.username}
      name={name}
      className="size-8"
      emojiClassName="text-base"
    />
  );
  const href = entry.username ? `/players/${entry.username}` : null;
  return (
    <AvatarWithPresence lastSeenAt={entry.lastSeenAt} size="sm" href={href}>
      {inner}
    </AvatarWithPresence>
  );
}

function DaySeparator({ date, t, locale }: { date: Date; t: Dictionary["feed"]; locale: Locale }) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday = date.toDateString() === y.toDateString();
  let label: string;
  if (isToday) label = t.today ?? "Today";
  else if (isYesterday) label = t.yesterday ?? "Yesterday";
  else
    label = new Intl.DateTimeFormat(dateLocales[locale], {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  return (
    <div className="sticky top-[57px] z-10 -mx-1 my-2 flex items-center gap-3 bg-background/80 px-1 py-1 backdrop-blur">
      <span className="h-px flex-1 bg-dim/20" aria-hidden />
      <span className="border border-dim/20 bg-raised px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim">
        {label}
      </span>
      <span className="h-px flex-1 bg-dim/20" aria-hidden />
    </div>
  );
}

/**
 * Pure timeline rendering. `hasAny` tells an empty filter result apart from
 * an empty season: the first shows the clear-filter hint, the second the
 * onboarding card. Remount (via key) replays the stagger — the explorer keys
 * by filter for exactly this.
 */
export function FeedTimelineView({
  rows,
  hasAny,
  onClearFilter,
}: {
  rows: SerializedFeedRow[];
  hasAny: boolean;
  onClearFilter?: () => void;
}) {
  const { t, locale } = useI18n();

  if (!hasAny) {
    return (
      <div className="hud-card p-10 text-center">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center border border-amber/20 bg-amber/5">
            <SparklesIcon className="h-6 w-6 text-amber" aria-hidden />
          </div>
          <p className="font-display text-lg uppercase tracking-wide text-amber">{t.feed.empty}</p>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">
            {t.feed.emptyHint}
          </p>
          <div className="hazard-tape mt-6 h-1.5 opacity-60" aria-hidden />
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="hud-card p-10 text-center">
        <p className="font-mono text-sm uppercase tracking-widest text-dim">
          {t.feed.noFilterResults}
        </p>
        {onClearFilter ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="hud-btn hud-btn-primary mt-4 inline-flex"
          >
            {t.feed.clearFilter}
          </button>
        ) : null}
      </div>
    );
  }

  const timeFmt = new Intl.DateTimeFormat(dateLocales[locale], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateFmt = new Intl.DateTimeFormat(dateLocales[locale], {
    day: "2-digit",
    month: "short",
  });

  let lastDay = "";

  return (
    <div className="relative">
      {/* vertical rail */}
      <div
        className="pointer-events-none absolute bottom-0 left-[15px] top-2 w-px bg-gradient-to-b from-amber/40 via-dim/20 to-transparent sm:left-[19px]"
        aria-hidden
      />

      <ul className="space-y-3">
        {rows.map((entry, i) => {
          const p = payloadOf(entry);
          const dice = diceStr(p);
          const title = str(p.title);
          const cellType = str(p.cellType);
          const meta = eventMeta(entry.eventType);
          const Icon = meta.Icon;

          const created = new Date(entry.createdAt);
          const dayKey = created.toDateString();
          const showSeparator = dayKey !== lastDay;
          if (showSeparator) lastDay = dayKey;

          const hour = timeFmt.format(created);
          const dateShort = dateFmt.format(created);

          return (
            // The type is on the row so a filter can be checked against what
            // actually rendered, rather than against the query that fed it.
            <li
              key={entry.id}
              data-event-type={entry.eventType}
              className="animate-hud-rise"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              {showSeparator ? <DaySeparator date={created} t={t.feed} locale={locale} /> : null}
              <div className="relative flex gap-3 sm:gap-4">
                {/* dot on rail */}
                <div className="relative z-10 flex shrink-0 flex-col items-center">
                  <span
                    className={`flex size-8 items-center justify-center border ${dotStyles[meta.variant]} [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="mt-1 font-mono text-[10px] leading-none text-dim">{hour}</span>
                </div>

                {/* card */}
                <div className="hud-card group flex min-w-0 flex-1 flex-col overflow-hidden p-0 hover:border-amber/20">
                  {/* top accent line by variant */}
                  <div
                    className={`h-px w-full ${meta.variant === "amber" ? "bg-amber/40" : meta.variant === "military" ? "bg-military/40" : meta.variant === "danger" ? "bg-danger/40" : meta.variant === "sky" ? "bg-sky-400/40" : meta.variant === "violet" ? "bg-violet-400/40" : "bg-dim/20"}`}
                    aria-hidden
                  />

                  <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
                    {/* avatar + time */}
                    <div className="flex items-center gap-3">
                      <Avatar entry={entry} fallback={t.feed.fallbackPlayer} />
                      <div className="hidden sm:block">
                        <div className="font-mono text-[11px] uppercase tracking-widest text-dim">
                          {dateShort} • {hour}
                        </div>
                        <div className="font-mono text-[10px] text-dim/60">{entry.eventType}</div>
                      </div>
                    </div>

                    {/* main message */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-zinc-200">
                        <EventLine entry={entry} t={t.feed} dict={t} locale={locale} />
                      </p>

                      {/* payload chips */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {title ? (
                          <span className="inline-flex max-w-full items-center gap-1.5 border border-amber/20 bg-amber/10 px-2 py-1 font-mono text-xs text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                            <CubeIcon className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">“{title}”</span>
                          </span>
                        ) : null}
                        {dice ? (
                          <span
                            className={`inline-flex items-center gap-1 border px-2 py-1 font-mono text-xs tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${meta.variant === "military" ? "border-military/30 bg-military/10 text-military" : meta.variant === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-dim/20 bg-raised text-amber"}`}
                          >
                            {dice} <span className="text-dim/60">{t.feed.diceLabel}</span>
                          </span>
                        ) : null}
                        {cellType ? (
                          <span className="border border-sky-400/20 bg-sky-500/10 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-sky-300 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                            {cellType}
                          </span>
                        ) : null}
                        {(() => {
                          const rating = num(p.rating);
                          return (
                            <>
                              {rating ? (
                                <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                                  <StarIcon className="h-3 w-3" aria-hidden /> {rating}/10
                                </span>
                              ) : null}
                              <span
                                className={`hidden sm:inline-flex border px-2 py-0.5 font-display text-[11px] uppercase tracking-widest ${variantStyles[meta.variant]}`}
                              >
                                {meta.label}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      {(() => {
                        const notes = str(p.notes) ?? str(p.comment) ?? str(p.reason);
                        const rating = num(p.rating);
                        // only show notes block for passed/dropped where it exists and not already shown as chip
                        if (!notes && rating === null) return null;
                        // for game_passed/dropped show full comment
                        if (
                          entry.eventType === "game_passed" ||
                          entry.eventType === "game_dropped"
                        ) {
                          return notes ? (
                            <p className="mt-3 line-clamp-3 border-l-2 border-amber/20 pl-3 text-sm leading-snug text-dim">
                              “{notes}”
                            </p>
                          ) : null;
                        }
                        return null;
                      })()}
                    </div>

                    {/* player badge on mobile */}
                    <div className="flex w-full items-center justify-between gap-2 border-t border-dim/10 pt-2 sm:hidden">
                      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                        {entry.displayName ?? entry.username ?? t.feed.fallbackPlayer}
                        {isBotUsername(entry.username) ? (
                          <BotBadge label={t.core.common.bot} />
                        ) : null}
                      </span>
                      <span className="font-mono text-[10px] text-dim">{hour}</span>
                    </div>
                  </div>

                  {/* quick link to player */}
                  {entry.username ? (
                    <Link
                      href={`/players/${entry.username}`}
                      className="flex items-center justify-between border-t border-dim/10 bg-raised/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-dim hover:text-amber sm:px-4"
                    >
                      <span>@{entry.username}</span>
                      <ArrowRightIcon className="size-3.5" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
