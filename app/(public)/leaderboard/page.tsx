import Link from "next/link";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { StatusBadge } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getLeaderboard } from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.leaderboard.metaTitle };
}

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
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;
  const kicker = format(t.core.common.seasonKicker, { season: season.title });

  const rows = await getLeaderboard(season.id);

  return (
    <PageContainer>
      <PageHeader
        kicker={kicker}
        title={t.leaderboard.pageTitle}
        right={
          <StatusBadge
            status={season.status}
            label={t.core.seasonStatuses[season.status]}
          />
        }
      />

      {rows.length === 0 ? (
        <EmptyState>{t.leaderboard.empty}</EmptyState>
      ) : (
        <div className="hud-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-dim/30 font-mono text-xs uppercase tracking-widest text-dim">
                <th scope="col" className="px-4 py-3 font-normal">
                  {t.leaderboard.columns.place}
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  {t.leaderboard.columns.player}
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  {t.leaderboard.columns.cell}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  {t.leaderboard.columns.balance}
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  {t.leaderboard.columns.streaks}
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  {t.leaderboard.columns.status}
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
                    <span className="inline-flex items-center gap-0.5 text-military"><ChevronUpIcon className="h-3 w-3" aria-hidden />{row.streakPass}</span>{" "}
                    <span className="inline-flex items-center gap-0.5 text-danger"><ChevronDownIcon className="h-3 w-3" aria-hidden />{row.streakDrop}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge
                      status={row.status}
                      label={t.core.playerStatuses[row.status]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
