import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { SeasonCard } from "@/components/seasons/SeasonCard";
import { getT } from "@/lib/i18n/server";
import { getActiveSeason, listPublicSeasons, getMainBoard, getBoardCells } from "@/lib/repositories/seasons.repo";
import { getLeaderboard } from "@/lib/repositories/players.repo";

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
        <PageHeader title={t.seasons.archiveTitle} />
        <p className="text-sm text-dim">{t.seasons.archiveDescription}</p>
        <div className="mt-6">
          <EmptyState>{t.seasons.archiveEmpty}</EmptyState>
        </div>
      </PageContainer>
    );
  }

  // Fetch stats per season in parallel (participants + cells)
  const statsList = await Promise.all(
    seasons.map(async (season) => {
      const [board, leaderboard] = await Promise.all([
        getMainBoard(season.id),
        getLeaderboard(season.id),
      ]);
      const cells = board ? await getBoardCells(board.id) : [];
      return {
        season,
        participants: leaderboard.length,
        cells: cells.length,
      };
    }),
  );

  const finishedCount = seasons.filter((s) => s.status === "finished" || s.status === "archived").length;

  return (
    <PageContainer>
      <PageHeader
        title={t.seasons.archiveTitle}
        kicker={finishedCount > 0 ? `${finishedCount} ${t.core.nav.seasons.toLowerCase()}` : undefined}
      />
      <p className="mb-6 font-mono text-xs uppercase tracking-widest text-dim">
        {t.seasons.archiveDescription}
      </p>

      <div className="hazard-tape mb-6" aria-hidden />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statsList.map(({ season, participants, cells }) => (
          <SeasonCard
            key={season.id}
            season={season}
            t={t}
            locale={locale}
            stats={{ participants, cells }}
            isCurrent={activeSeason?.id === season.id}
          />
        ))}
      </div>
    </PageContainer>
  );
}
