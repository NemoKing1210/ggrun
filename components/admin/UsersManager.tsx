"use client";

import { useMemo, useState } from "react";
import {
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormShell } from "@/components/admin/FormShell";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import {
  blockUserAction,
  createUserAction,
  deleteUserAction,
  updateUserAction,
} from "@/lib/use-cases/user-actions";
import { useI18n } from "@/lib/i18n/client";
import type { AdminUserRow } from "@/lib/use-cases/users";

const roles = ["admin", "judge", "player", "viewer"] as const;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = useMemo(
    () => (selectedId ? initialUsers.find((x) => x.id === selectedId) ?? null : null),
    [selectedId, initialUsers],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      {/* Left: list panel */}
      <div className="flex flex-col gap-4">
        {/* Add user */}
        <section className="hud-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlusIcon className="h-5 w-5 text-amber" aria-hidden />
            <h2 className="font-display text-lg uppercase tracking-wider">{u.addHeading}</h2>
          </div>
          <div className="hazard-tape mb-3 opacity-60" aria-hidden />
          <FormShell
            action={createUserAction}
            submitLabel={t.core.common.add}
            submitClassName="hud-btn hud-btn-primary w-full"
            className="flex flex-col gap-3"
          >
            <Field label={u.emailLabel}>
              <Input name="email" type="email" required placeholder="user@example.com" />
            </Field>
            <Field label={u.usernameLabel}>
              <Input name="username" required pattern="[a-zA-Z0-9_\-]+" placeholder="player_one" />
            </Field>
            <Field label={u.passwordLabel}>
              <Input name="password" type="password" required minLength={8} placeholder="••••••••" />
            </Field>
            <Field label={t.core.auth.displayName}>
              <Input name="displayName" placeholder="Display name" />
            </Field>
            <Field label={u.roleLabel}>
              <Select name="role" defaultValue="player">
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {u.roles[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </FormShell>
        </section>

        {/* Search + list */}
        <section className="hud-card flex flex-col p-4">
          <div className="mb-3 flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-amber" aria-hidden />
            <h2 className="font-display text-lg uppercase tracking-wider">
              {u.heading}
              <span className="ml-2 font-mono text-xs tracking-widest text-dim">[{filtered.length}]</span>
            </h2>
          </div>
          <div className="relative mb-3">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" aria-hidden />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={u.searchPlaceholder}
              className="pl-9"
            />
          </div>
          <div className="max-h-[58vh] overflow-auto pr-1 -mr-1 flex flex-col gap-2 lg:max-h-[70vh]">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-dim">{u.empty}</p>
            ) : (
              filtered.map((usr) => {
                const isSelf = usr.id === actor.id;
                const isSelected = usr.id === selectedId;
                const name = usr.displayName ?? usr.username;
                const initials = name.slice(0, 2).toUpperCase();
                return (
                  <button
                    key={usr.id}
                    type="button"
                    onClick={() => setSelectedId(usr.id)}
                    className={`flex w-full items-center gap-3 border p-3 text-left transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
                      isSelected
                        ? "border-amber bg-amber/10"
                        : "border-[#3d3d34] bg-[#1a1a1a] hover:border-amber/40 hover:bg-amber/5"
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center border border-dim/40 bg-raised font-display text-xs tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                      {initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-display text-sm uppercase tracking-wide">{name}</span>
                        {isSelf && <Badge variant="military" size="sm">{u.you}</Badge>}
                      </span>
                      <span className="block truncate font-mono text-xs text-dim">@{usr.username}</span>
                      <span className="block truncate font-mono text-xs text-dim">{usr.email ?? "—"}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={roleVariant(usr.role)} size="sm">
                        {u.roles[usr.role]}
                      </Badge>
                      <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest ${usr.isBlocked ? "text-danger" : "text-military"}`}>
                        <span className={`inline-block h-1.5 w-1.5 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)] ${usr.isBlocked ? "bg-danger" : "bg-military"}`} aria-hidden />
                        {usr.isBlocked ? u.blocked : u.activeUser}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Right: detail */}
      <div className="lg:sticky lg:top-6">
        {!selected ? (
          <section className="hud-card flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
            <UsersIcon className="h-12 w-12 text-dim/50" aria-hidden />
            <h3 className="mt-3 font-display text-lg uppercase tracking-widest text-dim">Select a user</h3>
            <p className="mt-2 max-w-sm font-mono text-xs leading-relaxed text-dim">
              Choose a user from the list to edit their profile, change role, or manage access. Use the search to filter by email, username or display name.
            </p>
            <div className="hazard-tape mt-6 w-full max-w-xs opacity-40" aria-hidden />
          </section>
        ) : (
          <section className="hud-card p-5">
            {(() => {
              const isSelf = selected.id === actor.id;
              const name = selected.displayName ?? selected.username;
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-display text-2xl uppercase tracking-wide">{name}</h3>
                        {isSelf && <Badge variant="military" size="sm">{u.you}</Badge>}
                        <Badge variant={roleVariant(selected.role)} size="sm">{u.roles[selected.role]}</Badge>
                        <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-xs uppercase tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${selected.isBlocked ? "border-danger/40 bg-danger/10 text-danger" : "border-military/30 bg-military/10 text-military"}`}>
                          {selected.isBlocked ? <NoSymbolIcon className="h-3 w-3" aria-hidden /> : <ShieldCheckIcon className="h-3 w-3" aria-hidden />}
                          {selected.isBlocked ? u.blocked : u.activeUser}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-sm text-dim">@{selected.username} · {selected.email ?? "—"}</p>
                      <p className="mt-1 font-mono text-xs text-dim">ID: {selected.id.slice(0, 8)} · Joined {new Date(selected.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="grid h-12 w-12 shrink-0 place-items-center border border-amber bg-amber text-black font-display text-sm [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  <div className="hazard-tape my-4 opacity-60" aria-hidden />

                  <div className="flex items-center gap-2">
                    <PencilSquareIcon className="h-5 w-5 text-amber" aria-hidden />
                    <h4 className="font-display text-sm uppercase tracking-widest">Edit user</h4>
                  </div>

                  <div className="mt-3">
                    <FormShell
                      action={updateUserAction}
                      submitLabel={t.core.common.save}
                      submitClassName="hud-btn hud-btn-primary w-full sm:w-auto"
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      <input type="hidden" name="userId" value={selected.id} />
                      <Field label={t.core.auth.displayName}>
                        <Input name="displayName" defaultValue={selected.displayName ?? ""} placeholder="Display name" />
                      </Field>
                      <Field label={u.usernameLabel}>
                        <Input name="username" defaultValue={selected.username} required />
                      </Field>
                      <Field label={u.emailLabel}>
                        <Input name="email" type="email" defaultValue={selected.email ?? ""} />
                      </Field>
                      <Field label={u.roleLabel}>
                        <Select name="role" defaultValue={selected.role}>
                          {roles.map((r) => (
                            <option key={r} value={r}>{u.roles[r]}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t.core.auth.password} hint="Leave blank to keep">
                        <Input name="password" type="password" placeholder="••••••••" />
                      </Field>
                    </FormShell>
                  </div>

                  <div className="mt-6 grid gap-3 border-t border-[#3d3d34] pt-4 sm:grid-cols-2">
                    <form action={blockUserAction} className="hud-card bg-[#1a1a1a] p-3">
                      <input type="hidden" name="userId" value={selected.id} />
                      <input type="hidden" name="blocked" value={String(!selected.isBlocked)} />
                      <div className="flex items-center gap-2">
                        {selected.isBlocked ? <ShieldCheckIcon className="h-4 w-4 text-military" aria-hidden /> : <NoSymbolIcon className="h-4 w-4 text-danger" aria-hidden />}
                        <span className="font-display text-xs uppercase tracking-widest">{selected.isBlocked ? u.unblockButton : u.blockButton}</span>
                      </div>
                      <p className="mt-2 font-mono text-xs leading-relaxed text-dim">
                        {selected.isBlocked ? "Restore access for this account." : "Block this account immediately. They will be logged out."}
                      </p>
                      <ConfirmButton
                        message={`${selected.isBlocked ? u.unblockButton : u.blockButton}: ${selected.username}?`}
                        className={`hud-btn mt-3 w-full text-xs ${selected.isBlocked ? "hud-btn-primary" : ""}`}
                        disabled={isSelf}
                      >
                        {selected.isBlocked ? u.unblockButton : u.blockButton}
                      </ConfirmButton>
                      {isSelf && <p className="mt-2 font-mono text-xs text-danger">You cannot block yourself.</p>}
                    </form>

                    <form action={deleteUserAction} className="hud-card bg-danger/5 p-3">
                      <div className="flex items-center gap-2">
                        <TrashIcon className="h-4 w-4 text-danger" aria-hidden />
                        <span className="font-display text-xs uppercase tracking-widest text-danger">{u.deleteButton}</span>
                      </div>
                      <p className="mt-2 font-mono text-xs leading-relaxed text-dim">Permanently delete the account and all related data. This cannot be undone.</p>
                      <ConfirmButton
                        message={`${u.deleteButton}: ${selected.username}?`}
                        className="hud-btn hud-btn-danger mt-3 w-full text-xs"
                        disabled={isSelf}
                      >
                        {u.deleteButton}
                      </ConfirmButton>
                      {isSelf && <p className="mt-2 font-mono text-xs text-danger">You cannot delete yourself.</p>}
                    </form>
                  </div>
                </>
              );
            })()}
          </section>
        )}
      </div>
    </div>
  );
}
