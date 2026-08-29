import Link from "next/link";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FlagIcon,
  StarIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";

import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getLeaderboard, type LeaderboardRow } from "@/lib/modules/season/repository/players";
import { getActiveSeason, getMainBoard, getBoardCells } from "@/lib/modules/season/repository/seasons";
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
  size = "sm",
}: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "size-20" : size === "md" ? "size-12" : "size-8";
  const font = size === "lg" ? "text-lg" : size === "md" ? "text-sm" : "text-xs";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${dim} shrink-0 border object-cover ${size === "lg" ? "border-amber/60" : "border-dim/30"}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center border bg-raised font-display text-dim ${size === "lg" ? "border-amber/40" : "border-dim/30"} ${font}`}
    >
      {(displayName ?? username).slice(0, 2).toUpperCase()}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden border border-dim/20 bg-[#111110] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
      <div className="h-full bg-amber transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

function ChampionCard({
  row,
  boardSize,
  t,
  label,
  rank,
  featured,
}: {
  row: LeaderboardRow;
  boardSize: number;
  t: Awaited<ReturnType<typeof getT>>["t"];
  label: string;
  rank: number;
  featured?: boolean;
}) {
  const progress =
    boardSize > 1 ? Math.round((row.position / (boardSize - 1)) * 100) : row.position ? 100 : 0;
  const clamped = Math.max(0, Math.min(100, progress));

  const links = Array.isArray(row.links) ? (row.links as Array<{ network: string; url: string }>) : [];

  if (featured) {
    return (
      <Link href={`/players/${row.username}`} className="hud-card group overflow-hidden border-amber/40 hud-lift block">
        {/* banner */}
        <div className="relative h-48 overflow-hidden border-b border-amber/30 bg-raised sm:h-56">
          {row.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.bannerUrl} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.02]" />
          ) : (
            <div className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,#1a1a18_0_14px,#22221e_14px_28px)]">
              <div className="absolute inset-0 bg-gradient-to-br from-amber/15 via-transparent to-military/15" />
              <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #f2a900 1px, transparent 0)`, backgroundSize: "22px 22px" }} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber/50 to-transparent" />

          {/* top badges */}
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 border border-amber bg-amber px-2.5 py-1 font-display text-xs uppercase tracking-widest text-black shadow-[0_0_12px_rgba(242,169,0,0.45)]">
              <TrophyIcon className="h-4 w-4" aria-hidden /> #{rank} {label}
            </span>
            <StatusBadge status={row.status} label={t.core.playerStatuses[row.status]} />
          </div>
          <div className="absolute right-3 top-3 hidden sm:flex">
            <span className="border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/80 backdrop-blur">
              {t.leaderboard.progress} {clamped}%
            </span>
          </div>
          {/* hazard tape */}
          <div className="hazard-tape absolute inset-x-0 bottom-0 h-[6px] opacity-90" aria-hidden />
        </div>

        {/* body overlapping avatar */}
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="-mt-12 sm:-mt-16 shrink-0">
              <div className="border-2 border-amber bg-raised p-1 shadow-[0_0_16px_rgba(242,169,0,0.25)]">
                <PlayerAvatar username={row.username} displayName={row.displayName} avatarUrl={row.avatarUrl} size="lg" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-display text-2xl uppercase tracking-wide group-hover:text-amber sm:text-3xl">
                  {row.displayName ?? row.username}
                </h3>
                <span className="font-mono text-sm text-dim">@{row.username}</span>
              </div>
              {row.bio ? <p className="mt-2 line-clamp-2 max-w-prose text-sm leading-relaxed text-zinc-300">{row.bio}</p> : null}
              {links.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {links.slice(0, 4).map((l, i) => (
                    <span key={i} className="border border-dim/20 bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                      {l.network}
                    </span>
                  ))}
                  {links.length > 4 ? <span className="px-1 py-0.5 font-mono text-[10px] text-dim">+{links.length - 4}</span> : null}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
              <span className="inline-flex items-center gap-1.5 border border-amber/30 bg-amber/10 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-amber">
                {t.leaderboard.viewProfile} <ArrowRightIcon className="size-3.5" aria-hidden />
              </span>
            </div>
          </div>

          {/* stats grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="border border-dim/20 bg-[#1a1a18] p-3 text-center">
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.leaderboard.columns.cell}</div>
              <div className="ammo-counter mt-1 text-2xl leading-none text-amber">{row.position}</div>
              <div className="mt-2">
                <ProgressBar value={clamped} />
              </div>
              <div className="mt-1 font-mono text-[10px] text-dim">{clamped}%</div>
            </div>
            <div className="border border-dim/20 bg-[#1a1a18] p-3 text-center">
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.leaderboard.columns.balance}</div>
              <div className="ammo-counter mt-1 text-2xl leading-none text-amber">{row.balancePoints}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-dim/60">{t.leaderboard.abbrev.points}</div>
            </div>
            <div className="border border-dim/20 bg-[#1a1a18] p-3 text-center">
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.leaderboard.columns.streaks}</div>
              <div className="mt-1 flex items-center justify-center gap-3 font-mono text-sm">
                <span className="inline-flex items-center gap-1 text-military">
                  <ChevronUpIcon className="h-3.5 w-3.5" /> {row.streakPass}
                </span>
                <span className="text-dim/30">/</span>
                <span className="inline-flex items-center gap-1 text-danger">
                  <ChevronDownIcon className="h-3.5 w-3.5" /> {row.streakDrop}
                </span>
              </div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-dim/60">{t.leaderboard.abbrev.passDrop}</div>
            </div>
            <div className="border border-dim/20 bg-[#1a1a18] p-3 text-center">
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.leaderboard.columns.place}</div>
              <div className="ammo-counter mt-1 text-2xl leading-none text-amber">#{rank}</div>
              <div className="mt-2 inline-flex">
                <Badge variant="amber" size="sm" className="!px-2 !py-0.5">
                  {label}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // compact podium card for #2 and #3
  const borderColor = rank === 2 ? "border-zinc-400/30" : "border-amber/20";
  const accent = rank === 2 ? "text-zinc-300" : "text-amber/80";
  const Icon = rank === 2 ? StarIcon : FlagIcon;
  return (
    <Link href={`/players/${row.username}`} className={`hud-card hud-lift group flex flex-col overflow-hidden ${borderColor}`}>
      <div className="relative h-24 overflow-hidden border-b border-dim/15 bg-raised">
        {row.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.bannerUrl} alt="" className="size-full object-cover opacity-80 group-hover:opacity-100 transition" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-700/20 via-transparent to-zinc-600/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 border bg-raised/90 px-2 py-1 font-display text-[11px] uppercase tracking-widest backdrop-blur">
          <Icon className={`h-3.5 w-3.5 ${accent}`} aria-hidden />
          <span className={accent}>#{rank}</span>
          <span className="text-dim">{label}</span>
        </div>
        <div className="absolute right-3 top-3">
          <StatusBadge status={row.status} label={t.core.playerStatuses[row.status]} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex gap-3">
          <PlayerAvatar username={row.username} displayName={row.displayName} avatarUrl={row.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base uppercase leading-none tracking-wide group-hover:text-amber">{row.displayName ?? row.username}</p>
            <p className="truncate font-mono text-xs text-dim">@{row.username}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="ammo-counter text-amber">
                {row.position} {t.leaderboard.cellLabel}
              </span>
              <span className="text-dim/40">•</span>
              <span className="text-dim">{clamped}%</span>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={clamped} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="border border-dim/15 bg-[#1a1a18] px-2 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">{t.leaderboard.abbrev.balanceShort}</div>
            <div className="ammo-counter text-sm text-amber">{row.balancePoints}</div>
          </div>
          <div className="border border-dim/15 bg-[#1a1a18] px-2 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">{t.leaderboard.abbrev.passShort}</div>
            <div className="font-mono text-sm text-military">+{row.streakPass}</div>
          </div>
          <div className="border border-dim/15 bg-[#1a1a18] px-2 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">{t.leaderboard.abbrev.dropShort}</div>
            <div className="font-mono text-sm text-danger">-{row.streakDrop}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function LeaderboardPage() {
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;
  const kicker = format(t.core.common.seasonKicker, { season: season.title });

  const [rows, board] = await Promise.all([getLeaderboard(season.id), getMainBoard(season.id)]);
  const cells = board ? await getBoardCells(board.id) : [];
  const boardSize = cells.length || Math.max(40, ...rows.map((r) => r.position + 1), 1);

  const champion = rows[0] ?? null;
  const runnerUp = rows[1] ?? null;
  const third = rows[2] ?? null;
  const rest = rows.slice(3);

  return (
    <PageContainer>
      <PageHeader
        kicker={t.leaderboard.kicker}
        title={t.leaderboard.pageTitle}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-dim">
        {kicker} • {format(t.leaderboard.stats.total, { count: rows.length } as never) ?? `${rows.length} players`} •{" "}
        {t.leaderboard.stats.boardSize} {boardSize}
      </p>
      <div className="hazard-tape mb-6" aria-hidden />

      {rows.length === 0 ? (
        <EmptyState>
          <span className="block">{t.leaderboard.empty}</span>
          <span className="mt-1 block font-mono text-xs normal-case tracking-normal text-dim">{t.leaderboard.emptyHint}</span>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {/* champion spotlight */}
          {champion && (
            <section>
              <ChampionCard row={champion} boardSize={boardSize} t={t} label={t.leaderboard.champion} rank={1} featured />
            </section>
          )}

          {/* podium 2-3 */}
          {(runnerUp || third) && (
            <section className="grid gap-4 sm:grid-cols-2">
              {runnerUp ? <ChampionCard row={runnerUp} boardSize={boardSize} t={t} label={t.leaderboard.runnerUp} rank={2} /> : <div className="hud-card flex items-center justify-center p-8 text-dim">—</div>}
              {third ? <ChampionCard row={third} boardSize={boardSize} t={t} label={t.leaderboard.thirdPlace} rank={3} /> : <div className="hud-card flex items-center justify-center p-8 text-dim">—</div>}
            </section>
          )}

          {/* full table */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm uppercase tracking-widest text-dim">
                {rows.length > 3 ? `${t.leaderboard.pageTitle} — ${rows.length} ${t.leaderboard.stats.total.toLowerCase()}` : t.leaderboard.pageTitle}
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.leaderboard.stats.contenders} {rows.length}</span>
            </div>

            <div className="hud-card overflow-hidden">
              {/* subtle top accent line */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-amber/30 to-transparent" aria-hidden />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-dim/25 bg-[#1e1e1c] font-mono text-[11px] uppercase tracking-widest text-dim">
                      <th scope="col" className="w-16 px-4 py-3 font-normal">
                        {t.leaderboard.columns.place}
                      </th>
                      <th scope="col" className="px-4 py-3 font-normal">
                        {t.leaderboard.columns.player}
                      </th>
                      <th scope="col" className="w-32 px-4 py-3 font-normal">
                        {t.leaderboard.progress}
                      </th>
                      <th scope="col" className="w-20 px-4 py-3 text-center font-normal">
                        {t.leaderboard.columns.cell}
                      </th>
                      <th scope="col" className="w-24 px-4 py-3 text-right font-normal">
                        {t.leaderboard.columns.balance}
                      </th>
                      <th scope="col" className="w-28 px-4 py-3 font-normal">
                        {t.leaderboard.columns.streaks}
                      </th>
                      <th scope="col" className="w-28 px-4 py-3 font-normal">
                        {t.leaderboard.columns.status}
                      </th>
                      <th scope="col" className="w-16 px-4 py-3" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const rank = i + 1;
                      const isTop3 = rank <= 3;
                      const pct = boardSize > 1 ? Math.round((row.position / (boardSize - 1)) * 100) : 0;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-dim/10 last:border-b-0 transition-colors hover:bg-amber/[0.04] ${isTop3 ? "bg-amber/[0.02]" : ""} ${rank === 1 ? "bg-amber/[0.06]" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex h-7 min-w-7 items-center justify-center border px-1.5 font-mono text-xs tracking-widest ${
                                rank === 1
                                  ? "border-amber bg-amber text-black"
                                  : rank === 2
                                    ? "border-zinc-400 bg-zinc-300 text-black"
                                    : rank === 3
                                      ? "border-[#c98f00] bg-[#8a5f00] text-white"
                                      : "border-dim/20 bg-raised text-dim"
                              }`}
                            >
                              {rank === 1 ? <TrophyIcon className="mr-1 h-3 w-3" aria-hidden /> : null}
                              {rank}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/players/${row.username}`} className="flex items-center gap-3 group/link">
                              <PlayerAvatar username={row.username} displayName={row.displayName} avatarUrl={row.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-semibold leading-none group-hover/link:text-amber">{row.displayName ?? row.username}</p>
                                <p className="truncate font-mono text-xs text-dim">@{row.username}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-28">
                              <ProgressBar value={pct} />
                              <div className="mt-1 font-mono text-[10px] text-dim">{pct}%</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="ammo-counter text-amber">{row.position}</span>
                            <span className="ml-1 font-mono text-[10px] text-dim">/ {boardSize - 1}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="ammo-counter text-amber">{row.balancePoints}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 font-mono text-xs">
                              <span className="inline-flex items-center gap-0.5 text-military">
                                <ChevronUpIcon className="h-3 w-3" aria-hidden />
                                {row.streakPass}
                              </span>
                              <span className="text-dim/30">/</span>
                              <span className="inline-flex items-center gap-0.5 text-danger">
                                <ChevronDownIcon className="h-3 w-3" aria-hidden />
                                {row.streakDrop}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={row.status} label={t.core.playerStatuses[row.status]} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/players/${row.username}`}
                              className="inline-flex border border-dim/20 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-dim hover:border-amber/40 hover:text-amber"
                            >
                              <ArrowRightIcon className="size-4" aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rest.length === 0 && rows.length <= 3 ? (
                <div className="border-t border-dim/15 px-4 py-3 text-center font-mono text-xs text-dim">{t.leaderboard.emptyHint}</div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </PageContainer>
  );
}
