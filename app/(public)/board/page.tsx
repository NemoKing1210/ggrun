import { SnakeBoard } from "@/components/board/snake-board";
import type { BoardMarker } from "@/components/board/snake-board";
import { CELL_THEME } from "@/components/board/cell-theme";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getLeaderboard } from "@/lib/repositories/players.repo";
import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
} from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.board.metaTitle };
}

export default async function BoardPage() {
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const kicker = format(t.core.common.seasonKicker, { season: season.title });

  const [board, leaderboard] = await Promise.all([
    getMainBoard(season.id),
    getLeaderboard(season.id),
  ]);

  if (!board) {
    return (
      <>
        <PageHeader kicker={kicker} title={t.board.pageTitle} />
        <EmptyState>{t.board.emptyNoBoard}</EmptyState>
      </>
    );
  }

  const cells = await getBoardCells(board.id);
  if (cells.length === 0) {
    return (
      <>
        <PageHeader kicker={kicker} title={t.board.pageTitle} />
        <EmptyState>{t.board.emptyNoCells}</EmptyState>
      </>
    );
  }

  const markers: BoardMarker[] = leaderboard.map((row) => ({
    username: row.username,
    displayName: row.displayName,
    position: row.position,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker={kicker}
        title={t.board.pageTitle}
        right={
          <StatusBadge
            status={season.status}
            label={t.core.seasonStatuses[season.status]}
          />
        }
      />

      <SnakeBoard cells={cells} markers={markers} />

      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
        {(Object.keys(CELL_THEME) as Array<keyof typeof CELL_THEME>)
          .filter((type) => type !== "normal")
          .map((type) => (
            <li key={type} className="flex items-center gap-2">
              <span
                className={`inline-block size-3 ${CELL_THEME[type].dot}`}
                aria-hidden
              />
              <span className="font-mono text-xs uppercase tracking-widest text-dim">
                {t.core.cellTypes[type]}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
