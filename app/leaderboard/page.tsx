import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/ui/page-header";
import {
  PLAYER_STATUS_RU,
  SEASON_STATUS_RU,
  StatusBadge,
} from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getLeaderboard } from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";

export const metadata = {
  title: "Лидерборд — GGRun",
};

function PlayerAvatar({
  username,
  displayName,
  avatarUrl,
}: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="size-8 shrink-0 border border-dim/40 object-cover"
      />
    );
  }
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center border border-dim/40 bg-raised font-mono text-xs text-dim">
      {(displayName ?? username).slice(0, 2).toUpperCase()}
    </span>
  );
}

export default async function LeaderboardPage() {
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const rows = await getLeaderboard(season.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        kicker={`сезон «${season.title}»`}
        title="Лидерборд"
        right={<StatusBadge status={season.status} labels={SEASON_STATUS_RU} />}
      />

      {rows.length === 0 ? (
        <EmptyState>В сезоне пока нет участников.</EmptyState>
      ) : (
        <div className="hud-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-dim/30 font-mono text-xs uppercase tracking-widest text-dim">
                <th scope="col" className="px-4 py-3 font-normal">
                  Место
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  Игрок
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  Клетка
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Баланс
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  Стрики
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  Статус
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className="border-b border-dim/15 last:border-b-0"
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`ammo-counter text-lg leading-none ${
                        i < 3 ? "text-amber" : ""
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/players/${row.username}`}
                      className="flex items-center gap-3 hover:text-amber"
                    >
                      <PlayerAvatar
                        username={row.username}
                        displayName={row.displayName}
                        avatarUrl={row.avatarUrl}
                      />
                      <span className="min-w-0 truncate font-semibold">
                        {row.displayName ?? row.username}
                      </span>
                    </Link>
                  </td>
                  <td className="ammo-counter px-4 py-2.5 leading-none">
                    {row.position}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber">
                    {row.balancePoints}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <span className="text-military">▲{row.streakPass}</span>{" "}
                    <span className="text-danger">▼{row.streakDrop}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge
                      status={row.status}
                      labels={PLAYER_STATUS_RU}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
