"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRightIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { AddUserModal } from "@/components/admin/AddUserModal";
import { useI18n } from "@/lib/i18n/client";
import type { AdminUserRow } from "@/lib/modules/player/service/admin";

type Actor = { id: string; username: string };

function roleVariant(role: AdminUserRow["role"]): "amber" | "military" | "dim" | "sky" | "neutral" {
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

/** Admin users list: search + rows linking to /admin/users/[id]; add-user lives in a modal. */
export default function UsersManager({
  initialUsers,
  actor,
}: {
  initialUsers: AdminUserRow[];
  actor: Actor;
}) {
  const { t } = useI18n();
  const u = t.admin.users;
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return initialUsers;
    return initialUsers.filter(
      (usr) =>
        usr.username.toLowerCase().includes(q) ||
        (usr.email ?? "").toLowerCase().includes(q) ||
        (usr.displayName ?? "").toLowerCase().includes(q),
    );
  }, [filter, initialUsers]);

  return (
    <section className="hud-card flex flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-amber" aria-hidden />
          <h2 className="font-display text-lg uppercase tracking-wider">
            {u.heading}
            <span className="ml-2 font-mono text-xs tracking-widest text-dim">[{filtered.length}]</span>
          </h2>
        </div>
        <AddUserModal />
      </div>

      <div className="relative mb-3">
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

      <div className="flex max-h-[70vh] flex-col gap-2 overflow-auto pr-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-dim">{u.empty}</p>
        ) : (
          filtered.map((usr) => {
            const isSelf = usr.id === actor.id;
            const name = usr.displayName ?? usr.username;
            const initials = name.slice(0, 2).toUpperCase();
            return (
              <Link
                key={usr.id}
                href={`/admin/users/${usr.id}`}
                className="group flex w-full items-center gap-3 border border-[#3d3d34] bg-[#1a1a1a] p-3 text-left transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] hover:border-amber/40 hover:bg-amber/5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center border border-dim/40 bg-raised font-display text-xs tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-sm uppercase tracking-wide text-zinc-100 transition-colors group-hover:text-amber">
                      {name}
                    </span>
                    {isSelf && <Badge variant="military" size="sm">{u.you}</Badge>}
                  </span>
                  <span className="block truncate font-mono text-xs text-dim">@{usr.username}</span>
                  <span className="block truncate font-mono text-xs text-dim">{usr.email ?? "—"}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge variant={roleVariant(usr.role)} size="sm">
                    {u.roles[usr.role]}
                  </Badge>
                  <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest ${usr.isBlocked ? "text-danger" : "text-military"}`}>
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
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-dim transition-colors group-hover:text-amber" aria-hidden />
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}