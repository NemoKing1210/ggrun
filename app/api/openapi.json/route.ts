import { apiDocument } from "@/lib/api/spec";

/**
 * `GET /api/openapi.json` — the machine-readable contract.
 *
 * A route handler, not a page: an OpenAPI document must not pass through the
 * app shell (i18n, DB-availability gate) and must be readable by any HTTP
 * client without a session. The document is a pure function of `lib/api/`,
 * so the response is generated once at build time.
 *
 * Consumers: `app/api-docs/route.ts` (Scalar renders it), `docs/API.md`,
 * and any agent that wants the schema rather than the prose.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(JSON.stringify(apiDocument(), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
