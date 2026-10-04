import {
  API_ENDPOINTS,
  type ApiEndpoint,
  type ApiParameter,
  type ApiResponseDoc,
} from "./contract";
import { apiDocument, type ApiDocument, type JsonSchema } from "./spec";
import { REALTIME_TRANSPORT } from "./realtime";

/**
 * Markdown rendering of the API document — the agent-facing form of the same
 * contract that `GET /api/openapi.json` serves as OpenAPI.
 *
 * Written for two readers at once: a human skimming `docs/API.md` in the repo
 * and a model handed the file (or `GET /api/openapi.md`) as context. So it is
 * one self-contained page — every endpoint, every literal error code, every
 * realtime event with its JSON Schema inlined — and it contains no links to
 * read elsewhere except the spec URLs themselves.
 *
 * `pnpm api:doc` writes this file; `lib/api/spec.test.ts` fails when the
 * committed copy is stale.
 */

const BASE_URL = "http://localhost:3000";

const BANNER = [
  "> **Generated file — do not edit.** `pnpm api:doc` rebuilds it from `lib/api/`",
  "> (`contract.ts` for HTTP, `realtime.ts` for Socket.IO). Change the source, not this file.",
].join("\n");

function json(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

/** One-line type summary of a JSON Schema, for parameter tables. */
function typeOf(schema: JsonSchema): string {
  const parts: string[] = [];
  // `\|` keeps the pipe inside a markdown table cell.
  if (Array.isArray(schema.enum)) parts.push(schema.enum.map((v) => `\`${String(v)}\``).join(" \\| "));
  else if (schema.anyOf) parts.push("any of");
  else if (typeof schema.type === "string") parts.push(String(schema.type));
  else if (schema.$ref) parts.push(`[${String(schema.$ref).split("/").pop()}](#model-${String(schema.$ref).split("/").pop()})`);
  else parts.push("object");
  if (typeof schema.format === "string") parts.push(`(${schema.format})`);
  if (schema.minimum !== undefined || schema.maximum !== undefined) {
    parts.push(`${schema.minimum ?? "-∞"}…${schema.maximum ?? "∞"}`);
  }
  return parts.join(" ");
}

function parameterRow(param: ApiParameter, schema: JsonSchema): string {
  const def = "default" in schema ? `\`${JSON.stringify(schema.default)}\`` : "—";
  const type = typeOf(schema);
  return `| \`${param.name}\` | ${param.in} | ${type} | ${param.required ? "yes" : "no"} | ${def} | ${param.description} |`;
}

function responseRow(response: ApiResponseDoc, document: ApiDocument): string {
  const model = response.model
    ? `[${response.model}](#model-${response.model})`
    : response.schema
      ? "*inline, below*"
      : "—";
  const example = response.example !== undefined ? ` \`${JSON.stringify(response.example)}\`` : "";
  const code = response.errorCode ? ` \`${response.errorCode}\`` : "";
  void document;
  return `| ${response.status} | ${model} | ${response.description}${code}${example} |`;
}

function curlFor(endpoint: ApiEndpoint): string {
  const query = endpoint.parameters.filter((p) => p.in === "query");
  const url =
    query.length > 0
      ? `"${BASE_URL}${endpoint.path}?${query.map((p) => `${p.name}=<${p.name}>`).join("&")}"`
      : `"${BASE_URL}${endpoint.path}"`;
  const lines = [
    `curl ${endpoint.method === "get" ? "" : `-X ${endpoint.method.toUpperCase()} `}${url}`.trimEnd(),
  ];
  if (endpoint.auth === "session") lines.push('  -H "Cookie: ggrun_session=<session token>"');
  if (endpoint.auth === "cron") lines.push('  -H "Authorization: Bearer $CRON_SECRET"');
  if (endpoint.requestBody) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  -d '${JSON.stringify(endpoint.requestBody.example ?? {})}'`);
  }
  return lines.join(" \\\n");
}

function endpointSection(endpoint: ApiEndpoint, document: ApiDocument): string[] {
  const lines: string[] = [];
  const auth =
    endpoint.auth === "public"
      ? "public (no credentials)"
      : endpoint.auth === "session"
        ? "`sessionCookie` — the `ggrun_session` cookie"
        : "`cronBearer` — `Authorization: Bearer $CRON_SECRET`";

  lines.push(`### \`${endpoint.method.toUpperCase()} ${endpoint.path}\` — ${endpoint.summary}`);
  lines.push("");
  lines.push(endpoint.description);
  lines.push("");
  lines.push(`**Auth:** ${auth} · **operationId:** \`${endpoint.operationId}\` · **tag:** ${endpoint.tag}`);
  lines.push("");
  lines.push("```bash");
  lines.push(curlFor(endpoint));
  lines.push("```");
  lines.push("");

  if (endpoint.parameters.length > 0) {
    lines.push("**Parameters**");
    lines.push("");
    lines.push("| Name | In | Type | Required | Default | Notes |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const param of endpoint.parameters) {
      const schema = (document.paths[endpoint.path]?.[endpoint.method] as { parameters: { name: string; schema: JsonSchema }[] })
        ?.parameters?.find((p) => p.name === param.name)?.schema ?? {};
      lines.push(parameterRow(param, schema));
    }
    lines.push("");
  }

  if (endpoint.requestBody) {
    const model = document.components.schemas[endpoint.requestBody.model];
    lines.push(
      `**Request body** — \`${endpoint.requestBody.model}\`${endpoint.requestBody.required ? " (required)" : " (optional)"}. ${endpoint.requestBody.description}`,
    );
    lines.push("");
    if (endpoint.requestBody.example !== undefined) {
      lines.push("Example:");
      lines.push("");
      lines.push(json(endpoint.requestBody.example));
      lines.push("");
    }
    if (model) {
      lines.push("Schema:");
      lines.push("");
      lines.push(json(model));
      lines.push("");
    }
  }

  lines.push("**Responses**");
  lines.push("");
  lines.push("| Status | Body | Description |");
  lines.push("| --- | --- | --- |");
  for (const response of endpoint.responses) lines.push(responseRow(response, document));
  lines.push("");
  for (const response of endpoint.responses) {
    if (!response.schema) continue;
    lines.push(`**${response.status} body** (\`${response.contentType ?? "application/json"}\`):`);
    lines.push("");
    lines.push(json(response.schema));
    lines.push("");
  }
  return lines;
}

function realtimeSection(document: ApiDocument): string[] {
  const rt = document["x-realtime"];
  const lines: string[] = [];

  lines.push("## Realtime (Socket.IO)");
  lines.push("");
  lines.push(
    "The live channel is not part of OpenAPI — it lives in the `x-realtime` extension of the JSON spec and in full here.",
  );
  lines.push("");
  lines.push(`- **Engine:** ${rt.engine}`);
  lines.push(`- **Path:** \`${rt.path}\` (default Socket.IO path) · **Transports:** ${rt.transports.join(", ")}`);
  lines.push(`- **Auth:** ${rt.auth}`);
  for (const limit of rt.limits) lines.push(`- ${limit}`);
  lines.push(`- **Sequencing:** ${rt.sequencing}`);
  lines.push("");

  lines.push("### Rooms");
  lines.push("");
  lines.push("| Room | Visibility | Presence | Events | Notes |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const room of rt.rooms) {
    lines.push(
      `| \`${room.name}\` | ${room.kind} | ${room.presence ? "yes" : "no"} | ${room.events.map((e) => `\`${e}\``).join(", ")} | ${room.summary} |`,
    );
  }
  lines.push("");
  lines.push(
    `Join policy errors: ${Object.entries(rt.joinErrors).map(([code, text]) => `\`${code}\` (${text})`).join(" · ")}.`,
  );
  lines.push("");

  lines.push("### Client → server");
  lines.push("");
  lines.push("| Event | Ack | Errors | Notes |");
  lines.push("| --- | --- | --- | --- |");
  for (const doc of Object.values(rt.clientEvents)) {
    lines.push(
      `| \`${doc.signature}\` | ${doc.ack ? "see below" : "none"} | ${doc.errors.length > 0 ? doc.errors.map((e) => `\`${e}\``).join(", ") : "—"} | ${doc.summary}${doc.notes ? ` ${doc.notes}` : ""} |`,
    );
  }
  lines.push("");
  for (const [name, doc] of Object.entries(rt.clientEvents)) {
    if (!doc.ack) continue;
    lines.push(`\`${name}\` ack:`);
    lines.push("");
    lines.push(json(doc.ack));
    lines.push("");
  }
  lines.push(
    `The browser provider also synthesizes client-side ack failures without a round trip: ${rt.clientAckFallbacks.map((c) => `\`${c}\``).join(", ")}.`,
  );
  lines.push("");

  lines.push("### Server → client");
  lines.push("");
  for (const [name, doc] of Object.entries(rt.serverEvents)) {
    lines.push(`#### \`${name}\``);
    lines.push("");
    lines.push(`${doc.summary}`);
    lines.push("");
    lines.push(`Rooms: ${doc.rooms.map((r) => `\`${r}\``).join(", ")}`);
    lines.push("");
    lines.push(json(doc.payload));
    lines.push("");
  }

  return lines;
}

function authSection(): string[] {
  return [
    "## Authentication",
    "",
    "| Scheme | Where | How |",
    "| --- | --- | --- |",
    "| `sessionCookie` | `ggrun_session` cookie | Set by the login flow (scrypt password hashes, `sessions` table). httpOnly, SameSite=Lax, 30-day lifetime, revoked by logout. Blocked users resolve to anonymous. |",
    "| `cronBearer` | `Authorization: Bearer <CRON_SECRET>` | Shared secret for the scheduler-driven bot ticker only, compared in constant time. Unset server-side → every call is `503 CRON_NOT_CONFIGURED`. |",
    "",
    "Server actions (Next.js RPC over the page URL) are internal to the web UI and are not part of this API.",
    "",
  ];
}

function errorCodesSection(): string[] {
  const lines = ["## Error codes", "", "Every failure returns `{ \"error\": \"CODE\" }`. The full literal set:", ""];
  lines.push("| Code | Status | Endpoint | Meaning |");
  lines.push("| --- | --- | --- | --- |");
  for (const endpoint of API_ENDPOINTS) {
    for (const response of endpoint.responses) {
      if (!response.errorCode) continue;
      lines.push(
        `| \`${response.errorCode}\` | ${response.status} | \`${endpoint.method.toUpperCase()} ${endpoint.path}\` | ${response.description} |`,
      );
    }
  }
  lines.push("");
  lines.push(
    "The bot ticker also surfaces any `BotError` code as a 422 body `{ \"error\": \"botRunNotFound\" }` and the like.",
  );
  lines.push("");
  return lines;
}

