import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { StatusBadge } from "@/components/ui/status";
import { SeasonTabs } from "@/components/seasons/SeasonTabs";
import { CELL_THEME } from "@/components/board/cell-theme";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { getSeasonBySlug, getMainBoard, getBoardCells } from "@/lib/repositories/seasons.repo";
import { getLeaderboard, getSeasonStats } from "@/lib/repositories/players.repo";
import { getEventFeed } from "@/lib/repositories/players.repo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) return { title: t.seasons.detail.notFound };
  return { title: `${season.title} — ${t.seasons.metaTitle}` };
}

export default async function SeasonOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, locale } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) notFound();

  const kicker = format(t.core.common.seasonKicker, { season: season.title });

  const [board, leaderboard, stats, feed] = await Promise.all([
    getMainBoard(season.id),
    getLeaderboard(season.id),
    getSeasonStats(season.id),
    getEventFeed(season.id, 5),
  ]);

  const cells = board ? await getBoardCells(board.id) : [];
  const top = leaderboard.slice(0, 5);

  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <PageContainer>
      <div className="mb-4">
        <Link href="/seasons" className="font-mono text-xs uppercase tracking-widest text-dim hover:text-amber">
          {t.seasons.detail.backToArchive}
        </Link>
      </div>

      <PageHeader
        kicker={kicker}
        title={season.title}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />

      <SeasonTabs slug={season.slug} t={t} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Season info */}
        <div className="hud-card p-5">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">
            {t.seasons.overview.seasonInfoTitle}
          </h2>
          <dl className="mt-3 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <dt className="text-dim">{t.core.common.status}</dt>
              <dd>{t.core.seasonStatuses[season.status]}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dim">{t.seasons.card.startedAt}</dt>
              <dd>{season.startedAt ? dateFmt.format(season.startedAt) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dim">{t.seasons.card.finishedAt}</dt>
              <dd>{season.finishedAt ? dateFmt.format(season.finishedAt) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dim">{t.seasons.card.cells}</dt>
              <dd>{cells.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dim">{t.core.nav.board}</dt>
              <dd>{board ? board.name : "—"}</dd>
            </div>
          </dl>
          {season.status === "active" ? (
            <p className="mt-3 border border-amber/40 bg-amber/10 px-2 py-1 font-mono text-xs text-amber">
              {t.seasons.detail.currentBadge}
            </p>
          ) : null}
        </div>

        {/* Stats */}
        <div className="hud-card p-5">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">
            {t.seasons.overview.statsTitle}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-dim/30 bg-background p-2 text-center">
              <div className="ammo-counter text-lg text-amber">{leaderboard.length}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.overview.statPlayers}</div>
            </div>
            <div className="border border-dim/30 bg-background p-2 text-center">
              <div className="ammo-counter text-lg text-amber">{stats.totalMoves}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.overview.statMoves}</div>
            </div>
            <div className="border border-dim/30 bg-background p-2 text-center">
              <div className="ammo-counter text-lg text-military">{stats.passedRolls}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.overview.statPassed}</div>
            </div>
            <div className="border border-dim/30 bg-background p-2 text-center">
              <div className="ammo-counter text-lg text-danger">{stats.droppedRolls}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.overview.statDropped}</div>
            </div>
          </div>
        </div>

        {/* Top players */}
        <div className="hud-card p-5">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">
            {t.seasons.overview.topPlayersTitle}
          </h2>
          {top.length === 0 ? (
            <p className="mt-3 text-sm text-dim">{t.seasons.overview.noPlayers}</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {top.map((p, idx) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="ammo-counter w-6 text-center text-xs text-dim">#{idx + 1}</span>
                  <span className="flex-1 truncate font-mono text-sm">{p.displayName ?? p.username}</span>
                  <span className="font-mono text-xs text-amber">#{p.position}</span>
                  <Link href={`/players/${p.username}`} className="border border-dim/40 px-1 font-mono text-[10px] uppercase tracking-widest text-dim hover:text-amber">
                    →
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <Link href={`/seasons/${season.slug}/leaderboard`} className="mt-3 inline-block font-mono text-xs text-amber hover:underline">
            {t.seasons.overview.viewLeaderboard}
          </Link>
        </div>
      </div>

      {/* Board preview */}
      <section className="mt-6 hud-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">
            {t.seasons.overview.boardPreviewTitle}
          </h2>
          <Link href={`/seasons/${season.slug}/board`} className="font-mono text-xs text-amber hover:underline">
            {t.seasons.overview.viewBoard}
          </Link>
        </div>
        {cells.length === 0 ? (
          <p className="mt-3 text-sm text-dim">{t.seasons.overview.noBoard}</p>
        ) : (
          <div className="mt-3 grid grid-cols-8 gap-1 sm:grid-cols-12">
            {cells.slice(0, 48).map((cell) => {
              const theme = CELL_THEME[cell.cellType];
              return (
                <div
                  key={cell.id}
                  className={`flex aspect-square items-center justify-center border text-[10px] ${theme.box}`}
                  title={`${cell.position}: ${t.core.cellTypes[cell.cellType]}${cell.label ? ` — ${cell.label}` : ""}`}
                >
                  <span className="ammo-counter">{cell.position}</span>
                </div>
              );
            })}
            {cells.length > 48 ? (
              <div className="col-span-full text-center font-mono text-xs text-dim">+{cells.length - 48} more</div>
            ) : null}
          </div>
        )}
      </section>

      {/* Quick links */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link href={`/seasons/${season.slug}/feed`} className="hud-card p-4 hover:brightness-110">
          <div className="font-mono text-xs uppercase tracking-widest text-dim">{t.seasons.tabs.feed}</div>
          <div className="mt-1 font-display text-lg">{feed.length} events</div>
          <div className="mt-1 font-mono text-xs text-amber">{t.seasons.overview.viewFeed}</div>
        </Link>
        <Link href={`/seasons/${season.slug}/rules`} className="hud-card p-4 hover:brightness-110">
          <div className="font-mono text-xs uppercase tracking-widest text-dim">{t.seasons.tabs.rules}</div>
          <div className="mt-1 line-clamp-2 text-sm text-dim">{season.rulesMd ? season.rulesMd.slice(0, 100) : "—"}</div>
          <div className="mt-1 font-mono text-xs text-amber">{t.seasons.overview.viewRules}</div>
        </Link>
        <Link href={`/seasons/${season.slug}/leaderboard`} className="hud-card p-4 hover:brightness-110">
          <div className="font-mono text-xs uppercase tracking-widest text-dim">{t.seasons.tabs.leaderboard}</div>
          <div className="mt-1 font-display text-lg">{leaderboard.length} players</div>
          <div className="mt-1 font-mono text-xs text-amber">{t.seasons.overview.viewLeaderboard}</div>
        </Link>
      </div>
    </PageContainer>
  );
}
