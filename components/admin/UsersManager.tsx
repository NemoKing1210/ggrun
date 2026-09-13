"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  SignalIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { BotBadge } from "@/components/ui/BotBadge";
import { isBotUsername } from "@/lib/shared/utils/bots";
import { isOnline } from "@/lib/shared/presence";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { AddUserModal } from "@/components/admin/AddUserModal";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type {
  AdminUserRow,
  AdminUserSeasonRow,
} from "@/lib/modules/player/service/admin";
import { AvatarWithPresence } from "@/components/ui/Presence";
import { AvatarFallback } from "@/components/ui/AvatarFallback";

type Actor = { id: string; username: string };
type RoleFilter = "all" | AdminUserRow["role"];

const ROLE_ORDER: Array<AdminUserRow["role"]> = [
  "admin",
  "judge",
  "player",
  "viewer",
];

const SEASON_DOT: Record<AdminUserSeasonRow["seasonStatus"], string> = {
  active: "bg-amber",
  paused: "bg-sky",
  finished: "bg-military",
  draft: "bg-dim",
  archived: "bg-dim",
};

function roleVariant(
  role: AdminUserRow["role"],
): "amber" | "military" | "dim" | "sky" | "neutral" {
  switch (role) {
    case "admin":
      return "amber";
    case "judge":
      return "military";
    case "player":
      return "sky";
    default:
      return "neutral";
  }
}

