import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { SeasonTabs } from "@/components/seasons/SeasonTabs";
import { getLeaderboard } from "@/lib/repositories/players.repo";
import { getSeasonBySlug } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) return { title: t.seasons.detail.notFound };
  return { title: `${season.title} · ${t.leaderboard.metaTitle}` };
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
      <img src={avatarUrl} alt={displayName ?? username} className="size-8 shrink-0 border border-dim/40 object-cover" />
    );
  }
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center border border-dim/40 bg-raised font-mono text-xs text-dim">
      {(displayName ?? username).slice(0, 2).toUpperCase()}
    </span>
  );
}

export default async function SeasonLeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) notFound();

  const kicker = format(t.core.common.seasonKicker, { season: season.title });
  const rows = await getLeaderboard(season.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/seasons" className="mb-4 inline-block font-mono text-xs uppercase tracking-widest text-dim hover:text-amber">
        {t.seasons.detail.backToArchive}
      </Link>
      <PageHeader
        kicker={kicker}
        title={t.leaderboard.pageTitle}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />
      <SeasonTabs slug={season.slug} t={t} />

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState>{t.leaderboard.empty}</EmptyState>
        ) : (
          <div className="hud-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-[#3d3d34] bg-background/60 font-mono text-[10px] uppercase tracking-widest text-dim">
                  <tr>
                    <th className="px-3 py-2 text-left">{t.leaderboard.columns.place}</th>
                    <th className="px-3 py-2 text-left">{t.leaderboard.columns.player}</th>
                    <th className="px-3 py-2 text-right">{t.leaderboard.columns.cell}</th>
                    <th className="px-3 py-2 text-right">{t.leaderboard.columns.balance}</th>
                    <th className="px-3 py-2 text-center">{t.leaderboard.columns.streaks}</th>
                    <th className="px-3 py-2 text-left">{t.leaderboard.columns.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3d3d34]">
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-raised/60">
                      <td className="px-3 py-2 font-mono text-xs text-dim">#{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/players/${row.username}`} className="flex items-center gap-2 hover:text-amber">
                          <PlayerAvatar username={row.username} displayName={row.displayName} avatarUrl={row.avatarUrl} />
                          <span className="font-mono text-sm">{row.displayName ?? row.username}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm">
                        <span className="ammo-counter text-amber">{row.position}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm">{row.balancePoints}</td>
                      <td className="px-3 py-2 text-center font-mono text-xs">
                        <span className="text-military">+{row.streakPass}</span>
                        <span className="text-dim"> / </span>
                        <span className="text-danger">-{row.streakDrop}</span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={row.status} label={t.core.playerStatuses[row.status]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
