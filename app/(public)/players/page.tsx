import type { Metadata } from "next";
import Link from "next/link";
import { MagnifyingGlassIcon, UsersIcon } from "@heroicons/react/24/outline";

import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Badge } from "@/components/ui/Badge";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/infrastructure/db";
import { users } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { asc, ilike, or } from "drizzle-orm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.profile.listing.metaTitle };
}

type SearchParams = Promise<{
  q?: string;
  role?: string;
}>;

const ROLE_OPTIONS = ["admin", "judge", "player", "viewer"] as const;

function RoleBadge({ role, t }: { role: string; t: Awaited<ReturnType<typeof getT>>["t"] }) {
  const variant =
    role === "admin" ? "danger" : role === "judge" ? "violet" : role === "player" ? "military" : "dim";
  const label = (t.admin.users.roles as Record<string, string>)[role] ?? role;
  return (
    <Badge variant={variant as never} size="sm">
      {label}
    </Badge>
  );
}

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const { t, locale } = await getT();
  const { q, role } = await searchParams;
  const query = q?.trim() ?? "";
  const roleFilter = ROLE_OPTIONS.includes(role as never) ? (role as string) : "";

  // Build where clause
  let rows;
  if (query) {
    const pattern = `%${query}%`;
    const conditions = [ilike(users.username, pattern), ilike(users.displayName, pattern)];
    // include email only as fallback – public page hides it but search can still match
    conditions.push(ilike(users.email, pattern));
    if (roleFilter) {
      const { eq, and } = await import("drizzle-orm");
      rows = await db
        .select()
        .from(users)
        .where(and(or(...conditions), eq(users.role, roleFilter as never)))
        .orderBy(asc(users.username));
    } else {
      rows = await db.select().from(users).where(or(...conditions)).orderBy(asc(users.username));
    }
  } else if (roleFilter) {
    const { eq } = await import("drizzle-orm");
    rows = await db
      .select()
      .from(users)
      .where(eq(users.role, roleFilter as never))
      .orderBy(asc(users.username));
  } else {
    rows = await db.select().from(users).orderBy(asc(users.username));
  }

  // Hide blocked users from public roster – they still exist but shouldn't clutter the list
  const visible = rows.filter((u) => !u.isBlocked);

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "uk" ? "uk-UA" : "ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <PageContainer>
      <PageHeader
        kicker={t.profile.listing.kicker}
        title={t.profile.listing.title}
        right={
          <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest">
            <UsersIcon className="h-4 w-4 text-amber" aria-hidden />
            <span className="ammo-counter text-amber">{format(t.profile.listing.count, { count: visible.length })}</span>
          </span>
        }
      />
      <p className="mb-6 max-w-2xl font-mono text-xs uppercase tracking-widest text-dim">
        {t.profile.listing.description}
      </p>

      <div className="hazard-tape mb-6" aria-hidden />

      {/* Toolbar */}
      <form method="GET" className="hud-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1.5 block font-display text-[11px] uppercase tracking-widest text-zinc-400">
            {t.admin.users.searchPlaceholder}
          </span>
          <span className="relative block">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" aria-hidden />
            <input
              name="q"
              defaultValue={query}
              placeholder={t.profile.listing.searchPlaceholder}
              className="!pl-9"
              autoComplete="off"
            />
          </span>
        </label>

        <label className="w-full sm:w-48">
          <span className="mb-1.5 block font-display text-[11px] uppercase tracking-widest text-zinc-400">
            {t.core.common.status} / {t.admin.users.roleLabel}
          </span>
          <select name="role" defaultValue={roleFilter} className="w-full">
            <option value="">{t.profile.listing.roleAll}</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {(t.admin.users.roles as Record<string, string>)[r] ?? r}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 sm:pb-0">
          <button type="submit" className="hud-btn hud-btn-primary flex-1 sm:flex-none">
            {t.core.common.apply ?? "Apply"}
          </button>
          {(query || roleFilter) && (
            <Link href="/players" className="hud-btn flex-1 text-center sm:flex-none">
              {t.core.common.cancel}
            </Link>
          )}
        </div>
      </form>

      {visible.length === 0 ? (
        <EmptyState>
          <span className="block">{t.profile.listing.empty}</span>
          <span className="mt-1 block font-mono text-xs normal-case tracking-normal text-dim">
            {t.profile.listing.emptyHint}
          </span>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((u) => (
            <li key={u.id}>
              <Link
                href={`/players/${u.username}`}
                className="hud-card hud-lift group flex h-full flex-col p-5"
              >
                {/* accent stripe */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/40 to-transparent opacity-60" aria-hidden />

                <div className="flex items-start gap-3">
                  <AvatarBadge
                    name={u.displayName ?? u.username}
                    src={u.avatarUrl}
                    size="lg"
                    square
                    className="shrink-0 !size-14 border border-dim/30"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg uppercase leading-none tracking-wide group-hover:text-amber">
                      {u.displayName ?? u.username}
                    </p>
                    <p className="truncate font-mono text-xs text-dim">@{u.username}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <RoleBadge role={u.role} t={t} />
                    </div>
                  </div>
                </div>

                {u.bio ? (
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-zinc-300">{u.bio}</p>
                ) : (
                  <p className="mt-3 font-mono text-xs italic text-dim/60">—</p>
                )}

                {Array.isArray(u.links) && (u.links as unknown[]).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(u.links as Array<{ network: string; url: string }>).slice(0, 4).map((l, i) => (
                      <span
                        key={i}
                        className="border border-dim/20 bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim"
                      >
                        {l.network}
                      </span>
                    ))}
                    {(u.links as unknown[]).length > 4 ? (
                      <span className="px-1 py-0.5 font-mono text-[10px] text-dim">
                        +{(u.links as unknown[]).length - 4}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-dim/15 pt-3">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
                    {format(t.profile.listing.joined, { date: dateFmt.format(u.createdAt) })}
                  </span>
                  <span className="border border-amber/40 px-2 py-1 font-display text-[11px] uppercase tracking-widest text-amber group-hover:bg-amber group-hover:text-black">
                    {t.profile.listing.viewProfile} →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
