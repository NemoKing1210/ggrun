import type { Metadata } from "next";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  BoltIcon,
  ChartBarIcon,
  CheckCircleIcon,
  FireIcon,
  FlagIcon,
  MapPinIcon,
  StarIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { redirect } from "next/navigation";

import RollCard, { type GameSummary } from "@/components/dashboard/RollCard";
import { InventoryPanel } from "@/components/dashboard/InventoryPanel";
import { ChallengesPanel, type ChallengeRow } from "@/components/dashboard/ChallengesPanel";
import { GamesHistory } from "@/components/dashboard/GamesHistory";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { AvatarFallback } from "@/components/ui/AvatarFallback";
import { CELL_THEME } from "@/components/board/cell-theme";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { BotBadge } from "@/components/ui/BotBadge";
import { isBotUsername } from "@/lib/shared/utils/bots";
import { StatusBadge } from "@/components/ui/status";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import {
  getCatalogPreview,
  getOpenRoll,
  getPendingRerollForPlayer,
  getPendingCompletionForPlayer,
  getRecentRolls,
} from "@/lib/modules/catalog/repository";
import { listEffects, listItems, SeasonConfigSchema } from "@/lib/engine";
import {
  getActiveEffectsWithCaster,
  getHeldItems,
  getPlayerEvents,
  listTargetOptions,
} from "@/lib/modules/iee/repository";
import {
  getPlayerMoves,
  getSeasonPlayerForUser,
} from "@/lib/modules/season/repository/players";
import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
} from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

