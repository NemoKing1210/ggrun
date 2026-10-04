/**
 * Notification domain — pure types. No framework, no DB, no i18n runtime.
 * Rendering (dictionary lookup, icons, links) happens outside the engine.
 */

export type NotificationSeverity = "info" | "success" | "warning" | "danger";

/**
 * Every notification kind the platform can emit. Adding a kind = adding a row
 * here + a template in `registry.ts` + title/body strings in the
 * `notifications` dictionaries (en/ru/uk). The compiler forces all three.
 */
export type NotificationKind =
  | "player_added"
  | "player_removed"
  | "player_adjusted"
  | "season_started"
  | "reroll_requested"
  | "reroll_approved"
  | "reroll_rejected"
  | "completion_requested"
  | "completion_approved"
  | "completion_rejected"
  /** Free-text notice sent by an admin from the command console. */
  | "admin_broadcast";

/** One action button rendered under the card. */
export interface NotificationActionDef {
  /** Stable id within the notification (`open_dashboard`, `view_season`…). */
  id: string;
  /** Key into `notifications.actions.<key>` in the dictionaries. */
  labelKey: string;
  /** In-app path the button navigates to. Absent = no navigation. */
  href?: string;
  /** HUD accent for the button. Defaults to the notification severity. */
  style?: NotificationSeverity;
}

/**
 * Opaque integration payload. Opaque to the engine — interpreted by the
 * client panels — but the builders type the fields each kind promises so a
 * publisher cannot forget `seasonId` where the card links to the season.
 */
export interface NotificationData {
  seasonId?: string;
  seasonSlug?: string | null;
  seasonTitle?: string;
  seasonPlayerId?: string | null;
  gameId?: string | null;
  gameTitle?: string;
  rollId?: string | null;
  requestId?: string | null;
  outcome?: "passed" | "dropped" | "rerolled" | string;
  reason?: string | null;
  adminNote?: string | null;
  [key: string]: unknown;
}

/** Fully-shaped notification content — what the service persists + pushes. */
export interface BuiltNotification {
  kind: NotificationKind;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  severity: NotificationSeverity;
  /** Heroicon key from the registry (client maps it to a component). */
  icon: string;
  imageUrl: string | null;
  href: string | null;
  actions: NotificationActionDef[];
  data: NotificationData;
  /** Idempotency key; publishers retrying the same fact reuse it. */
  dedupeKey: string | null;
}

/** Input a publisher provides — everything else comes from the template. */
export interface NotifyInput {
  seasonId?: string;
  seasonSlug?: string | null;
  seasonTitle?: string;
  seasonPlayerId?: string | null;
  gameId?: string | null;
  gameTitle?: string;
  rollId?: string | null;
  requestId?: string | null;
  outcome?: string;
  reason?: string | null;
  adminNote?: string | null;
  /** Overrides the template image (e.g. game cover). */
  imageUrl?: string | null;
  /** Overrides the template link. */
  href?: string | null;
  /** Extra params merged into the i18n interpolation. */
  params?: Record<string, unknown>;
  /** Extra data merged into `data`. */
  data?: Record<string, unknown>;
}
