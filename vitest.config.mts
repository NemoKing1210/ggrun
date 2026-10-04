import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The engine suite is alias-free and stays that way. This config exists so
 * component tests can resolve `@/*` the way the app does, and so `.tsx` is
 * transformed — `tsconfig.json` sets `jsx: "preserve"` because Next owns that
 * step in the app, which leaves the test runner with nothing to do it.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // Socket.IO boundary tests import the production server module, which
    // pulls the DB pool at import time. These dummies only satisfy env
    // validation — the realtime suite injects its user lookup and never
    // opens a connection (nothing listens on port 1 by design).
    env: {
      DATABASE_URL: "postgresql://vitest:vitest@127.0.0.1:1/vitest",
      AUTH_SECRET: "vitest-only-secret",
    },
  },
});
