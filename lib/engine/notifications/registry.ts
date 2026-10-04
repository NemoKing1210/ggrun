import type {
  NotificationActionDef,
  NotificationKind,
  NotificationSeverity,
} from "./types";

/**
 * Per-kind template: the fixed half of every notification. Publishers supply
 * only the variable half (`NotifyInput`) — titles, bodies, accents, icons,
 * links and buttons stay consistent no matter which use-case emits the kind.
 *
 * `titleKey` / `bodyKey` point at `notifications.title.<key>` /
 * `notifications.body.<key>` in the dictionaries. Keeping the key here (not
 * at the call site) means a missing translation is one grep away.
 */

export interface NotificationTemplate {
  kind: NotificationKind;
  titleKey: string;
  bodyKey: string;
  severity: NotificationSeverity;
  /** Default Heroicon key (see `components/notifications/icons.ts`). */
  icon: string;
  /** Default card link. `{seasonSlug}` is substituted from data when known. */
  href: string | null;
  actions: NotificationActionDef[];
  /** Builds the idempotency key from the input, or null = no dedupe. */
  dedupeKeyOf: (data: {
    seasonId?: string;
    requestId?: string | null;
    rollId?: string | null;
    outcome?: string;
  }) => string | null;
}

const dashboardActions: NotificationActionDef[] = [
  { id: "open_dashboard", labelKey: "openDashboard", href: "/dashboard" },
];

const seasonActions: NotificationActionDef[] = [
  { id: "view_season", labelKey: "viewSeason", href: "/seasons/{seasonSlug}" },
];

export const NOTIFICATION_TEMPLATES: Record<NotificationKind, NotificationTemplate> = {
  player_added: {
    kind: "player_added",
    titleKey: "playerAdded",
    bodyKey: "playerAdded",
    severity: "success",
    icon: "UserPlusIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: ({ seasonId }) => (seasonId ? `player:added:${seasonId}` : null),
  },
  player_removed: {
    kind: "player_removed",
    titleKey: "playerRemoved",
    bodyKey: "playerRemoved",
    severity: "warning",
    icon: "UserMinusIcon",
    href: "/seasons",
    actions: [{ id: "browse_seasons", labelKey: "browseSeasons", href: "/seasons" }],
    dedupeKeyOf: ({ seasonId }) => (seasonId ? `player:removed:${seasonId}` : null),
  },
  player_adjusted: {
    kind: "player_adjusted",
    titleKey: "playerAdjusted",
    bodyKey: "playerAdjusted",
    severity: "info",
    icon: "AdjustmentsHorizontalIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: () => null,
  },
  season_started: {
    kind: "season_started",
    titleKey: "seasonStarted",
    bodyKey: "seasonStarted",
    severity: "success",
    icon: "PlayIcon",
    href: "/seasons/{seasonSlug}",
    actions: seasonActions,
    dedupeKeyOf: ({ seasonId }) => (seasonId ? `season:started:${seasonId}` : null),
  },
  reroll_requested: {
    kind: "reroll_requested",
    titleKey: "rerollRequested",
    bodyKey: "rerollRequested",
    severity: "info",
    icon: "ArrowPathIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: ({ requestId, rollId }) =>
      requestId ? `reroll:requested:${requestId}` : rollId ? `reroll:requested:roll:${rollId}` : null,
  },
  reroll_approved: {
    kind: "reroll_approved",
    titleKey: "rerollApproved",
    bodyKey: "rerollApproved",
    severity: "success",
    icon: "CheckCircleIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: ({ requestId }) => (requestId ? `reroll:approved:${requestId}` : null),
  },
  reroll_rejected: {
    kind: "reroll_rejected",
    titleKey: "rerollRejected",
    bodyKey: "rerollRejected",
    severity: "danger",
    icon: "XCircleIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: ({ requestId }) => (requestId ? `reroll:rejected:${requestId}` : null),
  },
  completion_requested: {
    kind: "completion_requested",
    titleKey: "completionRequested",
    bodyKey: "completionRequested",
    severity: "info",
    icon: "ClockIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: ({ requestId, rollId }) =>
      requestId
        ? `completion:requested:${requestId}`
        : rollId
          ? `completion:requested:roll:${rollId}`
          : null,
  },
  completion_approved: {
    kind: "completion_approved",
    titleKey: "completionApproved",
    bodyKey: "completionApproved",
    severity: "success",
    icon: "TrophyIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: ({ requestId }) => (requestId ? `completion:approved:${requestId}` : null),
  },
  completion_rejected: {
    kind: "completion_rejected",
    titleKey: "completionRejected",
    bodyKey: "completionRejected",
    severity: "danger",
    icon: "XCircleIcon",
    href: "/dashboard",
    actions: dashboardActions,
    dedupeKeyOf: ({ requestId }) => (requestId ? `completion:rejected:${requestId}` : null),
  },
  admin_broadcast: {
    kind: "admin_broadcast",
    titleKey: "adminBroadcast",
    bodyKey: "adminBroadcast",
    severity: "info",
    icon: "MegaphoneIcon",
    href: "/notifications",
    actions: [{ id: "open_inbox", labelKey: "openInbox", href: "/notifications" }],
    // A personal note from staff is never deduped — same wording twice still means twice.
    dedupeKeyOf: () => null,
  },
};

export const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_TEMPLATES) as NotificationKind[];