function modelsSection(document: ApiDocument): string[] {
  const lines = ["## Models", ""];
  for (const [name, schema] of Object.entries(document.components.schemas)) {
    lines.push(`### <a id="model-${name}"></a>\`${name}\``);
    lines.push("");
    lines.push(json(schema));
    lines.push("");
  }
  return lines;
}

/** Renders the whole reference as markdown. Pure — used by `pnpm api:doc` and the markdown route. */
export function renderApiMarkdown(document: ApiDocument = apiDocument()): string {
  const lines: string[] = [];

  lines.push("# GGRun API");
  lines.push("");
  lines.push(BANNER);
  lines.push("");
  lines.push(document.info.summary);
  lines.push("");
  lines.push(`- **Version:** ${document.info.version} · **Spec:** [\`/api/openapi.json\`](/api/openapi.json) (OpenAPI ${document.openapi})`);
  lines.push(`- **Rendered reference:** [\`/api-docs\`](/api-docs) · **This page:** \`/api/openapi.md\``);
  lines.push(`- **Base URL:** the origin serving this page (\`${BASE_URL}\` in development) — every path below is relative`);
  lines.push("");
  lines.push(document.info.description);
  lines.push("");
  lines.push(`Realtime transport constants above are pinned to \`lib/realtime/socket-server.ts\`; ${REALTIME_TRANSPORT.limits.length} hard limits apply to every socket.`);
  lines.push("");

  lines.push("## Endpoints");
  lines.push("");
  lines.push("| Method | Path | Auth | Summary |");
  lines.push("| --- | --- | --- | --- |");
  for (const endpoint of API_ENDPOINTS) {
    lines.push(
      `| \`${endpoint.method.toUpperCase()}\` | \`${endpoint.path}\` | ${endpoint.auth} | ${endpoint.summary} |`,
    );
  }
  lines.push("");

  lines.push(...authSection());
  lines.push(...errorCodesSection());

  for (const endpoint of API_ENDPOINTS) lines.push(...endpointSection(endpoint, document));

  lines.push(...realtimeSection(document));
  lines.push(...modelsSection(document));

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
