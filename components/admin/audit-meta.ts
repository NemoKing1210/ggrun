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

/** Compact single-line summary of a payload object for tables. */
export function payloadSummary(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .map(([key, value]) => {
      if (value === null || value === undefined) return `${key}=null`;
      if (typeof value === "object") return `${key}={…}`;
      return `${key}="${String(value)}"`;
    })
    .join(" · ");
}