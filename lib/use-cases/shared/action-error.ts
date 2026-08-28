/**
 * Shared "use server" action error adapter.
 *
 * - Recognizes a domain error class (AdminError / AuthError / GameLoopError)
 *   and resolves its code via the i18n dictionary in `lib/i18n/errors.ts`.
 * - Special-cases ZodError: builds a human-readable message from the first
 *   issue and exposes a JSON dump of all issues under `debug` (dev only).
 * - Falls back to the existing `formUnknown` key and logs the original error
 *   at `error` level for any other thrown value.
 *
 * Every action state includes an optional `debug` field that is populated only
 * when `process.env.NODE_ENV !== "production"`. The matching client component
 * (`components/ui/DebugError.tsx`) renders it.
 */
import { ZodError } from "zod";

import { errorText } from "@/lib/i18n/errors";
import { getT } from "@/lib/i18n/server";
import { log, type LogContext } from "@/lib/infrastructure/logger";
import type { ActionState } from "@/lib/shared/types";
export type { ActionState };

const isDev = (): boolean => process.env.NODE_ENV === "development";

function devDebug(e: unknown): string | undefined {
  if (!isDev()) return undefined;
  if (e instanceof Error) {
    return `${e.name}: ${e.message}${e.stack ? `\n\n${e.stack}` : ""}`;
  }
  try {
    return JSON.stringify(e, null, 2);
  } catch {
    return String(e);
  }
}

/**
 * Builds a single user-facing message and an optional dev-only JSON dump for
 * a ZodError. The user message targets the first issue's path + message, e.g.
 * `displayName: String must contain at most 100 character(s)`.
 */
export function zodToMessage(error: ZodError): { user: string; debug?: string } {
  const first = error.issues[0];
  const path =
    first?.path
      ?.filter((p): p is string | number => p !== undefined)
      .map(String)
      .join(".") ?? "";
  const msg = first?.message ?? "Invalid value";
  return {
    user: path ? `${path}: ${msg}` : msg,
    debug: isDev() ? JSON.stringify(error.issues, null, 2) : undefined,
  };
}

type CodeError = Error & {
  code: string;
  params?: Record<string, string>;
};

/**
 * Returns a `toError` adapter bound to a domain error class. The adapter is
 * what every server action uses in its catch block.
 */
export function makeToError<E extends CodeError>(
  cls: new (...args: never[]) => E,
): (e: unknown, action: string, ctx?: LogContext) => Promise<ActionState> {
  return async function toError(e, action, ctx = {}) {
    if (e instanceof ZodError) {
      const { user, debug } = zodToMessage(e);
      log.warn("action.validation_failed", { action, ...ctx, issues: e.issues });
      return { error: user, debug };
    }
    if (e instanceof cls) {
      const { t } = await getT();
      return {
        error: errorText(t.core.errors, e.code, e.params),
        debug: devDebug(e),
      };
    }
    if (e instanceof Error) {
      log.error("action.failed", { action, ...ctx, err: e });
      const { t } = await getT();
      return { error: errorText(t.core.errors, "formUnknown"), debug: devDebug(e) };
    }
    log.error("action.unknown_failure", {
      action,
      ...ctx,
      err: new Error("Non-Error value thrown"),
      value: e,
    });
    const { t } = await getT();
    return { error: errorText(t.core.errors, "formUnknown"), debug: devDebug(e) };
  };
}
