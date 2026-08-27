import type { Metadata } from "next";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/use-cases/users";
import { getT } from "@/lib/i18n/server";
import {
  blockUserAction,
  createUserAction,
  deleteUserAction,
  updateUserAction,
} from "@/lib/use-cases/user-actions";
import { FormShell } from "@/components/admin/FormShell";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

const roles = ["admin", "judge", "player", "viewer"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.users} — GGRun` };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/admin");

  const { q } = await searchParams;
  const { t } = await getT();
  const users = await listUsers(q);
  const u = t.admin.users;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {u.heading}
      </h1>
      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <h2 className="font-display mb-3 text-xl uppercase tracking-wider">
          {u.addHeading}
        </h2>
        <FormShell
          action={createUserAction}
          submitLabel={t.core.common.add}
          className="grid grid-cols-1 gap-3 sm:grid-cols-5"
        >
          <label className="text-dim text-sm">
            {u.emailLabel}
            <input name="email" type="email" required />
          </label>
          <label className="text-dim text-sm">
            {u.usernameLabel}
            <input name="username" required pattern="[a-zA-Z0-9_\-]+" />
          </label>
          <label className="text-dim text-sm">
            {u.passwordLabel}
            <input name="password" type="password" required minLength={8} />
          </label>
          <label className="text-dim text-sm">
            {t.core.auth.displayName}
            <input name="displayName" />
          </label>
          <label className="text-dim text-sm">
            {u.roleLabel}
            <select name="role" defaultValue="player">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {u.roles[r]}
                </option>
              ))}
            </select>
          </label>
        </FormShell>
      </section>

      <section className="hud-card p-4">
        <form method="get" className="flex gap-3">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder={u.searchPlaceholder}
            className="!w-full"
          />
          <button type="submit" className="hud-btn self-start whitespace-nowrap inline-flex items-center justify-center !px-3" aria-label={u.searchPlaceholder}>
            <MagnifyingGlassIcon className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        {users.length === 0 && <p className="text-dim">{u.empty}</p>}
        {users.map((user) => {
          const isSelf = user.id === actor.id;
          const name = user.displayName ?? user.username;
          return (
            <div key={user.id} className="hud-card p-4">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-display text-lg">{name}</span>
                {isSelf && (
                  <span className="border border-military px-2 py-0.5 font-mono text-xs text-military">
                    {u.you}
                  </span>
                )}
                <span className="font-mono text-xs text-dim">@{user.username}</span>
                <span className="font-mono text-xs text-dim">{user.email ?? "—"}</span>
                <span
                  className={`font-mono text-xs uppercase tracking-widest ${
                    user.isBlocked ? "text-danger" : "text-military"
                  }`}
                >
                  {user.isBlocked ? u.blocked : u.activeUser}
                </span>
                <span className="ml-auto flex gap-2">
                  <form action={blockUserAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="blocked" value={String(!user.isBlocked)} />
                    <ConfirmButton
                      message={`${user.isBlocked ? u.unblockButton : u.blockButton}: ${user.username}?`}
                      className="hud-btn !py-1 !px-3 text-xs"
                      disabled={isSelf}
                    >
                      {user.isBlocked ? u.unblockButton : u.blockButton}
                    </ConfirmButton>
                  </form>
                  <form action={deleteUserAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <ConfirmButton
                      message={`${u.deleteButton}: ${user.username}?`}
                      className="hud-btn hud-btn-danger !py-1 !px-3 text-xs"
                      disabled={isSelf}
                    >
                      {u.deleteButton}
                    </ConfirmButton>
                  </form>
                </span>
              </div>

              <FormShell
                action={updateUserAction}
                submitLabel={t.core.common.save}
                submitClassName="hud-btn !py-1 !px-3 text-xs"
                className="grid grid-cols-2 gap-2 sm:grid-cols-5"
              >
                <input type="hidden" name="userId" value={user.id} />
                <label className="text-dim text-xs">
                  {t.core.auth.displayName}
                  <input name="displayName" defaultValue={user.displayName ?? ""} />
                </label>
                <label className="text-dim text-xs">
                  {u.usernameLabel}
                  <input name="username" defaultValue={user.username} />
                </label>
                <label className="text-dim text-xs">
                  {u.emailLabel}
                  <input name="email" type="email" defaultValue={user.email ?? ""} />
                </label>
                <label className="text-dim text-xs">
                  {u.roleLabel}
                  <select name="role" defaultValue={user.role}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {u.roles[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-dim text-xs">
                  {t.core.auth.password}
                  <input name="password" type="password" placeholder="••••••••" />
                </label>
              </FormShell>
            </div>
          );
        })}
      </section>
    </div>
  );
}
