import { redirect } from "next/navigation";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/page-header";
import { NotificationsInbox } from "@/components/notifications/NotificationsInbox";
import { getT } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getInbox } from "@/lib/modules/notifications/service";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.notifications.metaTitle };
}

/** Personal inbox: server snapshot + live socket sync in the client list. */
export default async function NotificationsPage() {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { items, unread } = await getInbox(user.id, { limit: 50 });

  return (
    <PageContainer>
      <PageHeader kicker={t.notifications.kicker} title={t.notifications.pageTitle} />
      <NotificationsInbox
        userId={user.id}
        initialItems={items.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
          readAt: n.readAt ? n.readAt.toISOString() : null,
        }))}
        initialUnread={unread}
      />
    </PageContainer>
  );
}
