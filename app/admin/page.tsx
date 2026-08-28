import type { Metadata } from "next";
import Link from "next/link";
import { count, sql } from "drizzle-orm";
import {
  UsersIcon,
  CalendarDaysIcon,
  PuzzlePieceIcon,
  QueueListIcon,
  MapIcon,
  SignalIcon,
  FlagIcon,
  ClipboardDocumentListIcon,
  CircleStackIcon,
  ArrowRightIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

import { db } from "@/lib/infrastructure/db";
import {
  eventLog,
  gameRolls,
  gamesCatalog,
  moves,
  seasons,
  users,
} from "@/db/schema";
import { getActiveSeason } from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { StatusBadge } from "@/components/ui/status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.console} — GGRun` };
}

type StatDef = {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
};

function StatCard({ label, value, icon: Icon, accent }: StatDef) {
  return (
    <div className="hud-card relative overflow-hidden p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-8 items-center justify-center border border-[#3d3d34] bg-[#151514] text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <Icon className="size-4" aria-hidden />
        </div>
        <span className="size-1.5 shrink-0 bg-amber/60 [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" aria-hidden />
      </div>
      <div className={`ammo-counter mt-3 truncate text-3xl leading-none ${accent ? "text-amber" : "text-foreground"}`} title={String(value)}>
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] leading-none text-dim">{label}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const { t } = await getT();

  const [usersCount, seasonsCount, gamesCount, rollsCount, movesCount, eventsCount] =
    await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(seasons),
      db.select({ n: count() }).from(gamesCatalog),
      db.select({ n: count() }).from(gameRolls),
      db.select({ n: count() }).from(moves),
      db.select({ n: count() }).from(eventLog),
    ]);

  const activeSeason = await getActiveSeason();
  const [newUsers] = await db
    .select({ n: count() })
    .from(users)
    .where(sql`${users.createdAt} > now() - interval '7 days'`);

  const stats: StatDef[] = [
    { label: t.admin.dashboard.statUsers, value: usersCount[0]?.n ?? 0, icon: UsersIcon, accent: true },
    { label: t.admin.dashboard.statSeasons, value: seasonsCount[0]?.n ?? 0, icon: CalendarDaysIcon },
    { label: t.admin.dashboard.statGames, value: gamesCount[0]?.n ?? 0, icon: PuzzlePieceIcon },
    { label: t.admin.dashboard.statRolls, value: rollsCount[0]?.n ?? 0, icon: QueueListIcon, accent: true },
    { label: t.admin.dashboard.statMoves, value: movesCount[0]?.n ?? 0, icon: MapIcon },
    { label: t.admin.dashboard.statEvents, value: eventsCount[0]?.n ?? 0, icon: SignalIcon },
  ];

  const quickLinks = [
    { href: "/admin/seasons", label: t.admin.nav.seasons, icon: FlagIcon },
    { href: "/admin/users", label: t.admin.nav.users, icon: UsersIcon },
    { href: "/admin/games", label: t.admin.nav.catalog, icon: PuzzlePieceIcon },
    { href: "/admin/audit", label: t.admin.nav.audit, icon: ClipboardDocumentListIcon },
    { href: "/admin/moderation", label: t.admin.nav.moderation, icon: QueueListIcon },
    { href: "/admin/settings", label: t.admin.nav.settings, icon: Cog6ToothIcon },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">{"// "}{t.admin.nav.console}</p>
            <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
              {t.admin.dashboard.heading}
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
            <CircleStackIcon className="size-3.5" aria-hidden />
            <span>HUD · ADMIN</span>
            <span className="hidden h-3 w-px bg-[#3d3d34] sm:block" aria-hidden />
            <span className="hidden sm:inline">tactical console</span>
          </div>
        </div>
        <div className="hazard-tape my-4" aria-hidden />
      </section>

      {/* active season */}
      <section className="hud-card overflow-hidden p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/25 to-transparent" aria-hidden />
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-dim">
            <FlagIcon className="size-4 text-amber" aria-hidden />
            {t.admin.dashboard.activeSeason}
          </span>
          <span className="h-3 w-px bg-[#3d3d34]" aria-hidden />
          {activeSeason ? (
            <>
              <Link href={`/admin/seasons/${activeSeason.id}`} className="group inline-flex items-center gap-2 font-display text-lg leading-none tracking-wide text-amber hover:underline">
                {activeSeason.title}
                <ArrowRightIcon className="size-4 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
              </Link>
              <StatusBadge status={activeSeason.status} label={t.core.seasonStatuses[activeSeason.status]} />
            </>
          ) : (
            <span className="font-mono text-sm text-dim">{t.admin.dashboard.noActiveSeason}</span>
          )}
          {newUsers && newUsers.n > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 border border-military/40 bg-military/10 px-2 py-1 font-mono text-xs tracking-wide text-military [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <span className="size-1.5 bg-military [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
              +{newUsers.n} / 7d
            </span>
          )}
        </div>
      </section>

      {/* stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      {/* quick links */}
      <section className="hud-card p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm uppercase tracking-widest"> {t.admin.dashboard.quickLinksHeading} </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{"// "}shortcuts</span>
        </div>
        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {quickLinks.map((l) => (
            <Link key={l.href} href={l.href} className="hud-btn inline-flex items-center justify-center gap-2 py-2.5 text-xs">
              <l.icon className="size-4 opacity-70" aria-hidden />
              {l.label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
