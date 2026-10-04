import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getInbox } from "@/lib/modules/notifications/service";

export const dynamic = "force-dynamic";

/**
 * Inbox data for the live hook (`useNotificationsFeed`): the same source as
 * the server page, serialized for the client. Owner-only by session.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { items, unread } = await getInbox(user.id, { limit: 50 });
    return NextResponse.json(
      {
        items: items.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
          readAt: n.readAt ? n.readAt.toISOString() : null,
        })),
        unread,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