function StatTile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="hud-card relative overflow-hidden px-3 py-2.5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent" aria-hidden />
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
        <Icon className="size-3.5 opacity-60" aria-hidden />
        {label}
      </div>
      <div
        className={`ammo-counter mt-1 truncate font-display text-lg leading-none ${accent ? "text-amber" : "text-foreground"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function CellMiniIcon({ type, className }: { type: string; className?: string }) {
  const cls = className ?? "size-3.5";
  switch (type) {
    case "start":
      return <FlagIcon className={cls} aria-hidden />;
    case "finish":
      return <TrophyIcon className={cls} aria-hidden />;
    case "penalty":
      return <FireIcon className={cls} aria-hidden />;
    case "bonus":
      return <StarIcon className={cls} aria-hidden />;
    case "teleport":
      return <ArrowsRightLeftIcon className={cls} aria-hidden />;
    case "event":
      return <BoltIcon className={cls} aria-hidden />;
    default:
      return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.core.dashboard.metaTitle };
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { locale, t } = await getT();

  const season = await getActiveSeason();
  if (!season) {
    return (
      <PageContainer>
        <PageHeader title={t.core.dashboard.heading} />
        <EmptyState>{t.core.dashboard.noActiveSeason}</EmptyState>
      </PageContainer>
    );
  }

  const seasonPlayer = await getSeasonPlayerForUser(season.id, user.id);
  if (!seasonPlayer) {
    return (
      <PageContainer>
        <PageHeader
          kicker={format(t.core.common.seasonKicker, { season: season.title })}
          title={t.core.dashboard.heading}
          right={<StatusBadge kind="season" status={season.status} label={t.core.seasonStatuses[season.status]} />}
        />
        <EmptyState>{t.core.dashboard.notInSeason}</EmptyState>
      </PageContainer>
    );
  }

  const [openRoll, pendingReroll, pendingCompletion, lastMoves, recentRolls, board, catalogPreview] = await Promise.all([
    getOpenRoll(seasonPlayer.id),
    getPendingRerollForPlayer(seasonPlayer.id),
    getPendingCompletionForPlayer(seasonPlayer.id),
    getPlayerMoves(seasonPlayer.id, 12),
    getRecentRolls(seasonPlayer.id, 12),
    getMainBoard(season.id),
    getCatalogPreview(20),
  ]);

  // --- items, statuses and who they may be aimed at -------------------------
  const seasonConfig = SeasonConfigSchema.safeParse(season.config);
  const iee = seasonConfig.success ? seasonConfig.data.iee : null;
  const [heldItems, activeEffects, targetOptions, playerEvents] = iee?.enabled
    ? await Promise.all([
        getHeldItems(seasonPlayer.id),
        getActiveEffectsWithCaster(seasonPlayer.id),
        iee.allowTargetingOthers
          ? listTargetOptions(season.id, seasonPlayer.id, iee.pvpProtectionMoves)
          : Promise.resolve([]),
        getPlayerEvents(seasonPlayer.id),
      ])
    : [[], [], [], []];

  // Catalog names live in the dictionaries; a reward only stores keys.
  const catalogName = (path: string): string => {
    const parts = path.split(".");
    let node: unknown = t;
    for (const part of parts) {
      if (typeof node !== "object" || node === null) return path;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" ? node : path;
  };
  const itemNames = Object.fromEntries(
    listItems().map((d) => [d.key, catalogName(d.i18n.name)]),
  );
  const effectNames = Object.fromEntries(
    listEffects().map((d) => [d.key, catalogName(d.i18n.name)]),
  );
  const challenges: ChallengeRow[] = playerEvents.map((e) => ({
    id: e.id,
    title: e.title,
    descriptionMd: e.descriptionMd,
    status: e.status,
    requiresProof: e.requiresProof,
    proof: e.proof,
    adminNote: e.adminNote,
    dueAt: e.dueAt ? e.dueAt.toISOString() : null,
    reward: (e.reward ?? {}) as ChallengeRow["reward"],
  }));

  // What the *next* roll will actually experience.
  //
  // Expiry is lazy — a spent status keeps `state = 'active'` until the player's
  // next resolve sweeps it — so "still in force" is a real question, and it now
  // has exactly one answer: `getActiveEffectsWithCaster` applies the rule in
  // SQL, the same way the board and the leaderboard do. This page used to carry
  // its own copy, reading the roll that had already happened, so a status spent
  // a moment earlier lingered here showing "0 rolls left" — present to the
  // player, inert to the game.
  const statuses = activeEffects
    .map((e) => ({
      id: e.id,
      effectKey: e.effectKey,
      polarity: e.polarity,
      chargesLeft: e.chargesLeft,
      // Rolls this will still affect, counting the next one — so it never
      // reads zero while the status is on screen.
      rollsLeft:
        e.expiresAfterRollSeq === null
          ? null
          : Math.max(0, e.expiresAfterRollSeq - seasonPlayer.rollSeq),
      castByUsername: e.castByUsername,
    }));

  const cells = board ? await getBoardCells(board.id) : [];
  const totalCells = cells.length || 1;
  const progressPct = Math.round((seasonPlayer.position / Math.max(1, totalCells - 1)) * 100);

  const dateFormatter = new Intl.DateTimeFormat(dateLocales[locale], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  const toGameSummary = (g: {
    title: string;
    platform: string | null;
    coverUrl: string | null;
    genres: string[];
    tags: string[];
    metacritic: number | null;
    rating: string | number | null;
    releasedAt: Date | null;
    esrb: string | null;
    description: string | null;
    playtimeHours: number | null;
    stores: unknown;
    website: string | null;
    externalSource: string | null;
  } | null): GameSummary | null => {
    if (!g) return null;
    const stores = Array.isArray(g.stores)
      ? g.stores.filter((s): s is { store?: unknown; url?: unknown } => !!s && typeof s === "object" && !!s.store && !!s.url)
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
  };

  const kicker = format(t.core.dashboard.seasonLine, {
    season: season.title,
    player: user.displayName ?? user.username,
  });

  return (
    <PageContainer className="flex flex-col gap-6">
      {/* Operator ID card */}
      <div className="hud-card flex items-center gap-4 p-4">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/30 to-transparent" aria-hidden />
        <AvatarBadge name={user.displayName ?? user.username} src={user.avatarUrl ?? null} seed={user.id} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            {"// OPERATOR"} <span className="text-amber">· {season.title}</span>
          </div>
          <div className="mt-0.5 truncate font-display text-xl uppercase tracking-wide leading-none">
            {user.displayName ?? user.username}
            {isBotUsername(user.username) ? <BotBadge label={t.core.common.bot} className="ml-2 align-middle" /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] leading-none text-dim">
            <span className="border border-dim/30 bg-background/40 px-1.5 py-0.5 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              @{user.username}
            </span>
            <span className="hidden h-3 w-px bg-dim/20 sm:inline-block" aria-hidden />
            <span className="hidden truncate sm:inline">{kicker}</span>
            <StatusBadge kind="player" status={seasonPlayer.status} label={t.core.playerStatuses[seasonPlayer.status]} />
          </div>
        </div>
        <Link
          href={`/players/${user.username}`}
          className="hud-btn hidden shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs sm:inline-flex"
        >
          Profile <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>

      <PageHeader
        kicker={kicker}
        title={t.core.dashboard.heading}
        right={<StatusBadge kind="season" status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />

      {/* Stats */}
      <section aria-label={t.core.dashboard.statsTitle}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label={t.core.dashboard.statPosition} value={`${seasonPlayer.position} / ${Math.max(0, totalCells - 1)}`} accent icon={MapPinIcon} />
          <StatTile label={t.core.dashboard.statBalance} value={String(seasonPlayer.balancePoints)} accent icon={BanknotesIcon} />
          <StatTile label={t.core.dashboard.statStreakPass} value={String(seasonPlayer.streakPass)} icon={CheckCircleIcon} />
          <StatTile label={t.core.dashboard.statStreakDrop} value={String(seasonPlayer.streakDrop)} icon={FireIcon} />
          <StatTile label={t.core.dashboard.statRerolls} value={String(seasonPlayer.rerollsUsed)} icon={ArrowPathIcon} />
          <StatTile label={t.core.dashboard.statProgress} value={`${progressPct}%`} accent icon={ChartBarIcon} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-3 flex-1 overflow-hidden border border-[#3d3d34] bg-[#151514] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <div
              className="h-full bg-amber shadow-[0_0_10px_rgba(242,169,0,0.5)] transition-all duration-500"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_22px,rgba(0,0,0,0.35)_22px_23px)] opacity-60" aria-hidden />
            <div className="absolute inset-y-0 left-1/4 w-px bg-black/40" aria-hidden />
            <div className="absolute inset-y-0 left-1/2 w-px bg-black/40" aria-hidden />
            <div className="absolute inset-y-0 left-3/4 w-px bg-black/40" aria-hidden />
          </div>
          <span className="ammo-counter shrink-0 font-mono text-xs tracking-widest text-amber">{progressPct}%</span>
        </div>
      </section>

      {/* Board progress mini */}
      {cells.length > 0 ? (
        <section aria-label={t.core.dashboard.boardProgressTitle} className="hud-card overflow-hidden bg-[#121210] p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#2a2a22] pb-2">
            <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest">
              <MapPinIcon className="size-4 text-amber" aria-hidden />
              {t.core.dashboard.boardProgressTitle}
              <span className="hidden font-mono text-[10px] tracking-widest text-dim sm:inline">
                {"// "}
                {seasonPlayer.position} / {totalCells - 1}
              </span>
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
              {"// TRACK "} {cells.length} CELLS
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-12">
            {cells.map((cell) => {
              const theme = CELL_THEME[cell.cellType];
              const isHere = cell.position === seasonPlayer.position;
              const isPast = cell.position < seasonPlayer.position;
              return (
                <div
                  key={cell.id}
                  className={`group relative flex aspect-square flex-col items-center justify-center border p-1 text-center transition-all [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${theme.box} ${isHere ? "ring-2 ring-amber ring-offset-1 ring-offset-[#121210] z-10 scale-[1.04] shadow-[0_0_12px_rgba(242,169,0,0.35)]" : isPast ? "opacity-70" : ""}`}
                  title={cell.label ? `${t.core.cellTypes[cell.cellType]}: ${cell.label}` : t.core.cellTypes[cell.cellType]}
                >
                  {cell.cellType !== "normal" ? (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.08]">
                      <CellMiniIcon type={cell.cellType} className="size-6" />
                    </span>
                  ) : null}
                  <span className={`absolute right-1 top-1 size-1 ${theme.dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
                  {isHere ? (
                    <span className="absolute inset-[3px] flex items-center justify-center bg-amber/12 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" aria-hidden>
                      <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(242,169,0,0.18),transparent_70%)]" aria-hidden />
                    </span>
                  ) : null}
                  {isHere ? (
                    <span className="relative flex flex-col items-center">
                      <span className="relative inline-flex size-7 items-center justify-center overflow-hidden border border-amber bg-amber/20 shadow-[0_0_8px_rgba(242,169,0,0.4)] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                        {user.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <AvatarFallback
                            seed={user.id}
                            name={user.displayName ?? user.username}
                            className="size-full"
                            emojiClassName="text-sm"
                          />
                        )}
                      </span>
                      <span className="ammo-counter mt-0.5 text-[9px] font-bold leading-none text-amber">{String(cell.position).padStart(2, "0")}</span>
                    </span>
                  ) : (
                    <>
                      <span className="ammo-counter relative text-xs leading-none">{String(cell.position).padStart(2, "0")}</span>
                      {cell.cellType !== "normal" ? (
                        <span className="relative mt-0.5">
                          <CellMiniIcon type={cell.cellType} className="size-3 opacity-60" />
                        </span>
                      ) : null}
                    </>
                  )}
                  {isHere ? (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-amber px-1 font-mono text-[8px] font-bold leading-none tracking-widest text-black [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
                      {t.core.dashboard.youHere}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden border border-[#2a2a22] bg-[#1a1a14] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            <div
              className="h-full bg-amber/70 transition-all"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            {(Object.keys(CELL_THEME) as Array<keyof typeof CELL_THEME>)
              .filter((k) => k !== "normal")
              .map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                  <span className={`inline-block size-2 ${CELL_THEME[k].dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
                  {t.core.cellTypes[k]}
                </span>
              ))}
          </div>
        </section>
      ) : null}

      {/* Current game */}
      {iee?.enabled && challenges.length > 0 ? (
        <ChallengesPanel
          challenges={challenges}
          itemNames={itemNames}
          effectNames={effectNames}
        />
      ) : null}

      {iee?.enabled && (heldItems.length > 0 || statuses.length > 0) ? (
        <InventoryPanel
          items={heldItems.map((i) => ({
            id: i.id,
            itemKey: i.itemKey,
            chargesLeft: i.chargesLeft,
            source: i.source,
          }))}
          statuses={statuses}
          targets={targetOptions}
          allowTargeting={iee.allowTargetingOthers}
        />
      ) : null}

      {/*
        A finished run offers no roll.

        `player_status` used to be display-only: the button stayed live for a
        participant who had finished, withdrawn or been eliminated, and the
        server took the roll. The server refuses it now, and a button that only
        produces an error is worse than no button.
      */}
      {seasonPlayer.status !== "active" ? (
        <section className="hud-card flex flex-col items-center gap-2 p-8 text-center">
          <TrophyIcon className="size-10 text-amber" aria-hidden />
          <h2 className="font-display text-lg uppercase tracking-widest">
            {t.core.dashboard.runOver}
          </h2>
          <StatusBadge
            kind="player"
            status={seasonPlayer.status}
            label={t.core.playerStatuses[seasonPlayer.status]}
          />
          {seasonPlayer.finishedAt ? (
            <p className="text-base text-zinc-300">
              {format(t.core.dashboard.finishedOn, {
                date: dateFormatter.format(seasonPlayer.finishedAt),
              })}
            </p>
          ) : null}
          <p className="text-sm text-dim">{t.core.dashboard.runOverHint}</p>
        </section>
      ) : (
      <RollCard
        seasonPlayerId={seasonPlayer.id}
        openRoll={
          openRoll
            ? {
                id: openRoll.id,
                game: toGameSummary(openRoll.game),
                rolledAt: openRoll.rolledAt.toISOString(),
              }
            : null
        }
        pendingCompletion={
          pendingCompletion
            ? { id: pendingCompletion.id, outcome: pendingCompletion.outcome as "passed" | "dropped", reason: pendingCompletion.reason, rating: pendingCompletion.rating, requestedAt: pendingCompletion.requestedAt.toISOString() }
            : null
        }
        pendingReroll={
          pendingReroll
            ? { id: pendingReroll.id, reason: pendingReroll.reason, requestedAt: pendingReroll.requestedAt.toISOString() }
            : null
        }
        rerollsUsed={seasonPlayer.rerollsUsed}
        lastDice={lastMoves[0]?.diceResults ?? null}
        catalogGames={catalogPreview.map((g) => ({ title: g.title, coverUrl: g.coverUrl, platform: g.platform }))}
      />
      )}

      {/* Game history */}
      <section aria-label={t.core.dashboard.history} className="grid gap-6 lg:grid-cols-2">
        <div className="hud-card flex flex-col p-0">
          <div className="flex items-center gap-2 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
            <ChartBarIcon className="size-4 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">{t.core.dashboard.history}</h2>
            <span className="ml-auto font-mono text-[10px] tracking-widest text-dim">{lastMoves.length} moves</span>
          </div>
          <div className="flex-1 p-4">
            {lastMoves.length === 0 ? (
              <p className="border border-dashed border-dim/20 bg-background/30 px-4 py-8 text-center font-mono text-xs tracking-wide text-dim">
                {t.core.dashboard.historyEmpty}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {lastMoves.map((move) => (
                  <li
                    key={move.id}
                    className="group flex items-center gap-3 border border-[#3d3d34] bg-background/40 px-3 py-2.5 transition-colors hover:border-amber/30 hover:bg-background/60 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  >
                    <span className="ammo-counter inline-flex shrink-0 items-center justify-center border border-amber/40 bg-amber/10 px-2 py-1 font-mono text-xs tracking-wide text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                      {move.diceResults.join("+")}
                    </span>
                    <span className="font-mono text-sm tracking-wide">
                      {format(t.core.dashboard.moveFormat, { from: move.fromPosition, to: move.toPosition })}
                    </span>
                    <span className="hidden items-center gap-1.5 sm:inline-flex">
                      {move.cellLandedType ? (
                        <>
                          <span className={`inline-block size-2 ${CELL_THEME[move.cellLandedType].dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
                          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
                            {t.core.cellTypes[move.cellLandedType]}
                          </span>
                          <CellMiniIcon type={move.cellLandedType} className="size-3.5 opacity-50" />
                        </>
                      ) : (
                        <span className="font-mono text-xs text-dim">—</span>
                      )}
                    </span>
                    <time dateTime={move.createdAt.toISOString()} className="ml-auto hidden shrink-0 font-mono text-[11px] text-dim sm:block">
                      {dateFormatter.format(move.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="hud-card flex flex-col p-0">
          <div className="flex items-center gap-2 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
            <TrophyIcon className="size-4 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">{t.core.dashboard.games}</h2>
            <span className="ml-auto font-mono text-[10px] tracking-widest text-dim">{recentRolls.length} rolls</span>
          </div>
          <div className="flex-1 p-4">
            {recentRolls.length === 0 ? (
              <p className="border border-dashed border-dim/20 bg-background/30 px-4 py-8 text-center font-mono text-xs tracking-wide text-dim">
                {t.core.dashboard.historyEmpty}
              </p>
            ) : (
              <GamesHistory
                rolls={recentRolls.slice(0, 8).map((roll) => {
                  const fromLabel = dateFormatter.format(roll.rolledAt);
                  const toLabel = roll.resolvedAt ? dateFormatter.format(roll.resolvedAt) : null;
                  return {
                    id: roll.id,
                    status: roll.status,
                    rolledAt: roll.rolledAt.toISOString(),
                    timeLabel: toLabel ? `${fromLabel} → ${toLabel}` : fromLabel,
                    game: toGameSummary(roll.game),
                    rating: roll.rating != null ? Number(roll.rating) : null,
                    notes: roll.notes,
                  };
                })}
              />
            )}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
