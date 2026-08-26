import Link from "next/link";

import { FeedList } from "@/components/feed/feed-list";
import { StatusBadge, SEASON_STATUS_RU } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import {
  getEventFeed,
  getLeaderboard,
} from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";

const SECTIONS = [
  { href: "/board", label: "Поле", hint: "карта сезона и позиции игроков" },
  { href: "/leaderboard", label: "Лидерборд", hint: "полная таблица standings" },
  { href: "/feed", label: "Лента", hint: "все события сезона" },
  { href: "/rules", label: "Правила", hint: "как играть" },
];

export default async function HomePage() {
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const [top, feed] = await Promise.all([
    getLeaderboard(season.id),
    getEventFeed(season.id, 5),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <section className="hud-card overflow-hidden">
        <div className="hazard-tape h-2 w-full" />
        <div className="p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-dim">
            {"// текущий сезон"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <h1 className="font-display text-4xl uppercase tracking-wide text-amber sm:text-5xl">
              {season.title}
            </h1>
            <StatusBadge
              status={season.status}
              labels={SEASON_STATUS_RU}
            />
          </div>
          {season.startedAt ? (
            <p className="mt-2 font-mono text-sm text-dim">
              Старт:{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(season.startedAt)}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="hud-card p-6">
          <header className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl uppercase tracking-wide text-amber">
              Топ-5
            </h2>
            <Link
              href="/leaderboard"
              className="font-mono text-xs uppercase tracking-widest text-dim hover:text-amber"
            >
              вся таблица →
            </Link>
          </header>
          {top.length === 0 ? (
            <p className="font-mono text-sm uppercase tracking-widest text-dim">
              Участников ещё нет.
            </p>
          ) : (
            <ol>
              {top.slice(0, 5).map((row, i) => (
                <li
                  key={row.id}
                  className="flex items-baseline gap-3 border-b border-dim/20 py-2 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span className="ammo-counter w-6 shrink-0 text-right text-lg leading-none">
                    {i + 1}
                  </span>
                  <Link
                    href={`/players/${row.username}`}
                    className="min-w-0 flex-1 truncate font-semibold hover:text-amber"
                  >
                    {row.displayName ?? row.username}
                  </Link>
                  <span className="font-mono text-xs text-dim">
                    кл.{row.position}
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-sm text-amber">
                    {row.balancePoints}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="hud-card p-6">
          <header className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl uppercase tracking-wide text-amber">
              Последние события
            </h2>
            <Link
              href="/feed"
              className="font-mono text-xs uppercase tracking-widest text-dim hover:text-amber"
            >
              вся лента →
            </Link>
          </header>
          <FeedList rows={feed} />
        </section>
      </div>

      <nav className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="hud-btn justify-start">
            <span>
              {s.label}
              <br />
              <span className="font-mono text-xs font-normal normal-case tracking-normal text-dim">
                {s.hint}
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export const metadata = {
  title: "GGRun — игровой забег",
};
