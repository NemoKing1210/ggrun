/**
 * Runs before any other import in `server.ts` (import order matters).
 *
 * The `next dev` CLI imports Next's own `node-environment-baseline` before
 * anything else; a custom server must do the equivalent itself. Without it,
 * the first `next/*` import evaluated by tsx (here: `next/headers` via
 * `bots/service` → `auth/session`) creates Next's AsyncLocalStorage
 * singleton while `globalThis.AsyncLocalStorage` is still unset, so Next
 * falls back to a fake that throws
 * `Invariant: AsyncLocalStorage accessed in runtime where it is not
 * available` on the first page render. Setting the global from
 * `node:async_hooks` up front keeps the real implementation everywhere.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.AsyncLocalStorage !== "function") {
  g.AsyncLocalStorage = AsyncLocalStorage;
}