function fmtDate(value: Date | string | null, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Stat({
  value,
  label,
  icon,
  valueClassName,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border border-[#2a2a22] bg-background px-2.5 py-2">
      <span className="text-dim" aria-hidden>
        {icon}
      </span>
      <span>
        <span
          className={`block font-display text-lg leading-none ${valueClassName ?? "text-zinc-100"}`}
        >
          {value}
        </span>
        <span className="mt-1 block font-mono text-[10px] uppercase tracking-widest text-dim">
          {label}
        </span>
      </span>
    </div>
  );
}

function UserCard({
  usr,
  seasons,
  isSelf,
}: {
  usr: AdminUserRow;
  seasons: AdminUserSeasonRow[];
  isSelf: boolean;
}) {
  const { t, locale } = useI18n();
  const u = t.admin.users;
  const name = usr.displayName ?? usr.username;
  const shown = seasons.slice(0, 3);
  return (
    <Link
      href={`/admin/users/${usr.id}`}
      className="group flex w-full flex-col gap-3 border border-[#3d3d34] bg-[#1a1a1a] p-3 text-left transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] hover:border-amber/40 hover:bg-amber/5"
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        {/* No `href`: the whole card is already a Link to the same page,
            and an <a> inside an <a> is invalid HTML — React reports it
            as a hydration error. */}
        <AvatarWithPresence lastSeenAt={usr.lastSeenAt} size="md">
          {usr.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={usr.avatarUrl} alt={name} className="size-10 object-cover" />
          ) : (
            <AvatarFallback
              seed={usr.id}
              name={name}
              className="size-10"
              emojiClassName="text-xl"
            />
          )}
        </AvatarWithPresence>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-sm uppercase tracking-wide text-zinc-100 transition-colors group-hover:text-amber">
              {name}
            </span>
            {isSelf && (
              <Badge variant="military" size="sm">
                {u.you}
              </Badge>
            )}
            {isBotUsername(usr.username) ? (
              <BotBadge label={t.core.common.bot} />
            ) : null}
            <Badge variant={roleVariant(usr.role)} size="sm">
              {u.roles[usr.role]}
            </Badge>
          </span>
          <span className="block truncate font-mono text-xs text-dim">
            @{usr.username} · {usr.email ?? "—"}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-dim">
            <span className="inline-flex items-center gap-1">
              <CalendarDaysIcon className="size-3" aria-hidden />
              {format(u.memberSince, {
                date: fmtDate(usr.createdAt, locale) ?? "",
              })}
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3" aria-hidden />
              {usr.lastSeenAt
                ? format(u.lastSeen, {
                    date: fmtDate(usr.lastSeenAt, locale) ?? "",
                  })
                : u.neverSeen}
            </span>
          </span>
          {seasons.length > 0 ? (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {shown.map((s) => (
                <span
                  key={s.seasonId}
                  className="inline-flex items-center gap-1.5 border border-[#2a2a22] bg-background px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                >
                  <span
                    className={`inline-block size-1.5 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)] ${SEASON_DOT[s.seasonStatus]}`}
                    aria-hidden
                  />
                  {s.seasonTitle} · {t.leaderboard.cellLabel} {s.position} ·{" "}
                  {s.balancePoints} {t.leaderboard.abbrev.points}
                </span>
              ))}
              {seasons.length > shown.length ? (
                <span className="inline-flex items-center border border-dim/30 bg-raised px-1.5 py-0.5 font-mono text-[10px] text-dim">
                  {format(u.moreSeasons, { n: seasons.length - shown.length })}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-widest text-dim/70">
              {u.noSeasons}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest ${usr.isBlocked ? "text-danger" : "text-military"}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)] ${usr.isBlocked ? "bg-danger" : "bg-military"}`}
              aria-hidden
            />
            {usr.isBlocked ? (
              <span className="inline-flex items-center gap-1">
                <NoSymbolIcon className="h-3 w-3" aria-hidden />
                {u.blocked}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <ShieldCheckIcon className="h-3 w-3" aria-hidden />
                {u.activeUser}
              </span>
            )}
          </span>
          <ChevronRightIcon
            className="h-4 w-4 shrink-0 text-dim transition-colors group-hover:text-amber"
            aria-hidden
          />
        </span>
      </span>
    </Link>
  );
}

/** Admin users list: stats, search + role/blocked filters, rich cards linking to /admin/users/[id]. */
export default function UsersManager({
  initialUsers,
  seasonsByUser,
  actor,
}: {
  initialUsers: AdminUserRow[];
  seasonsByUser: Record<string, AdminUserSeasonRow[]>;
  actor: Actor;
}) {
  const { t } = useI18n();
  const u = t.admin.users;
  const [filter, setFilter] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [blockedOnly, setBlockedOnly] = useState(false);

  const summary = useMemo(
    () => ({
      total: initialUsers.length,
      online: initialUsers.filter((usr) => isOnline(usr.lastSeenAt)).length,
      blocked: initialUsers.filter((usr) => usr.isBlocked).length,
      staff: initialUsers.filter(
        (usr) => usr.role === "admin" || usr.role === "judge",
      ).length,
    }),
    [initialUsers],
  );

  const roleCounts = useMemo(() => {
    const counts: Record<AdminUserRow["role"], number> = {
      admin: 0,
      judge: 0,
      player: 0,
      viewer: 0,
    };
    for (const usr of initialUsers) counts[usr.role] += 1;
    return counts;
  }, [initialUsers]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return initialUsers.filter(
      (usr) =>
        (role === "all" || usr.role === role) &&
        (!blockedOnly || usr.isBlocked) &&
        (!q ||
          usr.username.toLowerCase().includes(q) ||
          (usr.email ?? "").toLowerCase().includes(q) ||
          (usr.displayName ?? "").toLowerCase().includes(q)),
    );
  }, [filter, role, blockedOnly, initialUsers]);

  return (
    <section className="hud-card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-amber" aria-hidden />
          <h2 className="font-display text-lg uppercase tracking-wider">
            {u.heading}
            <span className="ml-2 font-mono text-xs tracking-widest text-dim">
              [{filtered.length}/{initialUsers.length}]
            </span>
          </h2>
        </div>
        <AddUserModal />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          value={summary.total}
          label={u.statTotal}
          icon={<UsersIcon className="size-4" aria-hidden />}
        />
        <Stat
          value={summary.online}
          label={u.statOnline}
          icon={<SignalIcon className="size-4" aria-hidden />}
          valueClassName="text-military"
        />
        <Stat
          value={summary.blocked}
          label={u.statBlocked}
          icon={<NoSymbolIcon className="size-4" aria-hidden />}
          valueClassName="text-danger"
        />
        <Stat
          value={summary.staff}
          label={u.statStaff}
          icon={<ShieldCheckIcon className="size-4" aria-hidden />}
          valueClassName="text-amber"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
            aria-hidden
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={u.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRole("all")}
            aria-pressed={role === "all"}
            className={`hud-btn !px-2.5 !py-1 text-[11px] ${role === "all" ? "!border-amber/60 !text-amber bg-amber/10" : ""}`}
          >
            {u.roleAll} · {initialUsers.length}
          </button>
          {ROLE_ORDER.filter((r) => roleCounts[r] > 0).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(role === r ? "all" : r)}
              aria-pressed={role === r}
              className={`hud-btn !px-2.5 !py-1 text-[11px] ${role === r ? "!border-amber/60 !text-amber bg-amber/10" : ""}`}
            >
              {u.roles[r]} · {roleCounts[r]}
            </button>
          ))}
          <span className="ml-auto">
            <Switch
              checked={blockedOnly}
              onChange={setBlockedOnly}
              label={u.blockedOnly}
              size="sm"
              variant="danger"
            />
          </span>
        </div>
      </div>

      <div className="flex max-h-[70vh] flex-col gap-2 overflow-auto pr-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-dim">{u.empty}</p>
        ) : (
          filtered.map((usr) => (
            <UserCard
              key={usr.id}
              usr={usr}
              seasons={seasonsByUser[usr.id] ?? []}
              isSelf={usr.id === actor.id}
            />
          ))
        )}
      </div>
    </section>
  );
}
