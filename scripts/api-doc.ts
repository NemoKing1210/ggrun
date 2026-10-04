import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { renderApiMarkdown } from "@/lib/api/markdown";

/**
 * Writes `docs/API.md` — the agent-facing form of the API contract.
 *
 * Why generated rather than hand-written: two hand-maintained descriptions of
 * the same five endpoints drift the moment one of them is edited, and the one
 * nobody renders is the one that goes stale unnoticed. The source of truth is
 * `lib/api/` (see `contract.ts` and `realtime.ts`), which the route handlers
 * are checked against by `lib/api/spec.test.ts`; this file only renders it.
 *
 *   pnpm api:doc      # rebuild docs/API.md
 *   GET /api/openapi.md   # serves these same bytes
 *   GET /api/openapi.json # OpenAPI 3.1 for tooling
 *   GET /api-docs         # rendered reference (Scalar)
 */
const OUT = resolve(process.cwd(), "docs", "API.md");

function main(): void {
  const markdown = renderApiMarkdown();
  writeFileSync(OUT, markdown, "utf8");
  console.log(`wrote ${OUT} (${markdown.split("\n").length} lines)`);
}

// Only run when invoked directly — importing this module from a test must not
// write the file it is about to compare against.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
