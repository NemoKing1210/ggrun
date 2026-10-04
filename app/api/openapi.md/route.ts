import { renderApiMarkdown } from "@/lib/api/markdown";

/**
 * `GET /api/openapi.md` — the same contract as one markdown page.
 *
 * For agents and for terminals: an OpenAPI document is precise but awkward to
 * read, and a model handed this file sees every endpoint, every literal error
 * code and every realtime event without following a single `$ref`. The body is
 * exactly `docs/API.md`, so the repo copy and the served copy never differ.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(renderApiMarkdown(), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
