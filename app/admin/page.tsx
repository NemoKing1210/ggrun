import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  MapIcon,
  PuzzlePieceIcon,
  QueueListIcon,
  ShieldCheckIcon,
  SignalIcon,
  SparklesIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import { db } from "@/lib/infrastructure/db";
import {
  adminAuditLog,
  eventLog,
  gameRolls,
  gamesCatalog,
  moves,
  seasonPlayers,
  seasons,
  users,
} from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getActiveSeason } from "@/lib/modules/season/repository/seasons";
import {
  listPendingCompletionRequests,
  listPendingRerollRequests,
} from "@/lib/modules/catalog/repository";
import { countPendingEventSubmissions } from "@/lib/modules/iee/repository";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { StatusBadge } from "@/components/ui/status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.console} — GGRun` };
}

const CUT_6 =
  "[clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]";
const CUT_4 =
  "[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]";

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`hud-card relative overflow-hidden p-4 ${CUT_6} ${className}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/25 to-transparent"
        aria-hidden
      />
      {children}
    </section>
  );
}

function PanelHeading({
  kicker,
  title,
  right,
}: {
  kicker: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-sm uppercase tracking-widest">{title}</h2>
      <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
        {"// "}
        {right ?? kicker}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  delta,
  deltaTone = "text-dim",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  delta?: string;
  deltaTone?: "text-dim" | "text-military" | "text-amber";
}) {
  return (
    <div className={`hud-card relative overflow-hidden p-4 ${CUT_6}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex size-8 items-center justify-center border border-[#3d3d34] bg-[#151514] text-dim ${CUT_4}`}
        >
          <Icon className="size-4" aria-hidden />
        </div>
        <span
          className={`size-1.5 shrink-0 ${accent ? "bg-amber" : "bg-[#55554a]"} [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]`}
          aria-hidden
        />
      </div>
      <div
        className={`ammo-counter mt-3 truncate text-3xl leading-none ${accent ? "text-amber" : "text-foreground"}`}
        title={String(value)}
      >
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-dim">
        {label}
      </div>
      {delta && (
        <div className={`mt-1.5 font-mono text-[10px] uppercase tracking-widest ${deltaTone}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

export default async function AdminDashboardPage() {
  // Layout and page render in parallel, so the layout guard alone does not stop
  // these queries running for an anonymous visitor — their result was reaching
  // the RSC payload of the redirect response (the active season's title).
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (!isStaff(actor)) redirect("/");

  const { t, locale } = await getT();
  const d = t.admin.dashboard;
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const [
    usersCount,
    seasonsCount,
    gamesCount,
    rollsCount,
    movesCount,
    eventsCount,
    newUsers,
    openRolls,
    blacklisted,
    movesDay,
    seasonsRows,
    stalledRows,
    playerCounts,
    rollCounts,
    moveCounts,
    pendingRerolls,
    pendingCompletions,
    pendingEvents,
    activeSeason,
    recentEvents,
    recentAudit,
  ] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(seasons),
    db.select({ n: count() }).from(gamesCatalog),
    db.select({ n: count() }).from(gameRolls),
    db.select({ n: count() }).from(moves),
    db.select({ n: count() }).from(eventLog),
    db
      .select({ n: count() })
      .from(users)
      .where(sql`${users.createdAt} > now() - interval '7 days'`),
    db
      .select({ n: count() })
      .from(gameRolls)
      .where(inArray(gameRolls.status, ["rolled", "in_progress"])),
    db
      .select({ n: count() })
      .from(gamesCatalog)
      .where(eq(gamesCatalog.isBlacklisted, true)),
    db
      .select({ n: count() })
      .from(moves)
      .where(sql`${moves.createdAt} > now() - interval '24 hours'`),
    db
      .select({
        id: seasons.id,
        slug: seasons.slug,
        title: seasons.title,
        status: seasons.status,
        createdAt: seasons.createdAt,
      })
      .from(seasons)
      .orderBy(desc(seasons.createdAt))
      .limit(10),
    db
      .select({ id: seasons.id, title: seasons.title, status: seasons.status })
      .from(seasons)
      .where(inArray(seasons.status, ["draft", "paused"]))
      .orderBy(desc(seasons.createdAt)),
    db
      .select({ seasonId: seasonPlayers.seasonId, n: count() })
      .from(seasonPlayers)
      .groupBy(seasonPlayers.seasonId),
    db
      .select({ seasonId: seasonPlayers.seasonId, n: count() })
      .from(gameRolls)
      .innerJoin(seasonPlayers, eq(gameRolls.seasonPlayerId, seasonPlayers.id))
      .groupBy(seasonPlayers.seasonId),
    db
      .select({ seasonId: seasonPlayers.seasonId, n: count() })
      .from(moves)
      .innerJoin(seasonPlayers, eq(moves.seasonPlayerId, seasonPlayers.id))
      .groupBy(seasonPlayers.seasonId),
    listPendingRerollRequests(),
    listPendingCompletionRequests(),
    countPendingEventSubmissions(),
    getActiveSeason(),
    db
      .select({
        eventType: eventLog.eventType,
        createdAt: eventLog.createdAt,
        seasonSlug: seasons.slug,
      })
      .from(eventLog)
      .innerJoin(seasons, eq(eventLog.seasonId, seasons.id))
      .orderBy(desc(eventLog.createdAt))
      .limit(8),
    db
      .select({
        actionType: adminAuditLog.actionType,
        createdAt: adminAuditLog.createdAt,
        username: users.username,
      })
      .from(adminAuditLog)
      .innerJoin(users, eq(adminAuditLog.actorId, users.id))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(8),
  ]);

  const playersBySeason = new Map(playerCounts.map((r) => [r.seasonId, r.n]));
  const rollsBySeason = new Map(rollCounts.map((r) => [r.seasonId, r.n]));
  const movesBySeason = new Map(moveCounts.map((r) => [r.seasonId, r.n]));

  const newUsersN = newUsers[0]?.n ?? 0;
  const openRollsN = openRolls[0]?.n ?? 0;
  const attentionTotal =
    pendingRerolls.length + pendingCompletions.length + pendingEvents + stalledRows.length;

  const attention: Array<{
    label: string;
    value: number;
    href: string;
    urgent: boolean;
  }> = [
    ...(pendingRerolls.length > 0
      ? [{ label: d.pendingRerolls, value: pendingRerolls.length, href: "/admin/moderation", urgent: true }]
      : []),
    ...(pendingCompletions.length > 0
      ? [{ label: d.pendingCompletions, value: pendingCompletions.length, href: "/admin/moderation", urgent: true }]
      : []),
    ...(pendingEvents > 0
      ? [{ label: d.pendingEvents, value: pendingEvents, href: "/admin/moderation", urgent: true }]
      : []),
    ...(openRollsN > 0
      ? [{ label: d.openRollsLabel, value: openRollsN, href: "/admin/moderation", urgent: false }]
      : []),
    ...(stalledRows.length > 0
      ? [{ label: d.stalledSeasons, value: stalledRows.length, href: "/admin/seasons", urgent: false }]
      : []),
  ];

  const activePlayers = activeSeason ? (playersBySeason.get(activeSeason.id) ?? 0) : 0;
  const activeRolls = activeSeason ? (rollsBySeason.get(activeSeason.id) ?? 0) : 0;
  const activeMoves = activeSeason ? (movesBySeason.get(activeSeason.id) ?? 0) : 0;

  const stats = [
    {
      label: d.statUsers,
      value: usersCount[0]?.n ?? 0,
      icon: UsersIcon,
      accent: true,
      delta: newUsersN > 0 ? format(d.newUsersSuffix, { n: newUsersN }) : undefined,
      deltaTone: "text-military" as const,
    },
    { label: d.statSeasons, value: seasonsCount[0]?.n ?? 0, icon: CalendarDaysIcon },
    {
      label: d.statGames,
      value: gamesCount[0]?.n ?? 0,
      icon: PuzzlePieceIcon,
      delta:
        (blacklisted[0]?.n ?? 0) > 0 ? `−${blacklisted[0]?.n}` : undefined,
    },
    {
      label: d.statRolls,
      value: rollsCount[0]?.n ?? 0,
      icon: QueueListIcon,
      accent: true,
      delta: openRollsN > 0 ? format(d.openRollsSuffix, { n: openRollsN }) : undefined,
      deltaTone: "text-amber" as const,
    },
    {
      label: d.statMoves,
      value: movesCount[0]?.n ?? 0,
      icon: MapIcon,
      delta: `+${movesDay[0]?.n ?? 0} / 24h`,
    },
    { label: d.statEvents, value: eventsCount[0]?.n ?? 0, icon: SignalIcon },
  ];

  const ops = [
    { href: "/admin/seasons", label: t.admin.nav.seasons, desc: d.opSeasonsDesc, icon: FlagIcon },
    ...(actor.role === "admin"
      ? [{ href: "/admin/users", label: t.admin.nav.users, desc: d.opUsersDesc, icon: UsersIcon }]
      : []),
    { href: "/admin/games", label: t.admin.nav.catalog, desc: d.opCatalogDesc, icon: PuzzlePieceIcon },
    { href: "/admin/catalog", label: t.iee.admin.navLabel, desc: d.opIeeDesc, icon: SparklesIcon },
    { href: "/admin/moderation", label: t.admin.nav.moderation, desc: d.opModerationDesc, icon: ShieldCheckIcon },
    { href: "/admin/audit", label: t.admin.nav.audit, desc: d.opAuditDesc, icon: ClipboardDocumentListIcon },
    ...(actor.role === "admin"
      ? [{ href: "/admin/settings", label: t.admin.nav.settings, desc: d.opSettingsDesc, icon: Cog6ToothIcon }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">
              {"// "}
              {t.admin.nav.console}
            </p>
            <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
              {d.heading}
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
            <span
              className={`inline-flex items-center gap-1.5 border px-2 py-1 ${CUT_4} border-[#3d3d34] bg-[#151514]`}
            >
              <span className="size-1.5 bg-military" aria-hidden />
              {d.operatorLabel}: {actor.displayName ?? actor.username} · {actor.role}
            </span>
          </div>
        </div>
        <div className="hazard-tape my-4" aria-hidden />
      </section>

      {/* attention queue */}
      <Panel>
        <PanelHeading
          kicker="triage"
          title={d.attentionHeading}
          right={attentionTotal > 0 ? `${attentionTotal}` : undefined}
        />
        {attention.length === 0 ? (
          <p className="inline-flex items-center gap-2 border border-military/40 bg-military/10 px-2.5 py-1.5 font-mono text-xs tracking-wide text-military">
            <CheckCircleIcon className="size-4" aria-hidden />
            {d.allClear}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {attention.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={`group flex items-center justify-between gap-2 border px-3 py-2.5 transition hover:brightness-125 ${CUT_4} ${
                  a.urgent
                    ? "border-danger/50 bg-danger/10"
                    : "border-amber/40 bg-amber/5"
                }`}
              >
                <span className="flex items-center gap-2 font-display text-xs uppercase tracking-widest">
                  <ExclamationTriangleIcon
                    className={`size-4 ${a.urgent ? "text-danger" : "text-amber"}`}
                    aria-hidden
                  />
                  {a.label}
                </span>
                <span
                  className={`ammo-counter text-xl leading-none ${a.urgent ? "text-danger" : "text-amber"}`}
                >
                  {a.value}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/* stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      {/* active season hero */}
      <Panel className={activeSeason ? "border-amber/30" : undefined}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-dim">
            <FlagIcon className="size-4 text-amber" aria-hidden />
            {d.activeSeason}
          </span>
          {activeSeason && (
            <StatusBadge
              kind="season"
              status={activeSeason.status}
              label={t.core.seasonStatuses[activeSeason.status]}
            />
          )}
          {activeSeason && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
              {activeSeason.slug}
            </span>
          )}
        </div>
        {activeSeason ? (
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Link
              href={`/admin/seasons/${activeSeason.id}`}
              className="group inline-flex items-center gap-2 font-display text-2xl uppercase leading-none tracking-wide text-amber hover:underline"
            >
              {activeSeason.title}
              <ArrowRightIcon
                className="size-5 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              />
            </Link>
            <div className="flex flex-wrap items-center gap-5">
              {[
                { label: d.activePlayers, value: activePlayers },
                { label: d.activeRolls, value: activeRolls },
                { label: d.activeMoves, value: activeMoves },
              ].map((m) => (
                <div key={m.label} className="flex items-baseline gap-2">
                  <span className="ammo-counter text-2xl leading-none text-foreground">
                    {m.value}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
                    {m.label}
                  </span>
                </div>
              ))}
              <span className="hidden h-8 w-px bg-[#3d3d34] sm:block" aria-hidden />
              <div className="flex flex-wrap gap-2">
                {[
                  { href: `/admin/seasons/${activeSeason.id}`, label: d.manageSettings },
                  { href: `/admin/seasons/${activeSeason.id}/board`, label: d.manageBoard },
                  { href: `/admin/seasons/${activeSeason.id}/players`, label: d.managePlayers },
                ].map((l) => (
                  <Link key={l.href + l.label} href={l.href} className="hud-btn px-3 py-2 text-xs">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="font-mono text-sm text-dim">{d.noActiveSeason}</p>
            <span className="font-mono text-xs text-dim">{d.noActiveSeasonHint}</span>
            <Link href="/admin/seasons" className="hud-btn hud-btn-primary px-3 py-2 text-xs">
              {t.admin.nav.seasons}
            </Link>
          </div>
        )}
      </Panel>

      {/* seasons + activity */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeading
            kicker="runs"
            title={d.seasonsHeading}
            right={
              <Link href="/admin/seasons" className="text-amber hover:underline">
                {d.viewAllSeasons}
              </Link>
            }
          />
          {seasonsRows.length === 0 ? (
            <p className="font-mono text-sm text-dim">{d.emptySeasons}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#2a2a22]">
              {seasonsRows.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
                >
                  <Link
                    href={`/admin/seasons/${s.id}`}
                    className="min-w-0 flex-1 basis-48 font-display text-base tracking-wide text-foreground hover:text-amber hover:underline"
                  >
                    <span className="block truncate">{s.title}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-widest text-dim">
                      {s.slug}
                    </span>
                  </Link>
                  <StatusBadge
                    kind="season"
                    status={s.status}
                    label={t.core.seasonStatuses[s.status]}
                  />
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-dim">
                    <UsersIcon className="size-3.5" aria-hidden />
                    {playersBySeason.get(s.id) ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-dim">
                    <QueueListIcon className="size-3.5" aria-hidden />
                    {rollsBySeason.get(s.id) ?? 0}
                  </span>
                  <span className="flex gap-1.5">
                    <Link
                      href={`/admin/seasons/${s.id}/board`}
                      className="border border-[#3d3d34] bg-[#151514] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-dim transition hover:border-amber/50 hover:text-amber"
                    >
                      {d.manageBoard}
                    </Link>
                    <Link
                      href={`/admin/seasons/${s.id}/players`}
                      className="border border-[#3d3d34] bg-[#151514] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-dim transition hover:border-amber/50 hover:text-amber"
                    >
                      {d.managePlayers}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeading kicker="tail" title={d.activityHeading} />
          <p className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-dim">
            {d.recentEvents}
            <Link href="/feed" className="text-amber hover:underline">
              {d.viewFeed}
            </Link>
          </p>
          {recentEvents.length === 0 ? (
            <p className="font-mono text-xs text-dim">{d.emptyActivity}</p>
          ) : (
            <ul className="mb-4 flex flex-col divide-y divide-[#2a2a22] border-y border-[#2a2a22]">
              {recentEvents.map((e, i) => (
                <li
                  key={`${e.createdAt?.toISOString() ?? i}-${e.eventType}-${i}`}
                  className="flex items-center justify-between gap-2 py-1.5 font-mono text-xs"
                >
                  <span className="truncate text-foreground">
                    {e.eventType}
                    <span className="text-dim"> · {e.seasonSlug}</span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-widest text-dim">
                    {e.createdAt ? dateFmt.format(new Date(e.createdAt)) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-dim">
            {d.recentStaff}
            <Link href="/admin/audit" className="text-amber hover:underline">
              {d.viewAudit}
            </Link>
          </p>
          {recentAudit.length === 0 ? (
            <p className="font-mono text-xs text-dim">{d.emptyActivity}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#2a2a22] border-y border-[#2a2a22]">
              {recentAudit.map((a, i) => (
                <li
                  key={`${a.createdAt?.toISOString() ?? i}-${a.actionType}-${i}`}
                  className="flex items-center justify-between gap-2 py-1.5 font-mono text-xs"
                >
                  <span className="truncate text-foreground">
                    {a.actionType}
                    <span className="text-dim"> · {a.username}</span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-widest text-dim">
                    {a.createdAt ? dateFmt.format(new Date(a.createdAt)) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* operations map */}
      <Panel>
        <PanelHeading kicker={d.opsHint} title={d.opsHeading} />
        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ops.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hud-lift group flex items-center gap-3 border border-[#3d3d34] bg-[#151514] px-3 py-3 transition hover:border-amber/60"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center border border-[#3d3d34] bg-[#1a1a1a] text-amber ${CUT_4}`}
              >
                <l.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm uppercase tracking-widest group-hover:text-amber">
                  {l.label}
                </span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-dim">
                  {l.desc}
                </span>
              </span>
              <ArrowRightIcon
                className="ml-auto size-4 shrink-0 text-dim opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
      </Panel>

      {/* stalled seasons detail */}
      {stalledRows.length > 0 && (
        <Panel>
          <PanelHeading kicker="runs" title={d.stalledSeasons} />
          <ul className="flex flex-wrap gap-2">
            {stalledRows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/seasons/${s.id}`}
                  className={`inline-flex items-center gap-2 border px-2.5 py-1.5 font-mono text-xs transition hover:brightness-125 ${CUT_4} border-amber/40 bg-amber/5 text-amber`}
                >
                  <CalendarDaysIcon className="size-3.5" aria-hidden />
                  {s.title}
                  <span className="text-[10px] uppercase tracking-widest opacity-70">
                    {t.core.seasonStatuses[s.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
