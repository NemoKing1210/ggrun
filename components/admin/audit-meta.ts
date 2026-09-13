import {
  CalendarDaysIcon,
  ClockIcon,
  Cog6ToothIcon,
  FingerPrintIcon,
  KeyIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
  UserGroupIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

export type BadgeVariant = "amber" | "military" | "danger" | "dim" | "sky" | "violet" | "emerald" | "neutral";

/** Icon + colour for an action type, grouped by the words in its name. */
export function actionMeta(action: string): { variant: BadgeVariant; icon: typeof ClockIcon } {
  if (/delete|remove/.test(action)) return { variant: "danger", icon: TrashIcon };
  if (/block|blacklist/.test(action)) return { variant: "danger", icon: NoSymbolIcon };
  if (/create|add|approve/.test(action)) return { variant: "military", icon: PlusIcon };
  if (/update|change|adjust|edit|revoke/.test(action)) return { variant: "amber", icon: PencilSquareIcon };
  if (/season/.test(action)) return { variant: "violet", icon: CalendarDaysIcon };
  if (/invite|verification|reject/.test(action)) return { variant: "sky", icon: KeyIcon };
  if (/board/.test(action)) return { variant: "emerald", icon: Squares2X2Icon };
  if (/player/.test(action)) return { variant: "sky", icon: UserGroupIcon };
  if (/settings|keys/.test(action)) return { variant: "dim", icon: Cog6ToothIcon };
  if (/user/.test(action)) return { variant: "dim", icon: UserIcon };
  return { variant: "neutral", icon: FingerPrintIcon };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Subset of the audit dictionary the label helpers need (mock-friendly). */
export type AuditLabels = {
  actions?: Record<string, string>;
  targets?: Record<string, string>;
  fields?: Record<string, string>;
  summaryEmpty?: string;
};

/** Fallback for codes with no dictionary entry: `season_status_active` → `Season status active`. */
export function prettifyCode(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return code;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

/** Human action name: dictionary first, then pattern fallback, then prettified code. */
export function auditActionLabel(action: string, dict?: AuditLabels | null): string {
  const hit = dict?.actions?.[action];
  if (hit) return hit;
  if (action.startsWith("iee_event_")) return `Event: ${prettifyCode(action.slice("iee_event_".length))}`;
  if (action.startsWith("season_status_")) return prettifyCode(`Season ${action.slice("season_status_".length)}`);
  return prettifyCode(action);
}

/** Human target name with fallback to the prettified code. */
export function auditTargetLabel(target: string, dict?: AuditLabels | null): string {
  return dict?.targets?.[target] ?? prettifyCode(target);
}

/** Human payload-field name with fallback to the raw key. */
export function auditFieldLabel(key: string, dict?: AuditLabels | null): string {
  return dict?.fields?.[key] ?? key;
}

/** Compact one-value rendering for summaries (arrays collapse to counts/previews). */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const s = value.length > 48 ? `${value.slice(0, 47)}…` : value;
    return s;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      const preview = value.slice(0, 4).join(", ");
      return value.length > 4 ? `${preview} +${value.length - 4}` : preview;
    }
    return `×${value.length}`;
  }
  return "{…}";
}

/** Most informative payload keys first — the rest follow in payload order. */
const SUMMARY_PRIORITY = [
  "title",
  "reason",
  "email",
  "username",
  "itemKey",
  "effectKey",
  "eventKey",
  "key",
  "position",
  "cellType",
  "role",
  "botUsername",
  "triggeredBy",
  "maxUses",
  "count",
  "removedPlayers",
  "genres",
  "positions",
  "slug",
  "runId",
  "rollId",
];

function shortId(value: unknown): string {
  return typeof value === "string" && value.length > 12 ? `${value.slice(0, 8)}…` : formatAuditValue(value);
}

/**
 * Human one-line summary of an audit entry for tables and CSV:
 * `Reason: spam · Item: spare_die`. Falls back to `summaryEmpty`.
 */
export function describeAudit(
  entry: { actionType: string; payload?: Record<string, unknown> | null },
  dict?: AuditLabels | null,
): string {
  const payload = entry.payload ?? {};
  const keys = Object.keys(payload);
  if (keys.length === 0) return dict?.summaryEmpty ?? "—";
  const ordered = [...keys].sort((a, b) => {
    const ai = SUMMARY_PRIORITY.indexOf(a);
    const bi = SUMMARY_PRIORITY.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return ordered
    .slice(0, 4)
    .map((key) => {
      const value = payload[key];
      const shown =
        /Id$/.test(key) || key === "boardId" || key === "runId" || key === "rollId" || key === "token" || key === "triggeredBy"
          ? shortId(value)
          : formatAuditValue(value);
      return `${auditFieldLabel(key, dict)}: ${shown}`;
    })
    .join(" · ");
}

/** Legacy raw summary (keys + JSON-ish values) — kept for tooltips/CSV detail. */
export function payloadSummary(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .map(([key, value]) => {
      if (value === null || value === undefined) return `${key}=null`;
      if (typeof value === "object") return `${key}={…}`;
      return `${key}="${String(value)}"`;
    })
    .join(" · ");
}
