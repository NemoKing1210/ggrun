import { z } from "zod";

import { FEED_FILTERS } from "@/lib/engine/feed/filters";

/**
 * The HTTP half of the API reference: every `app/api/**` route handler
 * described once, as data.
 *
 * These Zod schemas are the doc-side contract, not runtime validators — the
 * route handlers keep their own hand-written guards, because their exact
 * status codes and error strings are observable behaviour and rewriting them
 * for docs' sake would risk changing it. Drift is prevented by
 * `lib/api/spec.test.ts`, which reads the route sources and fails when a
 * documented endpoint, method or error code and the code disagree (in both
 * directions), so the two cannot silently diverge.
 *
 * Response schemas are converted in `io: "output"` mode, request bodies in
 * `io: "input"` mode — a body that is accepted with extra fields must not be
 * documented as `additionalProperties: false`.
 */

const iso = z.iso.datetime();

// --- named models (become components.schemas) ---------------------------------

export const ErrorEnvelope = z
  .object({
    error: z.string().describe("Machine-readable error code — the literal strings listed per status code"),
  })
  .meta({ id: "ErrorEnvelope", description: "Every error response has this shape." });

export const ChatMessage = z
  .object({
    id: z.string(),
    userId: z.string(),
    content: z.string(),
    createdAt: iso,
    username: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    role: z.string().describe("admin | judge | player"),
  })
  .meta({ id: "ChatMessage", description: "A chat message joined with its author's public profile." });

export const ChatHistory = z
  .object({
    messages: z.array(ChatMessage).describe("Oldest → newest (the query reads newest-first, then reverses)"),
    hasMore: z.boolean(),
    nextBefore: iso.nullable().describe("Pass as `before` to fetch the previous page; null when the history ends"),
  })
  .meta({ id: "ChatHistory" });

export const ChatMessageCreated = z
  .object({ message: ChatMessage })
  .meta({ id: "ChatMessageCreated" });

export const FeedRow = z
  .object({
    id: z.uuid(),
    seasonId: z.uuid(),
    seasonPlayerId: z.uuid().nullable(),
    eventType: z.string().describe("game_rolled, game_passed, moved, item_used, …"),
    payload: z.record(z.string(), z.unknown()),
    createdAt: iso,
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    lastSeenAt: iso.nullable(),
  })
  .meta({ id: "FeedRow", description: "One `event_log` row with the acting player's public profile." });

export const FeedList = z
  .object({ rows: z.array(FeedRow) })
  .meta({ id: "FeedList" });

export const NotificationItem = z
  .object({
    id: z.string(),
    userId: z.string(),
    kind: z.string(),
    titleKey: z.string().describe("i18n key — the client renders the text"),
    bodyKey: z.string(),
    params: z.record(z.string(), z.unknown()).describe("Interpolation values for the title/body templates"),
    severity: z.string(),
    icon: z.string().nullable(),
    imageUrl: z.string().nullable(),
    href: z.string().nullable(),
    actions: z.array(
      z.object({
        id: z.string(),
        labelKey: z.string(),
        href: z.string().optional(),
        style: z.string().optional(),
      }),
    ),
    data: z.record(z.string(), z.unknown()),
    dedupeKey: z.string().nullable(),
    readAt: iso.nullable(),
    createdAt: iso,
  })
  .meta({ id: "NotificationItem" });

export const NotificationList = z
  .object({
    items: z.array(NotificationItem),
    unread: z.number().int().describe("Unread count over the whole inbox, not just `items`"),
  })
  .meta({ id: "NotificationList" });

export const BotTickSummary = z
  .object({
    actions: z.number().int(),
    errors: z.number().int(),
    stopped: z.boolean().describe("The run halted itself during this tick (stopOnError)"),
    lastError: z.string().nullable(),
  })
  .meta({ id: "BotTickSummary" });

