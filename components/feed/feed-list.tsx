import type { FeedRow } from "@/lib/repositories/players.repo";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

function payloadOf(entry: FeedRow): Record<string, unknown> {
  if (entry.payload && typeof entry.payload === "object") {
    return entry.payload as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function diceStr(payload: Record<string, unknown>): string | null {
  const dice = payload.dice;
  if (!Array.isArray(dice)) return null;
  const nums = dice.filter((d): d is number => typeof d === "number");
  return nums.length > 0 ? nums.join("+") : null;
}

function PlayerName({
  entry,
  fallback,
}: {
  entry: FeedRow;
  fallback: string;
}) {
  const name = entry.displayName ?? entry.username ?? fallback;
  return <span className="text-amber">{name}</span>;
}

/** Human-readable event line. Dictionary and locale come from FeedList. */
function EventLine({
  entry,
  t,
}: {
  entry: FeedRow;
  t: Dictionary["feed"];
}) {
  const p = payloadOf(entry);
  const dice = diceStr(p);
  const diceSuffix = dice ? ` ${format(t.diceSuffix, { dice })}` : null;
  switch (entry.eventType) {
    case "game_rolled": {
      const title = str(p.title) ?? t.unknownTitle;
      return (
        <>
          <PlayerName entry={entry} fallback={t.fallbackPlayer} />
          {format(t.actions.rolled, { title })}
        </>
      );
    }
    case "game_rerolled": {
      const title = str(p.title) ?? t.unknownTitle;
      return (
        <>
          <PlayerName entry={entry} fallback={t.fallbackPlayer} />
          {format(t.actions.rerolled, { title })}
        </>
      );
    }
    case "game_passed":
      return (
        <>
          <PlayerName entry={entry} fallback={t.fallbackPlayer} />
          {t.actions.passed}
          {diceSuffix}
        </>
      );
    case "game_dropped":
      return (
        <>
          <PlayerName entry={entry} fallback={t.fallbackPlayer} />
          {t.actions.dropped}
          {diceSuffix}
        </>
      );
    case "moved": {
      const from = num(p.from);
      const to = num(p.to);
      return (
        <>
          <PlayerName entry={entry} fallback={t.fallbackPlayer} />
          {format(t.actions.movedFrom, { from: from ?? "?" })}
          <span className="ammo-counter text-amber">{to ?? "?"}</span>
          {diceSuffix}
        </>
      );
    }
    case "season_started":
      return <>{t.seasonStarted}</>;
    case "player_joined":
      return (
        <>
          <PlayerName entry={entry} fallback={t.fallbackPlayer} />
          {t.actions.joined}
        </>
      );
    case "admin_adjustment": {
      const reason = str(p.reason);
      return (
        <>
          {t.adminAdjustmentPrefix}
          <PlayerName entry={entry} fallback={t.fallbackPlayer} />
          {reason ? format(t.adminAdjustmentReason, { reason }) : null}
        </>
      );
    }
    default:
      return <>{format(t.defaultEvent, { type: entry.eventType })}</>;
  }
}

export async function FeedList({ rows }: { rows: FeedRow[] }) {
  const { t, locale } = await getT();
  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm uppercase tracking-widest text-dim">
        {t.feed.empty}
      </p>
    );
  }
  const dateFmt = new Intl.DateTimeFormat(dateLocales[locale], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <ul className="divide-y divide-dim/20">
      {rows.map((entry) => (
        <li key={entry.id} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
          <time
            dateTime={entry.createdAt.toISOString()}
            className="shrink-0 font-mono text-xs text-dim"
          >
            {dateFmt.format(entry.createdAt)}
          </time>
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <EventLine entry={entry} t={t.feed} />
          </p>
        </li>
      ))}
    </ul>
  );
}
