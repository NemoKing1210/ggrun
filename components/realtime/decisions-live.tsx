"use client";

import { useRouter } from "next/navigation";

import { useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { userRoom } from "@/lib/realtime/protocol";

/**
 * Refreshes the page when one of the user's decisions opens or is settled
 * (docs/IEE_CONSTRUCTOR_SPEC.md §7.6) — a question to answer, or one a judge
 * or the default answered. The event is a hint: what the question asks is
 * read from the page the refresh brings.
 */
export function DecisionsLiveRefresh({ userId, seasonId }: { userId: string; seasonId: string }) {
  const router = useRouter();
  useRealtimeEvent(userRoom(userId), "decisions:update", (payload) => {
    if (payload.seasonId === seasonId) router.refresh();
  });
  return null;
}