export const DueTickResult = z
  .object({
    runId: z.uuid(),
    ticked: z.boolean(),
    reason: z
      .string()
      .optional()
      .describe("Why the run was skipped: not-due | inflight | locked | no-longer-running"),
    summary: BotTickSummary.optional(),
  })
  .meta({ id: "DueTickResult" });

export const BotTickReport = z
  .object({
    runs: z.array(DueTickResult).describe("One entry per running run considered by this call"),
  })
  .meta({ id: "BotTickReport" });

export const ChatSendRequest = z
  .object({
    content: z.string().min(1).max(1000).describe("Message text; trimmed, so whitespace-only is rejected"),
  })
  .meta({ id: "ChatSendRequest" });

export const BotTickRequest = z
  .object({
    runId: z.string().optional().describe("Tick exactly this run immediately, ignoring its cadence"),
    force: z.boolean().optional().describe("Tick every running run, ignoring their cadence"),
  })
  .meta({ id: "BotTickRequest", description: "Optional — an empty body ticks the runs that came due." });

/**
 * Every named model referenced by a response or request body, keyed by its
 * component name. `spec.test.ts` asserts both directions: every entry is used
 * by an endpoint, and every `model:` an endpoint names exists here.
 */
export const API_MODELS = {
  ErrorEnvelope,
  ChatMessage,
  ChatHistory,
  ChatMessageCreated,
  FeedRow,
  FeedList,
  NotificationItem,
  NotificationList,
  BotTickSummary,
  DueTickResult,
  BotTickReport,
  ChatSendRequest,
  BotTickRequest,
} as const satisfies Record<string, z.ZodType>;

export type ApiModelName = keyof typeof API_MODELS;

// --- endpoint descriptions ----------------------------------------------------

export type ApiAuth = "public" | "session" | "cron";

/** A JSON Schema fragment, for bodies that are not one of the named models. */
export type JsonSchema = Record<string, unknown>;

export interface ApiParameter {
  name: string;
  in: "query" | "header";
  required: boolean;
  schema: z.ZodType;
  description: string;
}

export interface ApiResponseDoc {
  status: number;
  description: string;
  /** Component name of the body model, e.g. `FeedList`. Errors use `ErrorEnvelope`. */
  model?: ApiModelName;
  /**
   * JSON Schema for a body that is not a model — the document's own endpoints
   * (the spec, the markdown, the rendered reference).
   */
  schema?: JsonSchema;
  /** Media type of the body. Defaults to `application/json`. */
  contentType?: string;
  /** Literal `error` string this branch returns — checked against the route source. */
  errorCode?: string;
  example?: unknown;
}

export interface ApiRequestBodyDoc {
  model: ApiModelName;
  required: boolean;
  description: string;
  example?: unknown;
}

export interface ApiEndpoint {
  method: "get" | "post";
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description: string;
  auth: ApiAuth;
  parameters: readonly ApiParameter[];
  requestBody?: ApiRequestBodyDoc;
  responses: readonly ApiResponseDoc[];
}

const error = (status: number, errorCode: string, description: string): ApiResponseDoc => ({
  status,
  errorCode,
  description,
  model: "ErrorEnvelope",
  example: { error: errorCode },
});

