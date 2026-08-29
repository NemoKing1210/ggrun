import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { desc, eq } from "drizzle-orm";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/page-header";
import { PlayerGames, type PlayerGameRow } from "@/components/profile/PlayerGames";
import type { GameSummary } from "@/components/dashboard/RollCard";
import { db } from "@/lib/infrastructure/db";
import { gameRolls, gamesCatalog, seasonPlayers, seasons, users, type CatalogGame } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const { t } = await getT();
  return { title: format(t.profile.games.metaTitle, { username }) };
}

function toGameSummary(g: CatalogGame): GameSummary {
  const stores = Array.isArray(g.stores)
    ? g.stores
        .filter((s): s is { store?: unknown; url?: unknown } => !!s && typeof s === "object" && !!s.store && !!s.url)
        .map((s) => ({ store: String(s.store), url: String(s.url) }))
    : [];
  return {
    title: g.title,
    platform: g.platform,
    coverUrl: g.coverUrl,
    genres: g.genres,
    tags: g.tags,
    metacritic: g.metacritic,
    rating: g.rating != null ? Number(g.rating) : null,
    releasedAt: g.releasedAt ? g.releasedAt.toISOString() : null,
    esrb: g.esrb,
    description: g.description,
    playtimeHours: g.playtimeHours,
    stores,
    website: g.website,
    externalSource: g.externalSource,
  };
}

export default async function PlayerGamesPage({ params }: Params) {
  const { username } = await params;
  const { t } = await getT();

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) notFound();

  const rows = await db
    .select({ roll: gameRolls, game: gamesCatalog, season: seasons })
    .from(gameRolls)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, gameRolls.seasonPlayerId))
    .innerJoin(seasons, eq(seasons.id, seasonPlayers.seasonId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(seasonPlayers.playerId, user.id))
    .orderBy(desc(gameRolls.rolledAt));

  const games: PlayerGameRow[] = rows.map(({ roll, game, season }) => ({
    id: roll.id,
    status: roll.status,
    rolledAt: roll.rolledAt.toISOString(),
    resolvedAt: roll.resolvedAt ? roll.resolvedAt.toISOString() : null,
    rating: roll.rating != null ? Number(roll.rating) : null,
    notes: roll.notes,
    seasonTitle: season.title,
    game: game ? toGameSummary(game) : null,
  }));

  return (
    <PageContainer>
      <PageHeader
        kicker={t.profile.games.kicker}
        title={t.profile.games.title}
        right={
          <Link
            href={`/players/${username}`}
            className="hud-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <ArrowLeftIcon className="size-3.5" aria-hidden />
            {t.profile.games.backToProfile}
          </Link>
        }
      />
      <p className="mb-6 max-w-2xl font-mono text-xs uppercase tracking-widest text-dim">
        {t.profile.games.description}
      </p>
      <div className="hazard-tape mb-6" aria-hidden />

      <PlayerGames games={games} />
    </PageContainer>
  );
}
