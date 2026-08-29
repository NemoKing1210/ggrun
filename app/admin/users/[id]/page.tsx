import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import {
  getUserById,
  listUserAuditTrail,
  listUserRolls,
  listUserSeasons,
  listUserSessions,
} from "@/lib/modules/player/service";
import {
  listUserCompletionRequests,
  listUserRerollRequests,
} from "@/lib/modules/catalog/repository/requests";
import { getUserActivityDays } from "@/lib/modules/season/repository/players";
import { UserDetailPage, type UserTab } from "@/components/admin/UserDetailPage";

const TABS: UserTab[] = ["profile", "data", "sessions", "activity", "gameplay", "moderation"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getUserById(id);
  return { title: `${user ? (user.displayName ?? user.username) : `#${id.slice(0, 8)}`} — GGRun` };
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/admin");

  const { id } = await params;
  const { tab } = await searchParams;

  const user = await getUserById(id);
  if (!user) notFound();

  const [sessions, audit, seasons, rolls, rerollRequests, completionRequests, activityDays] = await Promise.all([
    listUserSessions(id),
    listUserAuditTrail(id),
    listUserSeasons(id),
    listUserRolls(id),
    listUserRerollRequests(id),
    listUserCompletionRequests(id),
    getUserActivityDays(id),
  ]);
  const activeTab: UserTab = TABS.includes(tab as UserTab) ? (tab as UserTab) : "profile";

  return (
    <UserDetailPage
      user={user}
      actor={{ id: actor.id, username: actor.username }}
      activeTab={activeTab}
      sessions={sessions}
      audit={audit}
      seasons={seasons}
      rolls={rolls}
      requests={{ rerolls: rerollRequests, completions: completionRequests }}
      activityDays={activityDays}
    />
  );
}