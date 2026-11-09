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
import { InventoryPanel, type PickOffer } from "@/components/dashboard/InventoryPanel";
import { DecisionPanel, type DecisionCard } from "@/components/dashboard/DecisionPanel";
import { GameChoicePanel, type GameChoiceCard } from "@/components/dashboard/GameChoicePanel";
import { ReactionPanel, type ReactionWindowCard } from "@/components/dashboard/ReactionPanel";
import { DecisionsLiveRefresh } from "@/components/realtime/decisions-live";
import { ChallengesPanel, type ChallengeRow } from "@/components/dashboard/ChallengesPanel";
import { GamesHistory } from "@/components/dashboard/GamesHistory";
import { LiveBadge, LiveFlash, SeasonLiveRefresh } from "@/components/realtime/season-live";
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
  getApprovedRerollForRoll,
  getPendingRerollForPlayer,
  getPendingCompletionForPlayer,
  getRecentRolls,
} from "@/lib/modules/catalog/repository";
import { SeasonConfigSchema } from "@/lib/engine";
import {
  boardObjectsBySeason,
  getPlayerEvents,
  listActiveEffects,
  listHeldItems,
  listRollConditions,
  listTargetOptions,
  standingBySeason,
} from "@/lib/modules/iee/repository";
import { getSeasonRegistry } from "@/lib/modules/iee/registry";
import { decisionView, listPendingDecisions, reactionWindowView } from "@/lib/modules/iee/decisions";
import { offeredGames, type GameChoiceContext } from "@/lib/modules/iee/executor";
import { pickOffers } from "@/lib/modules/catalog/repository";
import { freeObjectCells } from "@/lib/modules/game/service/objects";
import { entryChoiceOptions } from "@/lib/modules/iee/use";
import { getPlayerMoves, getSeasonPlayerForUser } from "@/lib/modules/season/repository/players";
import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
} from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { IeeIcon } from "@/components/iee/IeeIcon";
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
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent"
        aria-hidden
      />
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
          right={
            <StatusBadge
              kind="season"
              status={season.status}
              label={t.core.seasonStatuses[season.status]}
            />
          }
        />
        <EmptyState>{t.core.dashboard.notInSeason}</EmptyState>
      </PageContainer>
    );
  }

  const [
    openRoll,
    pendingReroll,
    pendingCompletion,
    lastMoves,
    recentRolls,
    board,
    catalogPreview,
  ] = await Promise.all([
    getOpenRoll(seasonPlayer.id),
    getPendingRerollForPlayer(seasonPlayer.id),
    getPendingCompletionForPlayer(seasonPlayer.id),
    getPlayerMoves(seasonPlayer.id, 12),
    getRecentRolls(seasonPlayer.id, 12),
    getMainBoard(season.id),
    getCatalogPreview(20),
  ]);
  // A judge's approval of a reroll is a permission the player uses from here.
  const approvedReroll = openRoll ? await getApprovedRerollForRoll(openRoll.id) : null;
  // What the games were to be passed with (wave C, spec §6.17): the one in flight and the history's.
  const rollConditions = await listRollConditions([...(openRoll ? [openRoll.id] : []), ...recentRolls.slice(0, 8).map((r) => r.id)]);
  const conditionsOf = (rollId: string) => (rollConditions.get(rollId) ?? []).map((c) => ({ id: c.id, text: c.text, from: c.from }));

  // --- items, statuses and who they may be aimed at -------------------------
  const seasonConfig = SeasonConfigSchema.safeParse(season.config);
  const iee = seasonConfig.success ? seasonConfig.data.iee : null;
  const registry = await getSeasonRegistry(season.id);
  const [heldItems, activeEffects, targetOptions, playerEvents, standing, pendingDecisions] = iee?.enabled
    ? await Promise.all([
        listHeldItems(seasonPlayer.id, registry),
        listActiveEffects(seasonPlayer.id, registry),
        iee.allowTargetingOthers
          ? listTargetOptions(season.id, seasonPlayer.id, iee.pvpProtectionMoves)
          : Promise.resolve([]),
        getPlayerEvents(seasonPlayer.id),
        // What holds (wave B, spec §6.13): whether the player may use items, who is out of reach.
        standingBySeason(season.id, registry),
        // What waits for the player to choose (wave B, spec §7.6).
        listPendingDecisions(seasonPlayer.id),
      ])
    : [[], [], [], [], new Map(), []];

  // The season's entries as the client sees them (spec §8): names, rule text
  // with this season's numbers, glyphs. A reward only stores keys, so the
  // challenge list looks its names up here too.
  const views = registry.viewsByKey();
  const namesOf = (kind: "item" | "effect") =>
    Object.fromEntries(
      Object.values(views)
        .filter((v) => v.kind === kind)
        .map((v) => [v.key, v.name[locale]]),
    );
  const itemNames = namesOf("item");
  const effectNames = namesOf("effect");
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

  // The choices waiting for the player (spec §7.6), and the bonus items they choose among — what they hold now.
  const decisionCards: DecisionCard[] = pendingDecisions.flatMap((row) => {
    const view = decisionView(row);
    if (!view) return [];
    const asker = view.revisionId ? registry.instanceView(view.revisionId) : null;
    return [
      {
        id: view.id,
        name: view.name,
        ruleText: asker?.ruleText ?? null,
        then: view.then,
        count: view.count,
        orKeep: view.orKeep,
        defaultChoice: view.defaultChoice,
      },
    ];
  });
  const decisionItems = heldItems.flatMap((i) => {
    const view = registry.instanceView(i.revisionId);
    return view && view.character === "bonus" ? [{ id: i.id, view }] : [];
  });
  // A turn paused for the player's reaction (spec §7.4): the throw, and the items it offers as they are held now.
  const reactionCards: ReactionWindowCard[] = pendingDecisions.flatMap((row) => {
    const view = reactionWindowView(row);
    if (!view) return [];
    const offers = view.offers.flatMap((o) => {
      const held = heldItems.find((i) => i.id === o.instanceId);
      const entry = held ? registry.instanceView(held.revisionId) : null;
      return entry ? [{ instanceId: o.instanceId, view: entry }] : [];
    });
    return [{ id: view.id, outcome: view.outcome, faces: view.faces, result: view.result, from: view.from, to: view.to, offers }];
  });

  // A choice of games waiting for the player (wave C, spec §7.12): the games as they were offered.
  const choiceCard: GameChoiceCard | null =
    pendingDecisions.flatMap((row): GameChoiceCard[] => {
      if (row.kind !== "game_choice") return [];
      const context = row.context as Partial<GameChoiceContext>;
      return [{ id: row.id, games: offeredGames(row), origin: context.origin ?? "roll", itemName: context.names ?? null }];
    })[0] ?? null;
  // What a pick for the next game may take (wave C, spec §6.16): read once, and only when a held item asks.
  const picksAsked = heldItems.some((i) => {
    const kind = registry.item(i.revisionId)?.usage.pick;
    return kind === "genre" || kind === "years";
  });
  const offers = picksAsked ? await pickOffers(seasonPlayer.id) : null;
  // The cells an object may stand on (wave D, spec §6.18): read only when a held item places itself.
  const cellsAsked = heldItems.some((i) => registry.item(i.revisionId)?.usage.pick === "cell");
  const freeCells = cellsAsked ? await freeObjectCells(season.id) : [];
  // What stands on the track — the player's own way included (wave D, spec §6.18).
  const objectAt = new Map((await boardObjectsBySeason(season.id, registry)).map((o) => [o.cell, o]));
  const pickOf = (kind: "genre" | "years" | "game" | "cell" | null | undefined): PickOffer | undefined =>
    kind === "genre"
      ? { kind, options: offers?.genres ?? [] }
      : kind === "years"
        ? { kind, options: offers?.decades ?? [] }
        : kind === "game"
          ? { kind }
          : kind === "cell"
            ? { kind, options: freeCells }
            : undefined;

  // What the *next* roll will actually experience.
  //
  // Counters are eager (docs/IEE_CONSTRUCTOR_SPEC.md §7.9): the executor ends a
  // status the moment its last unit is spent, so an active row is in force and
  // `remaining` is exactly what is left — rolls it will still affect, counting
  // the next one, so it never reads zero while the status is on screen.
  // An instance is drawn from the revision it holds: an older one keeps its
  // own text, and one the season no longer attaches still shows (spec §8).
  const statuses = activeEffects.flatMap((e) => {
    const view = registry.instanceView(e.revisionId);
    return view ? [{ id: e.id, remaining: e.remaining, castByUsername: e.castByUsername, view }] : [];
  });

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

  const toGameSummary = (
    g: {
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
    } | null,
  ): GameSummary | null => {
    if (!g) return null;
    const stores = Array.isArray(g.stores)
      ? g.stores
          .filter(
            (s): s is { store?: unknown; url?: unknown } =>
              !!s && typeof s === "object" && !!s.store && !!s.url,
          )
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
      <SeasonLiveRefresh
        seasonId={season.id}
        matchPlayerId={seasonPlayer.id}
        labels={{ updated: t.feed.updated }}
      />
      {iee?.enabled ? <DecisionsLiveRefresh userId={user.id} seasonId={season.id} /> : null}
      {/* Operator ID card */}
      <div className="hud-card flex items-center gap-4 p-4">
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/30 to-transparent"
          aria-hidden
        />
        <AvatarBadge
          name={user.displayName ?? user.username}
          src={user.avatarUrl ?? null}
          seed={user.id}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            {"// OPERATOR"} <span className="text-amber">· {season.title}</span>
          </div>
          <div className="mt-0.5 truncate font-display text-xl uppercase tracking-wide leading-none">
            {user.displayName ?? user.username}
            {isBotUsername(user.username) ? (
              <BotBadge label={t.core.common.bot} className="ml-2 align-middle" />
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] leading-none text-dim">
            <span className="border border-dim/30 bg-background/40 px-1.5 py-0.5 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              @{user.username}
            </span>
            <span className="hidden h-3 w-px bg-dim/20 sm:inline-block" aria-hidden />
            <span className="hidden truncate sm:inline">{kicker}</span>
            <StatusBadge
              kind="player"
              status={seasonPlayer.status}
              label={t.core.playerStatuses[seasonPlayer.status]}
            />
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
        right={
          <span className="inline-flex flex-wrap items-center gap-2">
            <LiveBadge
              seasonId={season.id}
              labels={{
                online: t.feed.live,
                offline: t.feed.offline,
                syncing: t.feed.updating,
                watching: t.feed.watching,
              }}
            />
            <StatusBadge
              kind="season"
              status={season.status}
              label={t.core.seasonStatuses[season.status]}
            />
          </span>
        }
      />
      {/* Stats */}
      <LiveFlash seasonId={season.id} matchPlayerId={seasonPlayer.id}>
        <section aria-label={t.core.dashboard.statsTitle} className="animate-hud-rise">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label={t.core.dashboard.statPosition}
              value={`${seasonPlayer.position} / ${Math.max(0, totalCells - 1)}`}
              accent
              icon={MapPinIcon}
            />
            <StatTile
              label={t.core.dashboard.statBalance}
              value={String(seasonPlayer.balancePoints)}
              accent
              icon={BanknotesIcon}
            />
            <StatTile
              label={t.core.dashboard.statStreakPass}
              value={String(seasonPlayer.streakPass)}
              icon={CheckCircleIcon}
            />
            <StatTile
              label={t.core.dashboard.statStreakDrop}
              value={String(seasonPlayer.streakDrop)}
              icon={FireIcon}
            />
            <StatTile
              label={t.core.dashboard.statRerolls}
              value={String(seasonPlayer.rerollsUsed)}
              icon={ArrowPathIcon}
            />
            <StatTile
              label={t.core.dashboard.statProgress}
              value={`${progressPct}%`}
              accent
              icon={ChartBarIcon}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-3 flex-1 overflow-hidden border border-[#3d3d34] bg-[#151514] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <div
                className="h-full bg-amber shadow-[0_0_10px_rgba(242,169,0,0.5)] transition-all duration-500"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
              <div
                className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_22px,rgba(0,0,0,0.35)_22px_23px)] opacity-60"
                aria-hidden
              />
              <div className="absolute inset-y-0 left-1/4 w-px bg-black/40" aria-hidden />
              <div className="absolute inset-y-0 left-1/2 w-px bg-black/40" aria-hidden />
              <div className="absolute inset-y-0 left-3/4 w-px bg-black/40" aria-hidden />
            </div>
            <span className="ammo-counter shrink-0 font-mono text-xs tracking-widest text-amber">
              {progressPct}%
            </span>
          </div>
        </section>
      </LiveFlash>

      {/* Board progress mini */}
      {cells.length > 0 ? (
        <section
          aria-label={t.core.dashboard.boardProgressTitle}
          className="hud-card animate-hud-rise overflow-hidden bg-[#121210] p-3 sm:p-4"
          style={{ animationDelay: "60ms" }}
        >
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
              const object = objectAt.get(cell.position);
              return (
                <div
                  key={cell.id}
                  className={`group relative flex aspect-square flex-col items-center justify-center border p-1 text-center transition-all [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${theme.box} ${isHere ? "ring-2 ring-amber ring-offset-1 ring-offset-[#121210] z-10 scale-[1.04] shadow-[0_0_12px_rgba(242,169,0,0.35)]" : isPast ? "opacity-70" : ""}`}
                  title={
                    cell.label
                      ? `${t.core.cellTypes[cell.cellType]}: ${cell.label}`
                      : t.core.cellTypes[cell.cellType]
                  }
                >
                  {cell.cellType !== "normal" ? (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.08]">
                      <CellMiniIcon type={cell.cellType} className="size-6" />
                    </span>
                  ) : null}
                  <span
                    className={`absolute right-1 top-1 size-1 ${theme.dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`}
                    aria-hidden
                  />
                  {object ? (
                    <span
                      title={format(t.board.cell.objectOn, { name: object.name[locale] || object.name.ru, owner: object.owner ? (object.owner.displayName ?? object.owner.username) : "—" })}
                      data-object={object.cell}
                      className={`absolute left-0.5 top-0.5 z-10 inline-flex size-4 items-center justify-center border p-px [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${object.polarity === "negative" ? "border-danger/60 bg-danger/15 text-danger" : "border-amber/60 bg-amber/15 text-amber"}`}
                    >
                      <IeeIcon kind="item" glyph={object.glyph} entryKey={object.key} art={object.art} alt={object.name[locale] || object.name.ru} className="size-full" />
                    </span>
                  ) : null}
                  {isHere ? (
                    <span
                      className="absolute inset-[3px] flex items-center justify-center bg-amber/12 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
                      aria-hidden
                    >
                      <span
                        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(242,169,0,0.18),transparent_70%)]"
                        aria-hidden
                      />
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
                      <span className="ammo-counter mt-0.5 text-[9px] font-bold leading-none text-amber">
                        {String(cell.position).padStart(2, "0")}
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="ammo-counter relative text-xs leading-none">
                        {String(cell.position).padStart(2, "0")}
                      </span>
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
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim"
                >
                  <span
                    className={`inline-block size-2 ${CELL_THEME[k].dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`}
                    aria-hidden
                  />
                  {t.core.cellTypes[k]}
                </span>
              ))}
          </div>
        </section>
      ) : null}

      {/* Current game */}
      {iee?.enabled && challenges.length > 0 ? (
        <ChallengesPanel challenges={challenges} itemNames={itemNames} effectNames={effectNames} />
      ) : null}

      {/* The turn waits for the player's reaction to the dice (spec §7.4). */}
      {iee?.enabled ? <ReactionPanel windows={reactionCards} wheelEntries={views} /> : null}

      {/* A choice waits above the inventory: the player answers it before using items (spec §7.6). */}
      {iee?.enabled && decisionCards.length > 0 ? <DecisionPanel decisions={decisionCards} items={decisionItems} /> : null}

      {/* A choice of games: the player takes one, and it is their roll (spec §7.12). */}
      {iee?.enabled ? <GameChoicePanel choice={choiceCard} /> : null}

      {iee?.enabled && (heldItems.length > 0 || statuses.length > 0) ? (
        <InventoryPanel
          items={heldItems.flatMap((i) => {
            const view = registry.instanceView(i.revisionId);
            if (!view) return [];
            // An item that asks for a pick from the catalog offers what the server would accept (spec §6.12).
            const item = registry.item(i.revisionId);
            const entryOptions = item?.usage.entryChoice
              ? entryChoiceOptions(item.usage.entryChoice, registry, item).map((e) => registry.view(e))
              : undefined;
            // An item that asks for a pick for the next game offers what the season's pool does (spec §6.16).
            const pick = pickOf(item?.usage.pick);
            return [{ id: i.id, chargesLeft: i.chargesLeft, source: i.source, view, ...(entryOptions ? { entryOptions } : {}), ...(pick ? { pick } : {}) }];
          })}
          statuses={statuses}
          targets={targetOptions.map((o) => ({ ...o, untargetable: standing.get(o.seasonPlayerId)?.untargetable ?? false }))}
          allowTargeting={iee.allowTargetingOthers}
          selfPosition={seasonPlayer.position}
          forbidden={standing.get(seasonPlayer.id)?.forbidItems ?? false}
          deciding={decisionCards.length > 0 || reactionCards.length > 0 || choiceCard !== null}
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
        <section className="hud-card animate-hud-rise flex flex-col items-center gap-2 p-8 text-center">
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
              ? {
                  id: pendingCompletion.id,
                  outcome: pendingCompletion.outcome as "passed" | "dropped",
                  reason: pendingCompletion.reason,
                  rating: pendingCompletion.rating,
                  requestedAt: pendingCompletion.requestedAt.toISOString(),
                }
              : null
          }
          pendingReroll={
            pendingReroll
              ? {
                  id: pendingReroll.id,
                  reason: pendingReroll.reason,
                  requestedAt: pendingReroll.requestedAt.toISOString(),
                }
              : null
          }
          rerollsUsed={seasonPlayer.rerollsUsed}
          rerollApproved={!!approvedReroll}
          rerollNeedsApproval={
            seasonConfig.success ? seasonConfig.data.rerolls.requireApproval : true
          }
          lastDice={lastMoves[0]?.diceResults ?? null}
          reacting={reactionCards.length > 0}
          choosing={choiceCard !== null}
          conditions={openRoll ? conditionsOf(openRoll.id) : []}
          catalogGames={catalogPreview.map((g) => ({
            title: g.title,
            coverUrl: g.coverUrl,
            platform: g.platform,
          }))}
          wheelEntries={views}
        />
      )}

      {/* Game history */}
      <section
        aria-label={t.core.dashboard.history}
        className="grid animate-hud-rise gap-6 lg:grid-cols-2"
        style={{ animationDelay: "90ms" }}
      >
        <div className="hud-card flex flex-col p-0">
          <div className="flex items-center gap-2 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
            <ChartBarIcon className="size-4 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">
              {t.core.dashboard.history}
            </h2>
            <span className="ml-auto font-mono text-[10px] tracking-widest text-dim">
              {lastMoves.length} moves
            </span>
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
                      {format(t.core.dashboard.moveFormat, {
                        from: move.fromPosition,
                        to: move.toPosition,
                      })}
                    </span>
                    <span className="hidden items-center gap-1.5 sm:inline-flex">
                      {move.cellLandedType ? (
                        <>
                          <span
                            className={`inline-block size-2 ${CELL_THEME[move.cellLandedType].dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`}
                            aria-hidden
                          />
                          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
                            {t.core.cellTypes[move.cellLandedType]}
                          </span>
                          <CellMiniIcon
                            type={move.cellLandedType}
                            className="size-3.5 opacity-50"
                          />
                        </>
                      ) : (
                        <span className="font-mono text-xs text-dim">—</span>
                      )}
                    </span>
                    <time
                      dateTime={move.createdAt.toISOString()}
                      className="ml-auto hidden shrink-0 font-mono text-[11px] text-dim sm:block"
                    >
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
            <h2 className="font-display text-sm uppercase tracking-widest">
              {t.core.dashboard.games}
            </h2>
            <span className="ml-auto font-mono text-[10px] tracking-widest text-dim">
              {recentRolls.length} rolls
            </span>
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
                    conditions: conditionsOf(roll.id),
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
