import { PageContainer } from "@/components/ui/PageContainer";
import { getT } from "@/lib/i18n/server";
import { getActiveSeason, listPublicSeasons, getMainBoard, getBoardCells } from "@/lib/modules/season/repository/seasons";
import { getLeaderboard, getSeasonStats } from "@/lib/modules/season/repository/players";
import { SeasonsArchiveClient } from "@/components/seasons/SeasonsArchiveClient";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.seasons.metaTitle };
}

export default async function SeasonsArchivePage() {
  const { t, locale } = await getT();
  const [seasons, activeSeason] = await Promise.all([listPublicSeasons(), getActiveSeason()]);

  if (seasons.length === 0) {
    return (
      <PageContainer>
        <div className="hud-card border-dashed p-8 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <p className="font-display text-lg uppercase tracking-wide text-dim">{t.seasons.archiveTitle}</p>
          <p className="mt-1 text-sm text-zinc-500">{t.seasons.archiveEmpty}</p>
        </div>
      </PageContainer>
    );
  }

  const withStats = await Promise.all(
    seasons.map(async (season) => {
      const [board, leaderboard, stats] = await Promise.all([
        getMainBoard(season.id),
        getLeaderboard(season.id),
        getSeasonStats(season.id),
      ]);
      const cells = board ? await getBoardCells(board.id) : [];
      const top = leaderboard[0];
      return {
        season,
        stats: {
          participants: leaderboard.length,
          cells: cells.length,
          moves: stats.totalMoves,
          topPlayerName: top ? (top.displayName ?? top.username) : null,
          topPlayer: top
            ? {
                username: top.username,
                displayName: top.displayName,
                avatarUrl: top.avatarUrl,
                lastSeenAt: top.lastSeenAt,
              }
            : null,
          boardCells: cells,
          participantsAvatars: leaderboard.slice(0, 6).map((r) => ({
            username: r.username,
            displayName: r.displayName,
            avatarUrl: r.avatarUrl,
            lastSeenAt: r.lastSeenAt,
          })),
        },
      };
    }),
  );

  const totalPlayers = withStats.reduce((acc, s) => acc + s.stats.participants, 0);

  return (
    <PageContainer>
      <SeasonsArchiveClient seasons={withStats} activeSeason={activeSeason} totalPlayers={totalPlayers} t={t} locale={locale} />
    </PageContainer>
  );
}
