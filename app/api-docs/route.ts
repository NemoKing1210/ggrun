import { apiDocument } from "@/lib/api/spec";

/**
 * `GET /api-docs` — the rendered API reference (Scalar) over
 * `/api/openapi.json`.
 *
 * Served as a route handler rather than a page on purpose: a docs page under
 * `app/` would inherit the root layout — the global chat widget, the i18n
 * provider and the DB-availability gate — none of which belong in front of a
 * static reference, and all of which would keep the docs from rendering while
 * the database is down. This handler touches no database and no React tree.
 *
 * Scalar is loaded from jsDelivr at runtime (pinned version) instead of being
 * vendored: it is a viewer, not part of the app bundle, and the page degrades
 * to links to the raw spec when the CDN is unreachable — which is what an
 * offline development machine gets.
 *
 * The palette is the HUD one from `app/globals.css`; the accent is amber.
 */
export const dynamic = "force-static";

/** Bump deliberately — the API reference is a viewer, not a dependency. */
const SCALAR_VERSION = "1.72.4";
const SCALAR_URL = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/esm.js`;

const HUD_CSS = `
:root {
  --scalar-color-accent: #f2a900;
  --scalar-background-1: #1b1b1a;
  --scalar-background-2: #232320;
  --scalar-background-3: #2a2a22;
  --scalar-background-accent: rgba(242, 169, 0, 0.12);
  --scalar-color-1: #e6e1d3;
  --scalar-color-2: #9a958a;
  --scalar-color-3: #6f6b62;
  --scalar-border-color: #3a3a30;
  --scalar-sidebar-background-1: #171716;
  --scalar-sidebar-border-color: #3a3a30;
  --scalar-sidebar-color-1: #e6e1d3;
  --scalar-sidebar-color-2: #9a958a;
  --scalar-sidebar-color-active: #f2a900;
  --scalar-sidebar-item-active-background: rgba(242, 169, 0, 0.14);
  --scalar-sidebar-search-background: #232320;
  --scalar-sidebar-search-border-color: #3a3a30;
}
`;

function page(): string {
  const { version } = apiDocument().info;
  return `<!doctype html>
<html lang="en" class="dark-mode">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GGRun API reference</title>
    <meta name="description" content="HTTP and realtime API of the GGRun platform — every endpoint, error code and Socket.IO event." />
    <link rel="icon" href="/favicon.ico" />
    <style>
      body { margin: 0; background: #1b1b1a; }
      #fallback { display: none; color: #e6e1d3; font: 16px/1.6 system-ui, sans-serif; max-width: 42rem; margin: 12vh auto; padding: 0 1.5rem; }
      #fallback h1 { color: #f2a900; font-size: 1.25rem; letter-spacing: 0.08em; text-transform: uppercase; }
      #fallback a { color: #f2a900; }
      #fallback code { color: #c98f00; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="fallback">
      <h1>GGRun API v${version}</h1>
      <p>The interactive reference could not load (no network access to the CDN). The contract itself is served from this app and needs no CDN:</p>
      <ul>
        <li><a href="/api/openapi.json">/api/openapi.json</a> — OpenAPI 3.1 document (JSON)</li>
        <li><a href="/api/openapi.md">/api/openapi.md</a> — the same API as one markdown page, for agents</li>
      </ul>
      <p>In the repository the markdown lives at <code>docs/API.md</code>.</p>
    </div>
    <script type="module">
      try {
        const { createApiReference } = await import(${JSON.stringify(SCALAR_URL)});
        createApiReference('#app', {
          url: '/api/openapi.json',
          theme: 'default',
          darkMode: true,
          forceDarkModeState: 'dark',
          hideDarkModeToggle: true,
          customCss: ${JSON.stringify(HUD_CSS)},
          metaData: { title: 'GGRun API reference', description: 'HTTP and realtime API of the GGRun platform.' },
          showOperationId: true,
          defaultOpenAllTags: true,
          expandAllModelSections: true,
          expandAllResponses: true,
          orderRequiredPropertiesFirst: true,
          // No spec leaves the host: the AI chat needs a Scalar key in production anyway.
          agent: { disabled: true },
          telemetry: false,
        });
      } catch {
        document.getElementById('app').hidden = true;
        document.getElementById('fallback').style.display = 'block';
      }
    </script>
  </body>
</html>
`;
}

export function GET(): Response {
  return new Response(page(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
