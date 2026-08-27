import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/use-cases/users";
import { getT } from "@/lib/i18n/server";
import UsersManager from "@/components/admin/UsersManager";

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
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-widest text-amber">{u.heading}</h1>
        <span className="hidden font-mono text-xs tracking-widest text-dim sm:inline">[{users.length}] accounts</span>
      </div>
      <div className="hazard-tape" aria-hidden />
      <UsersManager initialUsers={users} actor={{ id: actor.id, username: actor.username }} />
    </div>
  );
}
