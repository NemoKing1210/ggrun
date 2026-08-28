import { notFound } from "next/navigation";

import { BackLink } from "@/components/ui/BackLink";

import { CELL_THEME } from "@/components/board/cell-theme";
import { BoardView, type BoardPlayer, type BoardRoll } from "@/components/board/board-view";
import { SeasonTabs } from "@/components/seasons/SeasonTabs";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import { getActiveRolls, getLeaderboard, getSeasonStats } from "@/lib/modules/season/repository/players";
import { getBoardCells, getMainBoard, getSeasonBySlug } from "@/lib/modules/season/repository/seasons";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) return { title: t.seasons.detail.notFound };
  return { title: `${season.title} · ${t.board.metaTitle}` };
}

export default async function SeasonBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) notFound();

  const kicker = format(t.core.common.seasonKicker, { season: season.title });

  const [board, leaderboard, rolls, stats] = await Promise.all([
    getMainBoard(season.id),
    getLeaderboard(season.id),
    getActiveRolls(season.id),
    getSeasonStats(season.id),
  ]);

  if (!board) {
    return (
      <PageContainer>
        <BackLink href="/seasons" label={t.seasons.detail.backToArchive} />
        <PageHeader kicker={kicker} title={t.board.pageTitle} right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />} />
        <SeasonTabs slug={season.slug} t={t} />
        <div className="mt-6">
          <EmptyState>{t.board.emptyNoBoard}</EmptyState>
        </div>
      </PageContainer>
    );
  }

  const cells = await getBoardCells(board.id);
  if (cells.length === 0) {
    return (
      <PageContainer>
        <BackLink href="/seasons" label={t.seasons.detail.backToArchive} />
        <PageHeader kicker={kicker} title={t.board.pageTitle} right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />} />
        <SeasonTabs slug={season.slug} t={t} />
        <div className="mt-6">
          <EmptyState>{t.board.emptyNoCells}</EmptyState>
        </div>
      </PageContainer>
    );
  }

  const players: BoardPlayer[] = leaderboard.map((row) => ({
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    position: row.position,
    balancePoints: row.balancePoints,
    status: row.status,
    streakPass: row.streakPass,
    streakDrop: row.streakDrop,
    rerollsUsed: row.rerollsUsed,
  }));

  const boardRolls: BoardRoll[] = rolls.map((r) => ({
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    gameTitle: r.gameTitle,
    platform: r.platform,
    rolledAt: r.rolledAt.toISOString(),
  }));

  return (
    <PageContainer>
      <BackLink href="/seasons" label={t.seasons.detail.backToArchive} />
      <PageHeader
        kicker={kicker}
        title={t.board.pageTitle}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />
      <SeasonTabs slug={season.slug} t={t} />
      <div className="mt-6">
        <BoardView cells={cells} players={players} rolls={boardRolls} stats={stats} seasonStartedAt={season.startedAt?.toISOString() ?? null} />
      </div>
      <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
        {(Object.keys(CELL_THEME) as Array<keyof typeof CELL_THEME>)
          .filter((type) => type !== "normal")
          .map((type) => (
            <li key={type} className="flex items-center gap-2">
              <span className={`inline-block size-3 ${CELL_THEME[type].dot}`} aria-hidden />
              <span className="font-mono text-xs uppercase tracking-widest text-dim">{t.core.cellTypes[type]}</span>
            </li>
          ))}
      </ul>
    </PageContainer>
  );
}
