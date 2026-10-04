import { NOTIFICATION_TEMPLATES } from "./registry";
import type {
  BuiltNotification,
  NotificationActionDef,
  NotificationKind,
  NotifyInput,
} from "./types";

/**
 * Pure builders — the only way to shape a notification. Every publisher goes
 * through `buildNotification(kind, input)` so cards stay consistent: same
 * title/body keys, same accent, same buttons for a kind no matter who emits.
 */

function substitute(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = data[key];
    return typeof value === "string" && value.length > 0 ? value : match;
  });
}

function resolveHref(
  template: string | null,
  input: NotifyInput,
): string | null {
  if (input.href !== undefined) return input.href;
  if (!template) return null;
  const resolved = substitute(template, {
    seasonSlug: input.seasonSlug ?? "",
    seasonId: input.seasonId ?? "",
  });
  // A template that could not be resolved (no slug where one is needed)
  // falls back to the seasons index instead of a broken `/seasons/{slug}`.
  if (resolved.includes("{") || resolved.includes("}")) return "/seasons";
  if (resolved === "/seasons/") return "/seasons";
  return resolved;
}

function resolveActions(
  actions: NotificationActionDef[],
  input: NotifyInput,
): NotificationActionDef[] {
  return actions.map((action) => {
    if (!action.href) return action;
    const href = substitute(action.href, {
      seasonSlug: input.seasonSlug ?? "",
      seasonId: input.seasonId ?? "",
    });
    if (href.includes("{") || href.includes("}")) return { ...action, href: "/seasons" };
    if (href === "/seasons/") return { ...action, href: "/seasons" };
    return { ...action, href };
  });
}

export function buildNotification(kind: NotificationKind, input: NotifyInput = {}): BuiltNotification {
  const template = NOTIFICATION_TEMPLATES[kind];
  const seasonTitle = input.seasonTitle ?? "";
  const gameTitle = input.gameTitle ?? "";
  const params: Record<string, unknown> = {
    ...(seasonTitle ? { season: seasonTitle } : {}),
    ...(gameTitle ? { game: gameTitle } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.adminNote ? { adminNote: input.adminNote } : {}),
    ...(input.params ?? {}),
  };
  const data = {
    ...(input.seasonId ? { seasonId: input.seasonId } : {}),
    ...(input.seasonSlug !== undefined ? { seasonSlug: input.seasonSlug } : {}),
    ...(input.seasonTitle ? { seasonTitle: input.seasonTitle } : {}),
    ...(input.seasonPlayerId !== undefined ? { seasonPlayerId: input.seasonPlayerId } : {}),
    ...(input.gameId !== undefined ? { gameId: input.gameId } : {}),
    ...(input.gameTitle ? { gameTitle: input.gameTitle } : {}),
    ...(input.rollId !== undefined ? { rollId: input.rollId } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
    ...(input.data ?? {}),
  };
  return {
    kind,
    titleKey: template.titleKey,
    bodyKey: template.bodyKey,
    params,
    severity: template.severity,
    icon: template.icon,
    imageUrl: input.imageUrl ?? null,
    href: resolveHref(template.href, input),
    actions: resolveActions(template.actions, input),
    data,
    dedupeKey: template.dedupeKeyOf({
      seasonId: input.seasonId,
      requestId: input.requestId,
      rollId: input.rollId,
      outcome: input.outcome,
    }),
  };
}

/** Every kind has a template — exhaustiveness guard for future kinds. */
export function assertAllKindsBuilt(kinds: readonly NotificationKind[]): void {
  for (const kind of kinds) {
    if (!NOTIFICATION_TEMPLATES[kind]) throw new Error(`missing template: ${kind}`);
  }
}
