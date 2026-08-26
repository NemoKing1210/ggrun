import Link from "next/link";
import { count, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  eventLog,
  gameRolls,
  gamesCatalog,
  moves,
  seasons,
  users,
} from "@/db/schema";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="hud-card px-5 py-4">
      <div className="ammo-counter text-4xl text-amber">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-widest text-dim">{label}</div>
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

  const stats = [
    { label: t.admin.dashboard.statUsers, value: usersCount[0]?.n ?? 0 },
    { label: t.admin.dashboard.statSeasons, value: seasonsCount[0]?.n ?? 0 },
    { label: t.admin.dashboard.statGames, value: gamesCount[0]?.n ?? 0 },
    { label: t.admin.dashboard.statRolls, value: rollsCount[0]?.n ?? 0 },
    { label: t.admin.dashboard.statMoves, value: movesCount[0]?.n ?? 0 },
    { label: t.admin.dashboard.statEvents, value: eventsCount[0]?.n ?? 0 },
  ];

  const quickLinks = [
    { href: "/admin/seasons", label: t.admin.nav.seasons },
    { href: "/admin/users", label: t.admin.nav.users },
    { href: "/admin/games-catalog", label: t.admin.nav.catalog },
    { href: "/admin/audit", label: t.admin.nav.audit },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
          {t.admin.dashboard.heading}
        </h1>
        <div className="hazard-tape my-4" aria-hidden />
      </section>

      <section className="hud-card flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <span className="font-mono text-xs uppercase tracking-widest text-dim">
          {t.admin.dashboard.activeSeason}:
        </span>
        {activeSeason ? (
          <Link
            href={`/admin/seasons/${activeSeason.id}`}
            className="font-display text-lg text-amber hover:underline"
          >
            {activeSeason.title}
          </Link>
        ) : (
          <span className="text-dim">{t.admin.dashboard.noActiveSeason}</span>
        )}
        {newUsers && newUsers.n > 0 && (
          <span className="ml-auto font-mono text-xs text-military">
            +{newUsers.n} / 7d
          </span>
        )}
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </section>

      <section className="hud-card p-4">
        <h2 className="font-display mb-3 text-xl uppercase tracking-wider">
          {t.admin.dashboard.quickLinksHeading}
        </h2>
        <nav className="flex flex-wrap gap-3">
          {quickLinks.map((l) => (
            <Link key={l.href} href={l.href} className="hud-btn text-sm">
              {l.label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
