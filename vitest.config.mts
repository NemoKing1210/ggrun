import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The engine suite is alias-free and stays that way. This config exists so
 * component tests can resolve `@/*` the way the app does, and so `.tsx` is
 * transformed — `tsconfig.json` sets `jsx: "preserve"` because Next owns that
 * step in the app, which leaves the test runner with nothing to do it.
 *
 * Coverage gates live at the bottom. They are a ratchet, not a goal: raise
 * them when the suite raises the number, never lower them to let a red run
 * through. `pnpm verify` (and the pre-push hook) runs this config, so a
 * regression in either tests or coverage stops the push.
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
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/node_modules/**",
        ".next/**",
        // Type-only declarations and generated data: nothing to exercise.
        "lib/**/types/**",
        "components/iee/art-manifest.ts",
      ],
      // A ratchet, measured 2026-10: 78.9% lines / 77.3% statements /
      // 69.8% branches / 69.9% functions. Raise when the suite raises the
      // number; never lower to let a red run through.
      thresholds: {
        lines: 78,
        statements: 76,
        branches: 68,
        functions: 68,
      },
    },
  },
});
