import { SnakeBoard } from "@/components/board/snake-board";
import type { BoardMarker } from "@/components/board/snake-board";
import { CELL_THEME } from "@/components/board/cell-theme";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatusBadge, SEASON_STATUS_RU } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getLeaderboard } from "@/lib/repositories/players.repo";
import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
} from "@/lib/repositories/seasons.repo";

export const metadata = {
  title: "Поле — GGRun",
};

export default async function BoardPage() {
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const [board, leaderboard] = await Promise.all([
    getMainBoard(season.id),
    getLeaderboard(season.id),
  ]);

  if (!board) {
    return (
      <>
        <PageHeader kicker={`сезон «${season.title}»`} title="Поле" />
        <EmptyState>Поле сезона ещё не создано.</EmptyState>
      </>
    );
  }

  const cells = await getBoardCells(board.id);
  if (cells.length === 0) {
    return (
      <>
        <PageHeader kicker={`сезон «${season.title}»`} title="Поле" />
        <EmptyState>Поле пока не размечено — клетки появятся позже.</EmptyState>
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
        kicker={`сезон «${season.title}»`}
        title="Поле"
        right={<StatusBadge status={season.status} labels={SEASON_STATUS_RU} />}
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
                {CELL_THEME[type].name}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
