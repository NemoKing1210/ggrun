import { redirect } from "next/navigation";

import RollCard from "@/components/dashboard/RollCard";
import { getCurrentUser } from "@/lib/auth/session";
import { getOpenRoll } from "@/lib/repositories/games.repo";
import {
  getPlayerMoves,
  getSeasonPlayerForUser,
} from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="hud-card px-5 py-3">
      <div className="ammo-counter text-3xl text-amber">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-widest text-dim">{label}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { locale, t } = await getT();

  const season = await getActiveSeason();
  if (!season) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 font-sans">
        <div className="hud-card p-6">
          <p className="text-dim">{t.core.dashboard.noActiveSeason}</p>
        </div>
      </main>
    );
  }

  const seasonPlayer = await getSeasonPlayerForUser(season.id, user.id);
  if (!seasonPlayer) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 font-sans">
        <div className="hud-card p-6">
          <p className="text-dim">{t.core.dashboard.notInSeason}</p>
        </div>
      </main>
    );
  }

  const [openRoll, lastMoves] = await Promise.all([
    getOpenRoll(seasonPlayer.id),
    getPlayerMoves(seasonPlayer.id, 10),
  ]);

  const dateFormatter = new Intl.DateTimeFormat(dateLocales[locale], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 font-sans">
      <header>
        <h1 className="font-display text-4xl uppercase tracking-wide text-amber">
          {t.core.dashboard.heading}
        </h1>
        <p className="mt-1 text-sm uppercase tracking-widest text-dim">
          {format(t.core.dashboard.seasonLine, {
            season: season.title,
            player: user.displayName ?? user.username,
          })}
        </p>
      </header>

      <section
        aria-label={t.core.dashboard.statsAria}
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <Stat label={t.core.dashboard.statPosition} value={seasonPlayer.position} />
        <Stat
          label={t.core.dashboard.statBalance}
          value={seasonPlayer.balancePoints}
        />
        <Stat
          label={t.core.dashboard.statStreakPass}
          value={seasonPlayer.streakPass}
        />
        <Stat
          label={t.core.dashboard.statStreakDrop}
          value={seasonPlayer.streakDrop}
        />
      </section>

      <RollCard
        seasonPlayerId={seasonPlayer.id}
        openRoll={
          openRoll
            ? {
                id: openRoll.id,
                game: openRoll.game
                  ? {
                      title: openRoll.game.title,
                      platform: openRoll.game.platform,
                      coverUrl: openRoll.game.coverUrl,
                    }
                  : null,
              }
            : null
        }
        rerollsUsed={seasonPlayer.rerollsUsed}
        lastDice={lastMoves[0]?.diceResults ?? null}
      />

      <section aria-label={t.core.dashboard.history} className="hud-card p-5">
        <h2 className="font-display text-xl uppercase tracking-widest">
          {t.core.dashboard.history}
        </h2>
        {lastMoves.length === 0 ? (
          <p className="mt-3 text-dim">{t.core.dashboard.historyEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#3d3d34]">
            {lastMoves.map((move) => (
              <li
                key={move.id}
                className="flex items-center justify-between gap-4 py-2"
              >
                <span className="ammo-counter w-16 text-amber">
                  {move.diceResults.join("+")}
                </span>
                <span className="font-mono text-sm">
                  {format(t.core.dashboard.moveFormat, {
                    from: move.fromPosition,
                    to: move.toPosition,
                  })}
                </span>
                <span className="flex-1 truncate text-right text-sm text-dim sm:text-left">
                  {move.cellLandedType
                    ? t.core.cellTypes[move.cellLandedType]
                    : "—"}
                </span>
                <time
                  dateTime={move.createdAt.toISOString()}
                  className="hidden shrink-0 font-mono text-xs text-dim sm:block"
                >
                  {dateFormatter.format(move.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
