import { cache } from "react";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { log } from "@/lib/log";

const logger = log.child({ scope: "db-health" });

/** How long a successful probe result is trusted without re-probing. */
const OK_TTL_MS = 30_000;
/** How long a failed probe blocks re-probing (fast rejection during an outage). */
const FAIL_TTL_MS = 3_000;
/** Hard timeout for a single probe query. */
const PROBE_TIMEOUT_MS = 5_000;

let lastOkAt = 0;
let lastFailAt = 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("db probe timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** True when the error (or any of its causes) looks like a connectivity failure. */
export function isDbConnectionError(error: unknown): boolean {
  let current: unknown = error;
  // Drizzle wraps driver errors in DrizzleQueryError; walk the cause chain.
  while (current instanceof Error) {
    const code = (current as NodeJS.ErrnoException).code ?? "";
    if (
      ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH"].includes(
        code,
      )
    ) {
      return true;
    }
    const msg = current.message.toLowerCase();
    if (
      msg.includes("econnrefused") ||
      msg.includes("connection terminated") ||
      msg.includes("connect timeout") ||
      msg.includes("the database system is starting up")
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/**
 * Cheap DB availability check ("select 1") throttled across requests:
 * one success is trusted for OK_TTL_MS and a failure short-circuits into
 * fast rejections for FAIL_TTL_MS. Per-request deduplication via React cache().
 */
export const isDbAvailable = cache(async (): Promise<boolean> => {
  const now = Date.now();
  if (now - lastOkAt < OK_TTL_MS) return true;
  if (now - lastFailAt < FAIL_TTL_MS) return false;
  try {
    await withTimeout(db.execute(sql`select 1`), PROBE_TIMEOUT_MS);
    lastOkAt = Date.now();
    return true;
  } catch (error) {
    lastFailAt = Date.now();
    if (isDbConnectionError(error)) {
      // Expected during an outage — one warn per FAIL_TTL_MS at most.
      logger.warn("database unreachable", {
        err: error instanceof Error ? error : undefined,
      });
    } else {
      // Non-connection failures are unexpected — keep the server log noisy.
      logger.error("unexpected database probe failure", {
        err: error instanceof Error ? error : undefined,
      });
    }
    return false;
  }
});