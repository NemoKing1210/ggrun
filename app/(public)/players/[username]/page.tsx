import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { count, desc, eq } from "drizzle-orm";

import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { db } from "@/lib/db";
import {
  gameRolls,
  rollStatusEnum,
  seasonPlayers,
  seasons,
  users,
} from "@/db/schema";
import { getPlayerMoves, getSeasonPlayerForUser } from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { username } = await params;
  const { t } = await getT();
  return { title: format(t.profile.metaTitle, { username }) };
}

export default async function PlayerProfilePage({ params }: Params) {
  const { username } = await params;
  const { t, locale } = await getT();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
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

  const activeParticipation = activeSeason
    ? await getSeasonPlayerForUser(activeSeason.id, user.id)
    : null;
  const recentMoves = activeParticipation
    ? await getPlayerMoves(activeParticipation.id, 10)
    : [];

  const rollsByStatus = new Map(
    rollStats.map((r) => [r.status, Number(r.total)]),
  );

  return (
    <PageContainer>
      {user.bannerUrl ? (
        <div
          className="mb-4 w-full overflow-hidden border border-[#3d3d34] bg-raised [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
          style={{ aspectRatio: "3 / 1" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.bannerUrl} alt="" className="size-full object-cover" />
        </div>
      ) : null}
      <header className="hud-card mb-8 flex flex-wrap items-center gap-5 p-6">
        <AvatarBadge name={user.displayName ?? user.username} src={user.avatarUrl ?? null} className="!size-16 !rounded-none" square />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl uppercase tracking-wide text-amber">
            {user.displayName ?? user.username}
          </h1>
          <p className="font-mono text-sm text-dim">@{user.username}</p>
          {user.bio ? (
            <p className="mt-2 max-w-prose whitespace-pre-line text-sm text-zinc-300">
              {user.bio}
            </p>
          ) : null}
          {Array.isArray(user.links) && user.links.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(user.links as Array<{ network: string; url: string }>).map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hud-btn !px-3 !py-1 text-xs"
                >
                  {t.settings.network[l.network as keyof typeof t.settings.network] ?? l.network}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {activeParticipation ? (
          <div className="ml-auto flex gap-6 font-mono text-sm">
            <span className="text-dim">
              {t.profile.streak}{" "}
              <span className="ammo-counter text-lg text-military">
                +{activeParticipation.streakPass}
              </span>
              {" / "}
              <span className="ammo-counter text-lg text-danger">
                −{activeParticipation.streakDrop}
              </span>
            </span>
            <span className="text-dim">
              {t.profile.balance}{" "}
              <span className="ammo-counter text-lg text-amber">
                {activeParticipation.balancePoints}
              </span>
            </span>
          </div>
        ) : null}
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {rollStatusEnum.enumValues.map((status) => (
          <div key={status} className="hud-card p-4 text-center">
            <p className="ammo-counter text-2xl leading-none text-amber">
              {rollsByStatus.get(status) ?? 0}
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-dim">
              {t.profile.rollStats[status]}
            </p>
          </div>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-xl uppercase tracking-wide text-amber">
          {t.profile.seasonsHeading}
        </h2>
        {participations.length === 0 ? (
          <EmptyState>{t.profile.emptySeasons}</EmptyState>
        ) : (
          <ul className="hud-card divide-y divide-dim/20 p-4">
            {participations.map(({ sp, season }) => (
              <li
                key={sp.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
              >
                <Link
                  href="/leaderboard"
                  className="min-w-0 flex-1 truncate font-semibold hover:text-amber"
                >
                  {season.title}
                </Link>
                <StatusBadge
                  status={season.status}
                  label={t.core.seasonStatuses[season.status]}
                />
                <span className="font-mono text-xs text-dim">
                  {t.profile.cell}{" "}
                  <span className="ammo-counter">{sp.position}</span>
                </span>
                <span className="w-14 text-right font-mono text-sm text-amber">
                  {sp.balancePoints}
                </span>
                <StatusBadge
                  status={sp.status}
                  label={t.core.playerStatuses[sp.status]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeParticipation ? (
        <section>
          <h2 className="font-display mb-3 text-xl uppercase tracking-wide text-amber">
            {t.profile.movesHeading}
          </h2>
          {recentMoves.length === 0 ? (
            <EmptyState>{t.profile.emptyMoves}</EmptyState>
          ) : (
            <ul className="hud-card divide-y divide-dim/20 p-4 font-mono text-sm">
              {recentMoves.map((move) => (
                <li
                  key={move.id}
                  className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <time
                    dateTime={move.createdAt.toISOString()}
                    className="shrink-0 text-xs text-dim"
                  >
                    {new Intl.DateTimeFormat(
                      locale === "en" ? "en-US" : locale === "uk" ? "uk-UA" : "ru-RU",
                      {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    ).format(move.createdAt)}
                  </time>
                  <span className="flex-1">
                    {move.fromPosition} → {move.toPosition}
                    {move.cellLandedType ? (
                      <span className="text-dim"> ({move.cellLandedType})</span>
                    ) : null}
                  </span>
                  <span className="text-amber">
                    {move.diceResults.join("+")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </PageContainer>
  );
}
