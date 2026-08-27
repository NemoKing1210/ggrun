import {
  ArrowsRightLeftIcon,
  BoltIcon,
  FireIcon,
  FlagIcon,
  GiftIcon,
  PuzzlePieceIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { CELL_THEME } from "@/components/board/cell-theme";
import {
  BoardView,
  type BoardPlayer,
  type BoardRoll,
} from "@/components/board/board-view";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { StatusBadge } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import {
  getActiveRolls,
  getLeaderboard,
  getSeasonStats,
} from "@/lib/repositories/players.repo";
import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
} from "@/lib/repositories/seasons.repo";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.board.metaTitle };
}

export default async function BoardPage() {
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const kicker = format(t.core.common.seasonKicker, { season: season.title });

  const [board, leaderboard, rolls, stats] = await Promise.all([
    getMainBoard(season.id),
    getLeaderboard(season.id),
    getActiveRolls(season.id),
    getSeasonStats(season.id),
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

      <BoardView
        cells={cells}
        players={players}
        rolls={boardRolls}
        stats={stats}
        seasonStartedAt={season.startedAt?.toISOString() ?? null}
      />

      {/* Legend */}
      <section aria-label="Cell legend" className="mt-6">
        <div className="hazard-tape mb-3 opacity-60" aria-hidden />
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
          {"// LEGEND · CELL TYPES"}
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {(
            [
              { type: "start" as const, Icon: FlagIcon, desc: t.board.descriptions.start },
              { type: "finish" as const, Icon: TrophyIcon, desc: t.board.descriptions.finish },
              { type: "bonus" as const, Icon: GiftIcon, desc: t.board.descriptions.bonus },
              { type: "penalty" as const, Icon: FireIcon, desc: t.board.descriptions.penalty },
              { type: "teleport" as const, Icon: ArrowsRightLeftIcon, desc: t.board.descriptions.teleport },
              { type: "event" as const, Icon: BoltIcon, desc: t.board.descriptions.event },
              { type: "custom" as const, Icon: PuzzlePieceIcon, desc: t.board.descriptions.custom },
            ] as const
          ).map(({ type, Icon, desc }) => (
            <li
              key={type}
              className={`hud-card flex flex-col gap-2 p-3 ${CELL_THEME[type].box} border`}
            >
              <span className="flex items-center gap-2">
                <span className={`inline-flex size-7 items-center justify-center border bg-raised [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${CELL_THEME[type].box}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-widest">
                  {t.core.cellTypes[type]}
                </span>
                <span className={`ml-auto size-1.5 shrink-0 ${CELL_THEME[type].dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
              </span>
              <span className="line-clamp-2 font-mono text-[11px] leading-snug text-dim">{desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}
