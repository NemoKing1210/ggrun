import { CELL_THEME } from "@/components/board/cell-theme";
import { BoardView, CellTypeIcon, type BoardPlayer, type BoardRoll } from "@/components/board/board-view";
import { BoardLiveRefresh } from "@/components/board/board-live-refresh";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { StatusBadge } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import { getActiveEffectsBySeason } from "@/lib/modules/iee/repository/effects";
import {
  getActiveRolls,
  getLeaderboard,
  getSeasonStats,
} from "@/lib/modules/season/repository/players";
import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
} from "@/lib/modules/season/repository/seasons";

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
  const effects = await getActiveEffectsBySeason(season.id);
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
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    position: row.position,
    balancePoints: row.balancePoints,
    status: row.status,
    streakPass: row.streakPass,
    streakDrop: row.streakDrop,
    rerollsUsed: row.rerollsUsed,
    effects: effects.get(row.id) ?? [],
  }));

  const boardRolls: BoardRoll[] = rolls.map((r) => ({
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    gameTitle: r.gameTitle,
    platform: r.platform,
    rolledAt: r.rolledAt.toISOString(),
    status: r.status,
    coverUrl: r.coverUrl,
    genres: r.genres ?? [],
    metacritic: r.metacritic,
    releasedAt: r.releasedAt ? r.releasedAt.toISOString() : null,
    description: r.description,
    playtimeHours: r.playtimeHours,
    externalSource: r.externalSource,
  }));

  return (
    <PageContainer>
      <PageHeader
        kicker={kicker}
        title={t.board.pageTitle}
        right={
          <StatusBadge
            kind="season"
            status={season.status}
            label={t.core.seasonStatuses[season.status]}
          />
        }
      />

      <BoardLiveRefresh seasonId={season.id} />
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
        <dl className="hud-card grid gap-x-8 px-4 py-1 sm:grid-cols-2">
          {(
            ["start", "finish", "bonus", "penalty", "teleport", "event", "custom"] as const
          ).map((type) => (
            <div
              key={type}
              className="flex items-center gap-3 border-b border-[#242420] py-2.5 last:border-b-0 sm:last:col-span-2"
            >
              <span
                aria-hidden
                className={`inline-flex size-9 shrink-0 items-center justify-center border [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${CELL_THEME[type].box}`}
              >
                <CellTypeIcon type={type} className="size-4" />
              </span>
              <div className="min-w-0">
                <dt className="font-mono text-[11px] font-semibold uppercase tracking-widest">
                  {t.core.cellTypes[type]}
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-dim">
                  {t.board.descriptions[type]}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </section>
    </PageContainer>
  );
}
