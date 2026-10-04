"use client";

import { SeasonLiveRefresh, SEASON_LIVE_DEBOUNCE_MS } from "@/components/realtime/season-live";
import { useI18n } from "@/lib/i18n/client";

/**
 * Keeps server-rendered board pages (`/board`, season board) in sync with
 * the game: every `board:event` re-fetches the server snapshot (positions,
 * active rolls, stats) after a short debounce. Renders the shared live
 * feedback (progress sweep + "updated" toast), nothing else.
 */
export function BoardLiveRefresh({ seasonId }: { seasonId: string }) {
  const { t } = useI18n();
  return (
    <SeasonLiveRefresh
      seasonId={seasonId}
      debounceMs={SEASON_LIVE_DEBOUNCE_MS}
      labels={{ updated: t.feed.updated }}
    />
  );
}
