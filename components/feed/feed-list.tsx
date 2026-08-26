import Link from "next/link";

import type { FeedRow } from "@/lib/repositories/players.repo";

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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

function PlayerName({ entry }: { entry: FeedRow }) {
  const name = entry.displayName ?? entry.username ?? "Игрок";
  if (entry.username) {
    return (
      <Link
        href={`/players/${entry.username}`}
        className="text-amber hover:underline"
      >
        {name}
      </Link>
    );
  }
  return <span className="text-amber">{name}</span>;
}

/** Человекочитаемая строка события. */
export function EventLine({ entry }: { entry: FeedRow }) {
  const p = payloadOf(entry);
  const dice = diceStr(p);
  switch (entry.eventType) {
    case "game_rolled": {
      const title = str(p.title) ?? "???";
      return (
        <>
          <PlayerName entry={entry} /> выбросил игру: «{title}»
        </>
      );
    }
    case "game_rerolled": {
      const title = str(p.title) ?? "???";
      return (
        <>
          <PlayerName entry={entry} /> перебросил игру → «{title}»
        </>
      );
    }
    case "game_passed":
      return (
        <>
          <PlayerName entry={entry} /> прошёл игру
          {dice ? ` (кубики ${dice})` : null}
        </>
      );
    case "game_dropped":
      return (
        <>
          <PlayerName entry={entry} /> дропнул игру
          {dice ? ` (кубики ${dice})` : null}
        </>
      );
    case "moved": {
      const from = num(p.from);
      const to = num(p.to);
      return (
        <>
          <PlayerName entry={entry} />: клетка {from ?? "?"} →{" "}
          <span className="ammo-counter text-amber">{to ?? "?"}</span>
          {dice ? ` (кубики ${dice})` : null}
        </>
      );
    }
    case "season_started":
      return <>Сезон начался. Всем удачи!</>;
    case "player_joined":
      return (
        <>
          <PlayerName entry={entry} /> присоединился к сезону
        </>
      );
    case "admin_adjustment": {
      const reason = str(p.reason);
      return (
        <>
          Административная корректировка для <PlayerName entry={entry} />
          {reason ? `: ${reason}` : null}
        </>
      );
    }
    default:
      return <>Событие: {entry.eventType}</>;
  }
}

export function EventTime({ date }: { date: Date }) {
  return (
    <time
      dateTime={date.toISOString()}
      className="shrink-0 font-mono text-xs text-dim"
    >
      {DATE_FMT.format(date)}
    </time>
  );
}

export function FeedList({ rows }: { rows: FeedRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm uppercase tracking-widest text-dim">
        Событий пока нет — сезон только начинается.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-dim/20">
      {rows.map((entry) => (
        <li key={entry.id} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
          <EventTime date={entry.createdAt} />
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <EventLine entry={entry} />
          </p>
        </li>
      ))}
    </ul>
  );
}