export const API_ENDPOINTS: readonly ApiEndpoint[] = [
  {
    method: "get",
    path: "/api/feed",
    operationId: "getFeed",
    tag: "Feed",
    summary: "Season event feed",
    description:
      "Public event log of one season — the same table and the same filter matcher the server-rendered feed page uses, so the explorer and the page can never disagree. Rows come newest-first, with dates as ISO strings.",
    auth: "public",
    parameters: [
      {
        name: "seasonId",
        in: "query",
        required: true,
        schema: z.uuid(),
        description: "Season to read. Missing → `MISSING_SEASON`.",
      },
      {
        name: "filter",
        in: "query",
        required: false,
        schema: z.enum(FEED_FILTERS).default("all"),
        description: "Feed tab. `all` is the absence of a filter; every other key matches exactly its own event types.",
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: z.number().int().min(1).max(100).default(80),
        description: "Rows to return. Values outside 1–100 are clamped.",
      },
    ],
    responses: [
      {
        status: 200,
        description: "Newest-first event rows, already filtered.",
        model: "FeedList",
        example: { rows: [{ id: "…", eventType: "moved", payload: { from: 3, to: 8 }, username: "player_one" }] },
      },
      error(400, "MISSING_SEASON", "No `seasonId` query parameter."),
      error(400, "INVALID_FILTER", "`filter` is not one of the known tab keys."),
      error(500, "FAILED", "Database or serialization failure."),
    ],
  },
  {
    method: "get",
    path: "/api/chat",
    operationId: "getChatHistory",
    tag: "Chat",
    summary: "Chat history page",
    description:
      "One page of global chat, oldest → newest. Paging: while `hasMore` is true, pass the returned `nextBefore` as `before` to walk backwards. An unparsable `before` is ignored rather than rejected.",
    auth: "public",
    parameters: [
      {
        name: "limit",
        in: "query",
        required: false,
        schema: z.number().int().min(1).max(100).default(30),
        description: "Messages per page. Values outside 1–100 are clamped.",
      },
      {
        name: "before",
        in: "query",
        required: false,
        schema: iso,
        description: "ISO timestamp — return messages strictly older than it.",
      },
    ],
    responses: [
      {
        status: 200,
        description: "A page of history with its paging cursor.",
        model: "ChatHistory",
        example: { messages: [{ id: "…", content: "gl hf", username: "player_one" }], hasMore: false, nextBefore: null },
      },
      error(500, "FAILED", "Database failure."),
    ],
  },
  {
    method: "post",
    path: "/api/chat",
    operationId: "sendChatMessage",
    tag: "Chat",
    summary: "Send a chat message",
    description:
      "Stores one message and mirrors it live into the `chat` room as `chat:message` (fire-and-forget: the 201 stands even if realtime is down). Rate limit: 8 messages per rolling 30 s per user.",
    auth: "session",
    parameters: [],
    requestBody: {
      model: "ChatSendRequest",
      required: true,
      description: "JSON body. A body that is not valid JSON is rejected as `INVALID_JSON` (not as `EMPTY_CONTENT`).",
      example: { content: "gl hf" },
    },
    responses: [
      { status: 201, description: "Message stored.", model: "ChatMessageCreated" },
      error(400, "INVALID_JSON", "Body is not valid JSON."),
      error(400, "EMPTY_CONTENT", "`content` is missing, empty, or whitespace-only."),
      error(400, "CONTENT_TOO_LONG", "`content` is longer than 1000 characters."),
      error(401, "UNAUTHORIZED", "No valid session cookie."),
      error(403, "BLOCKED", "The authenticated user is blocked."),
      error(429, "RATE_LIMITED", "More than 8 messages in the last 30 s."),
      error(500, "FAILED", "Database failure."),
    ],
  },
  {
    method: "get",
    path: "/api/notifications",
    operationId: "getNotifications",
    tag: "Notifications",
    summary: "Inbox snapshot",
    description:
      "The calling user's inbox — the same source as the server-rendered notifications page, serialized for the live hook. Always the 50 newest notifications; the route reads no query parameters. Owner-only by session.",
    auth: "session",
    parameters: [],
    responses: [
      {
        status: 200,
        description: "Newest-first notifications plus the whole-inbox unread count.",
        model: "NotificationList",
      },
      error(401, "UNAUTHORIZED", "No valid session cookie."),
      error(500, "FAILED", "Database failure."),
    ],
  },
  {
    method: "post",
    path: "/api/bots/tick",
    operationId: "tickBotRuns",
    tag: "Bots",
    summary: "Drive the autonomous bot ticker",
    description:
      "Ticks every `running` bot run whose own cadence came due — no admin page has to be open. Called by an external scheduler (systemd timer, k8s CronJob, Vercel Cron, Docker sidecar `curl`). Console start/pause/stop keeps working: it flips the same `status` column this route reads. Overlap between concurrent callers is refused per run (in-process guard + Postgres advisory lock) and reported as `ticked: false`.",
    auth: "cron",
    parameters: [],
    requestBody: {
      model: "BotTickRequest",
      required: false,
      description: "Optional JSON body. A body that is not valid JSON is treated as `{}`.",
      example: { force: true },
    },
    responses: [
      {
        status: 200,
        description:
          "Per-run outcome. With a `runId` in the body the array holds exactly one entry and `ticked` is true.",
        model: "BotTickReport",
        example: { runs: [{ runId: "…", ticked: true, summary: { actions: 3, errors: 0, stopped: false, lastError: null } }] },
      },
      error(401, "UNAUTHORIZED", "Missing or wrong `Authorization: Bearer <CRON_SECRET>`."),
      {
        status: 422,
        description:
          "The run cannot be ticked: `botRunNotFound` | `botRunStopped` | `botSeasonNotActive` (other `BotError` codes surface the same way).",
        model: "ErrorEnvelope",
        example: { error: "botRunStopped" },
      },
      error(500, "FAILED", "Unexpected failure."),
      error(503, "CRON_NOT_CONFIGURED", "`CRON_SECRET` is not set on the server."),
    ],
  },
  {
    method: "get",
    path: "/api/openapi.json",
    operationId: "getOpenApiDocument",
    tag: "Meta",
    summary: "This OpenAPI document",
    description:
      "The API contract as OpenAPI 3.1 (JSON Schema 2020-12), generated from `lib/api/` at build time. No session, no parameters — hand it to any tool that reads OpenAPI, or to a model as structured context.",
    auth: "public",
    parameters: [],
    responses: [
      {
        status: 200,
        description: "The whole document, including the `x-realtime` extension.",
        contentType: "application/json",
        schema: {
          type: "object",
          required: ["openapi", "info", "paths", "components"],
          properties: {
            openapi: { type: "string", const: "3.1.0" },
            info: { type: "object" },
            paths: { type: "object", additionalProperties: { type: "object" } },
            components: { type: "object" },
            "x-realtime": { type: "object", description: "Socket.IO rooms, events and payload schemas" },
          },
        },
      },
    ],
  },
  {
    method: "get",
    path: "/api/openapi.md",
    operationId: "getOpenApiMarkdown",
    tag: "Meta",
    summary: "This API as one markdown page",
    description:
      "The same contract for readers that are not OpenAPI-aware: every endpoint, parameter, response, literal error code and realtime event in a single markdown document — byte-identical to `docs/API.md` in the repository. This is the page to paste into an agent's context.",
    auth: "public",
    parameters: [],
    responses: [
      {
        status: 200,
        description: "Markdown of the whole reference, generated from the same source as the JSON spec.",
        contentType: "text/markdown",
        schema: { type: "string" },
      },
    ],
  },
  {
    method: "get",
    path: "/api-docs",
    operationId: "getApiReferenceUi",
    tag: "Meta",
    summary: "Rendered API reference",
    description:
      "Interactive reference over `/api/openapi.json` (Scalar, loaded from a pinned CDN version). Rendered HTML with no session and no database access; if the CDN is unreachable the page falls back to links to the raw spec and the markdown.",
    auth: "public",
    parameters: [],
    responses: [
      {
        status: 200,
        description: "A self-contained HTML page that loads the document client-side.",
        contentType: "text/html",
        schema: { type: "string" },
      },
    ],
  },
] as const;

/** Endpoint-specific `error` literals that must appear in the route source. */
export function documentedErrorCodes(): Map<string, string[]> {
  const byPath = new Map<string, string[]>();
  for (const e of API_ENDPOINTS) {
    byPath.set(
      `${e.path} ${e.method.toUpperCase()}`,
      e.responses.map((r) => r.errorCode).filter((c): c is string => !!c),
    );
  }
  return byPath;
}
