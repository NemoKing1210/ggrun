import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import {
  ArrowRightIcon,
  ChartBarIcon,
  MapIcon,
  TrophyIcon,
  ClockIcon,
  BoltIcon,
  FireIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/status";
import { db } from "@/lib/infrastructure/db";
import { gameRolls, seasonPlayers, seasons, users } from "@/db/schema";
import { getOpenRoll } from "@/lib/modules/catalog/repository";
import { getPlayerMoves, getSeasonPlayerForUser } from "@/lib/modules/season/repository/players";
import { getActiveSeason } from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const { t } = await getT();
  return { title: format(t.profile.metaTitle, { username }) };
}

function roleVariant(role: string): "amber" | "military" | "danger" | "dim" | "violet" {
  if (role === "admin") return "danger";
  if (role === "judge") return "violet";
  if (role === "player") return "military";
  return "dim";
}

export default async function PlayerProfilePage({ params }: Params) {
  const { username } = await params;
  const { t, locale } = await getT();

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) notFound();

  const [participations, rollStats, activeSeason] = await Promise.all([
    db
      .select({ sp: seasonPlayers, season: seasons })
      .from(seasonPlayers)
      .innerJoin(seasons, eq(seasons.id, seasonPlayers.seasonId))
      .where(eq(seasonPlayers.playerId, user.id))
      .orderBy(desc(seasons.createdAt)),
    db
      .select({ status: gameRolls.status, total: count() })
      .from(gameRolls)
      .innerJoin(seasonPlayers, eq(seasonPlayers.id, gameRolls.seasonPlayerId))
      .where(eq(seasonPlayers.playerId, user.id))
      .groupBy(gameRolls.status),
    getActiveSeason(),
  ]);

  const activeParticipation = activeSeason ? await getSeasonPlayerForUser(activeSeason.id, user.id) : null;
  const recentMoves = activeParticipation ? await getPlayerMoves(activeParticipation.id, 10) : [];
  const openRoll = activeParticipation ? await getOpenRoll(activeParticipation.id) : null;

  const rollsByStatus = new Map(rollStats.map((r) => [r.status, Number(r.total)]));
  const totalRolls = rollStats.reduce((acc, r) => acc + Number(r.total), 0);

  const joinedFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "uk" ? "uk-UA" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const moveFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "uk" ? "uk-UA" : "ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const links = Array.isArray(user.links) ? (user.links as Array<{ network: string; url: string }>) : [];
  const displayName = user.displayName ?? user.username;

  return (
    <PageContainer>
      {/* HERO — banner + dossier */}
      <div className="hud-card overflow-hidden">
        {/* banner */}
        <div className="relative h-44 overflow-hidden border-b border-dim/15 bg-raised sm:h-56">
          {user.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.bannerUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,#1a1a18_0_14px,#22221e_14px_28px)]">
              <div className="absolute inset-0 bg-gradient-to-br from-amber/[0.12] via-transparent to-military/[0.08]" />
              <div
                className="absolute inset-0 opacity-[0.035]"
                style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, #f2a900 1px, transparent 0)",
                  backgroundSize: "22px 22px",
                }}
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/40 to-transparent" aria-hidden />
          {/* top row badges */}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge variant={roleVariant(user.role)}>{t.admin.users.roles[user.role as keyof typeof t.admin.users.roles] ?? user.role}</Badge>
            {user.isBlocked ? <Badge variant="danger">{t.profile.blocked}</Badge> : null}
            <span className="hidden border border-white/15 bg-black/35 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-white/80 backdrop-blur sm:inline-flex">
              {format(t.profile.hero.joined, { date: joinedFmt.format(user.createdAt) })}
            </span>
          </div>
          <div className="absolute right-3 top-3 hidden sm:flex">
            <span className="border border-amber/30 bg-[#111110] px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-amber">
              {format(t.profile.hero.seasonsCount, { count: participations.length })} • {format(t.profile.hero.movesCount, { count: recentMoves.length })}
            </span>
          </div>
          <div className="hazard-tape absolute inset-x-0 bottom-0 opacity-90" aria-hidden />
        </div>

        {/* dossier */}
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* avatar */}
            <div className="-mt-10 sm:-mt-14 shrink-0">
              <div className="border-2 border-amber bg-raised p-1 shadow-[0_0_18px_rgba(242,169,0,0.25)]">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="size-20 object-cover sm:size-24" />
                ) : (
                  <span className="inline-flex size-20 items-center justify-center bg-raised font-display text-2xl tracking-widest text-dim sm:size-24">
                    {displayName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="font-display text-2xl uppercase tracking-wide text-amber sm:text-3xl">{displayName}</h1>
                <span className="font-mono text-sm text-dim">@{user.username}</span>
                {user.displayName && user.displayName !== user.username ? null : null}
              </div>
              {user.bio ? (
                <p className="mt-2 max-w-prose whitespace-pre-line text-sm leading-relaxed text-zinc-300">{user.bio}</p>
              ) : (
                <p className="mt-2 font-mono text-xs italic text-dim/60">—</p>
              )}

              {links.length ? (
                <div className="mt-3">
                  <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">{t.profile.hero.linksLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    {links.map((l, i) => (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-dim/20 bg-raised px-2.5 py-1 font-mono text-xs text-dim hover:border-amber/40 hover:text-amber"
                      >
                        <span className="uppercase tracking-widest">{t.settings.network[l.network as keyof typeof t.settings.network] ?? l.network}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-dim">
                <span className="inline-flex items-center gap-1.5 border border-dim/15 bg-raised px-2 py-1">
                  <ClockIcon className="h-3 w-3" aria-hidden />
                  {joinedFmt.format(user.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1.5 border border-dim/15 bg-raised px-2 py-1">
                  <StarIcon className="h-3 w-3 text-amber" aria-hidden />
                  {user.role}
                </span>
                {activeSeason ? (
                  <Link
                    href="/leaderboard"
                    className="border border-amber/30 bg-amber/10 px-2 py-1 uppercase tracking-widest text-amber hover:bg-amber hover:text-black"
                  >
                    {t.profile.hero.activeRun} <ArrowRightIcon className="size-3" aria-hidden /> {activeSeason.title}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {/* active run quick stats — full width below */}
          <div className="mt-5 w-full">
            {activeParticipation ? (
              <div className="hud-card border-amber/25 bg-raised p-4 sm:p-5">
                {/* header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dim/10 pb-3">
                  <div className="min-w-0">
                    <p className="font-display text-[11px] uppercase tracking-widest text-amber">{t.profile.hero.activeRun}</p>
                    <p className="truncate font-mono text-xs text-dim">{activeSeason?.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-dim">rerolls {activeParticipation.rerollsUsed}</span>
                    <StatusBadge status={activeParticipation.status} label={t.core.playerStatuses[activeParticipation.status]} />
                  </div>
                </div>

                {/* body */}
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {/* current game */}
                  <div className="flex items-center gap-3 border border-amber/20 bg-[#111110] p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                    {openRoll?.game?.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={openRoll.game.coverUrl}
                        alt=""
                        className="size-16 shrink-0 border border-[#3d3d34] object-cover shadow-[0_4px_12px_rgba(0,0,0,0.4)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                      />
                    ) : (
                      <span className="flex size-16 shrink-0 items-center justify-center border border-dashed border-dim/30 bg-background/40 font-mono text-[10px] uppercase tracking-widest text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                        {openRoll?.game ? "NO COVER" : "—"}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.currentGame}</p>
                      {openRoll?.game ? (
                        <>
                          <p className="mt-1 truncate font-display text-base uppercase tracking-wide text-amber">{openRoll.game.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {openRoll.game.platform ? (
                              <span className="border border-dim/30 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                                {openRoll.game.platform}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1.5 border border-amber/30 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                              <span className="size-1.5 animate-pulse bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                              {"// ACTIVE ROLL"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 font-mono text-xs text-dim/60">{t.profile.noCurrentGame}</p>
                      )}
                    </div>
                  </div>

                  {/* run stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex min-h-[84px] flex-col items-center justify-center border border-dim/15 bg-[#111110] p-3 text-center">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.cell}</div>
                      <div className="ammo-counter mt-1.5 text-2xl leading-none text-amber">{activeParticipation.position}</div>
                    </div>
                    <div className="flex min-h-[84px] flex-col items-center justify-center border border-dim/15 bg-[#111110] p-3 text-center">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.balance}</div>
                      <div className="ammo-counter mt-1.5 text-2xl leading-none text-amber">{activeParticipation.balancePoints}</div>
                    </div>
                    <div className="flex min-h-[84px] flex-col items-center justify-center border border-dim/15 bg-[#111110] p-3 text-center">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.streak}</div>
                      <div className="mt-1.5 flex items-center justify-center gap-1 font-mono text-sm">
                        <span className="text-military">+{activeParticipation.streakPass}</span>
                        <span className="text-dim/40">/</span>
                        <span className="text-danger">-{activeParticipation.streakDrop}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hud-card p-4 text-center">
                <p className="font-mono text-xs uppercase tracking-widest text-dim">{t.profile.hero.noActiveRun}</p>
                <p className="mt-1 font-mono text-[11px] text-dim/60">{totalRolls} rolls total • {participations.length} seasons</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* roll stats */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display flex items-center gap-2 text-sm uppercase tracking-widest text-dim">
            <ChartBarIcon className="h-4 w-4 text-amber" aria-hidden />
            {totalRolls} rolls
          </h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{participations.length} seasons • {recentMoves.length} moves</span>
            <Link
              href={`/players/${user.username}/games`}
              className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1 text-[11px]"
            >
              {t.profile.games.title}
              <ArrowRightIcon className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              { key: "rolled" as const, variant: "neutral" as const, icon: BoltIcon },
              { key: "in_progress" as const, variant: "sky" as const, icon: ClockIcon },
              { key: "passed" as const, variant: "military" as const, icon: TrophyIcon },
              { key: "dropped" as const, variant: "danger" as const, icon: FireIcon },
              { key: "rerolled" as const, variant: "violet" as const, icon: StarIcon },
            ] as const
          ).map(({ key, variant, icon: Icon }) => (
            <div key={key} className="hud-card p-4 text-center">
              <Icon className={`mx-auto h-5 w-5 ${variant === "military" ? "text-military" : variant === "danger" ? "text-danger" : variant === "violet" ? "text-violet-400" : variant === "sky" ? "text-sky-400" : "text-amber"}`} aria-hidden />
              <p className="ammo-counter mt-2 text-2xl leading-none text-amber">{rollsByStatus.get(key) ?? 0}</p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.rollStats[key]}</p>
              <div className="mx-auto mt-2 h-px w-8 bg-dim/20" aria-hidden />
            </div>
          ))}
        </div>
      </section>

      {/* seasons + moves two-column */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* seasons */}
        <section className="lg:col-span-3">
          <h2 className="font-display mb-3 flex items-center gap-2 text-sm uppercase tracking-widest text-amber">
            <TrophyIcon className="h-4 w-4" aria-hidden />
            {t.profile.seasonsHeading}
            <span className="ml-auto font-mono text-[11px] tracking-widest text-dim">{participations.length}</span>
          </h2>
          {participations.length === 0 ? (
            <EmptyState>{t.profile.emptySeasons}</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {participations.map(({ sp, season }) => (
                <Link
                  key={sp.id}
                  href={season.status === "active" ? "/leaderboard" : `/seasons/${season.slug}`}
                  className="hud-card hud-lift p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-display text-sm uppercase tracking-wide hover:text-amber">{season.title}</h3>
                    <StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />
                  </div>
                  <p className="font-mono text-[11px] text-dim">/{season.slug}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="border border-dim/15 bg-raised p-2">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.cell}</div>
                      <div className="ammo-counter text-lg leading-none text-amber">{sp.position}</div>
                    </div>
                    <div className="border border-dim/15 bg-raised p-2">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.balance}</div>
                      <div className="ammo-counter text-lg leading-none text-amber">{sp.balancePoints}</div>
                    </div>
                    <div className="border border-dim/15 bg-raised p-2">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.profile.streak}</div>
                      <div className="font-mono text-xs">
                        <span className="text-military">+{sp.streakPass}</span> <span className="text-dim/40">/</span> <span className="text-danger">-{sp.streakDrop}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-dim/10 pt-2">
                    <StatusBadge status={sp.status} label={t.core.playerStatuses[sp.status]} />
                    <span className="font-mono text-[11px] text-dim">rerolls {sp.rerollsUsed}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* moves timeline */}
        <section className="lg:col-span-2">
          <h2 className="font-display mb-3 flex items-center gap-2 text-sm uppercase tracking-widest text-amber">
            <MapIcon className="h-4 w-4" aria-hidden />
            {t.profile.movesHeading}
          </h2>
          {!activeParticipation ? (
            <div className="hud-card p-6 text-center font-mono text-xs uppercase tracking-widest text-dim">{t.profile.hero.noActiveRun}</div>
          ) : recentMoves.length === 0 ? (
            <EmptyState>{t.profile.emptyMoves}</EmptyState>
          ) : (
            <div className="relative">
              <div className="pointer-events-none absolute bottom-0 left-[11px] top-1 w-px bg-gradient-to-b from-amber/40 via-dim/15 to-transparent" aria-hidden />
              <ul className="space-y-3">
                {recentMoves.map((move) => (
                  <li key={move.id} className="relative flex gap-3">
                    <span className="relative z-10 mt-1 flex size-6 shrink-0 items-center justify-center border border-amber bg-amber text-[10px] font-bold text-black [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                      {move.diceResults.length}
                    </span>
                    <div className="hud-card min-w-0 flex-1 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-mono text-sm">
                          <span className="ammo-counter text-amber">{move.fromPosition}</span>
                          <ArrowRightIcon className="mx-1 inline size-3 text-dim" aria-hidden />
                          <span className="ammo-counter text-amber">{move.toPosition}</span>
                          {move.cellLandedType ? (
                            <Badge variant="sky" size="sm" className="ml-2 align-middle">
                              {move.cellLandedType}
                            </Badge>
                          ) : null}
                        </span>
                        <time dateTime={move.createdAt.toISOString()} className="shrink-0 font-mono text-[11px] text-dim">
                          {moveFmt.format(move.createdAt)}
                        </time>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 border border-amber/20 bg-amber/10 px-2 py-0.5 font-mono text-xs text-amber">
                          {move.diceResults.join(" + ")} <span className="text-dim/60">{t.profile.diceLabel}</span>
                        </span>
                        <span className="font-mono text-[11px] text-dim">ID {move.id.slice(0, 8)}…</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-center">
                <Link href="/board" className="inline-flex border border-dim/20 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-dim hover:border-amber/40 hover:text-amber">
                  View board <ArrowRightIcon className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
