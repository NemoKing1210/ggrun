import { redirect } from "next/navigation";

import RollCard from "@/components/dashboard/RollCard";
import { getCurrentUser } from "@/lib/auth/session";
import { getOpenRoll } from "@/lib/repositories/games.repo";
import {
  getPlayerMoves,
  getSeasonPlayerForUser,
  type PlayerMoveRow,
} from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";

const cellLabels: Record<NonNullable<PlayerMoveRow["cellLandedType"]>, string> =
  {
    start: "старт",
    finish: "финиш",
    normal: "обычная",
    penalty: "штраф",
    event: "событие",
    bonus: "бонус",
    teleport: "телепорт",
    custom: "особая",
  };

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="hud-card px-5 py-3">
      <div className="text-xs uppercase tracking-widest text-dim">{label}</div>
      <div className="ammo-counter mt-1 text-3xl text-amber">{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const season = await getActiveSeason();
  if (!season) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 font-sans">
        <div className="hud-card p-6">
          <p className="text-dim">Сейчас нет активного сезона.</p>
        </div>
      </main>
    );
  }

  const seasonPlayer = await getSeasonPlayerForUser(season.id, user.id);
  if (!seasonPlayer) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 font-sans">
        <div className="hud-card p-6">
          <p className="text-dim">Вы не участвуете в текущем сезоне.</p>
        </div>
      </main>
    );
  }

  const [openRoll, lastMoves] = await Promise.all([
    getOpenRoll(seasonPlayer.id),
    getPlayerMoves(seasonPlayer.id, 10),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 font-sans">
      <header>
        <h1 className="font-display text-4xl uppercase tracking-wide text-amber">
          Штаб игрока
        </h1>
        <p className="mt-1 text-sm uppercase tracking-widest text-dim">
          {season.title} · {user.displayName ?? user.username}
        </p>
      </header>

      <section
        aria-label="Показатели участника"
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <Stat label="Позиция" value={seasonPlayer.position} />
        <Stat label="Баланс" value={seasonPlayer.balancePoints} />
        <Stat label="Серия проходов" value={seasonPlayer.streakPass} />
        <Stat label="Серия дропов" value={seasonPlayer.streakDrop} />
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

      <section aria-label="История ходов" className="hud-card p-5">
        <h2 className="font-display text-xl uppercase tracking-widest">
          История ходов
        </h2>
        {lastMoves.length === 0 ? (
          <p className="mt-3 text-dim">
            Ходов пока нет — сделайте первый ролл.
          </p>
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
                  {move.fromPosition} → {move.toPosition}
                </span>
                <span className="flex-1 truncate text-right text-sm text-dim sm:text-left">
                  {move.cellLandedType ? cellLabels[move.cellLandedType] : "—"}
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
