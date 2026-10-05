# GGRun API

> **Generated file — do not edit.** `pnpm api:doc` rebuilds it from `lib/api/`
> (`contract.ts` for HTTP, `realtime.ts` for Socket.IO). Change the source, not this file.

Every HTTP endpoint and the Socket.IO protocol of GGRun.

- **Version:** 0.5.0 · **Spec:** [`/api/openapi.json`](/api/openapi.json) (OpenAPI 3.1.0)
- **Rendered reference:** [`/api-docs`](/api-docs) · **This page:** `/api/openapi.md`
- **Base URL:** the origin serving this page (`http://localhost:3000` in development) — every path below is relative

Machine-readable contract of the GGRun platform, generated from the source of truth in
`lib/api/` and verified against the route handlers by `lib/api/spec.test.ts`.

**HTTP.** Five route handlers under `app/api/**`; everything else the app does happens in
server actions (Next.js RPC over the page URL), which are internal to the web UI and
deliberately not part of this API.

**Auth.** `sessionCookie` is the `ggrun_session` cookie — httpOnly, SameSite=Lax, 30-day
lifetime, set by `/login` (scrypt password hashes, sessions table). `cronBearer` is a
shared secret for the scheduler-driven bot ticker only.

**Errors.** `{ "error": "CODE" }` with the exact literal codes documented per response —
domain code strings, not prose, so clients can branch on them.

**Realtime.** Socket.IO on the same origin and port as the app (default path `/socket.io/`,
session cookie on the handshake, anonymous sockets welcome in public rooms). OpenAPI has no
vocabulary for a socket protocol, so it lives in the `x-realtime` extension of the JSON
document: transport facts and limits, the five rooms (`chat`, `season:<seasonId>`, `audit`,
`bots:<seasonId>`, `user:<userId>`), the ten server events with their payload schemas, and the
three client events. `GET /api/openapi.md` — checked in as `docs/API.md` — renders all of it
inline on one page, for readers that do not parse OpenAPI.

Realtime transport constants above are pinned to `lib/realtime/socket-server.ts`; 5 hard limits apply to every socket.

## Endpoints

| Method | Path | Auth | Summary |
| --- | --- | --- | --- |
| `GET` | `/api/feed` | public | Season event feed |
| `GET` | `/api/files` | public | Download an uploaded file |
| `GET` | `/api/chat` | public | Chat history page |
| `POST` | `/api/chat` | session | Send a chat message |
| `GET` | `/api/notifications` | session | Inbox snapshot |
| `POST` | `/api/bots/tick` | cron | Drive the autonomous bot ticker |
| `GET` | `/api/openapi.json` | public | This OpenAPI document |
| `GET` | `/api/openapi.md` | public | This API as one markdown page |
| `GET` | `/api-docs` | public | Rendered API reference |

## Authentication

| Scheme | Where | How |
| --- | --- | --- |
| `sessionCookie` | `ggrun_session` cookie | Set by the login flow (scrypt password hashes, `sessions` table). httpOnly, SameSite=Lax, 30-day lifetime, revoked by logout. Blocked users resolve to anonymous. |
| `cronBearer` | `Authorization: Bearer <CRON_SECRET>` | Shared secret for the scheduler-driven bot ticker only, compared in constant time. Unset server-side → every call is `503 CRON_NOT_CONFIGURED`. |

Server actions (Next.js RPC over the page URL) are internal to the web UI and are not part of this API.

## Error codes

Every failure returns `{ "error": "CODE" }`. The full literal set:

| Code | Status | Endpoint | Meaning |
| --- | --- | --- | --- |
| `MISSING_SEASON` | 400 | `GET /api/feed` | No `seasonId` query parameter. |
| `INVALID_FILTER` | 400 | `GET /api/feed` | `filter` is not one of the known tab keys. |
| `FAILED` | 500 | `GET /api/feed` | Database or serialization failure. |
| `MISSING_KEY` | 400 | `GET /api/files` | No `key`, or it is not a well-formed storage key. |
| `FORBIDDEN` | 403 | `GET /api/files` | Private file, no valid link, and no owner/staff session. |
| `NOT_FOUND` | 404 | `GET /api/files` | No live row for the key, or the object is missing from the backend. |
| `FAILED` | 500 | `GET /api/files` | Storage or database failure. |
| `FAILED` | 500 | `GET /api/chat` | Database failure. |
| `INVALID_JSON` | 400 | `POST /api/chat` | Body is not valid JSON. |
| `EMPTY_CONTENT` | 400 | `POST /api/chat` | `content` is missing, empty, or whitespace-only. |
| `CONTENT_TOO_LONG` | 400 | `POST /api/chat` | `content` is longer than 1000 characters. |
| `UNAUTHORIZED` | 401 | `POST /api/chat` | No valid session cookie. |
| `BLOCKED` | 403 | `POST /api/chat` | The authenticated user is blocked. |
| `RATE_LIMITED` | 429 | `POST /api/chat` | More than 8 messages in the last 30 s. |
| `FAILED` | 500 | `POST /api/chat` | Database failure. |
| `UNAUTHORIZED` | 401 | `GET /api/notifications` | No valid session cookie. |
| `FAILED` | 500 | `GET /api/notifications` | Database failure. |
| `UNAUTHORIZED` | 401 | `POST /api/bots/tick` | Missing or wrong `Authorization: Bearer <CRON_SECRET>`. |
| `FAILED` | 500 | `POST /api/bots/tick` | Unexpected failure. |
| `CRON_NOT_CONFIGURED` | 503 | `POST /api/bots/tick` | `CRON_SECRET` is not set on the server. |

The bot ticker also surfaces any `BotError` code as a 422 body `{ "error": "botRunNotFound" }` and the like.

### `GET /api/feed` — Season event feed

Public event log of one season — the same table and the same filter matcher the server-rendered feed page uses, so the explorer and the page can never disagree. Rows come newest-first, with dates as ISO strings.

**Auth:** public (no credentials) · **operationId:** `getFeed` · **tag:** Feed

```bash
curl "http://localhost:3000/api/feed?seasonId=<seasonId>&filter=<filter>&limit=<limit>"
```

**Parameters**

| Name | In | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `seasonId` | query | string (uuid) | yes | — | Season to read. Missing → `MISSING_SEASON`. |
| `filter` | query | `all` \| `rolled` \| `passed` \| `dropped` \| `moved` \| `iee` \| `challenges` \| `joined` \| `system` | no | `"all"` | Feed tab. `all` is the absence of a filter; every other key matches exactly its own event types. |
| `limit` | query | integer 1…100 | no | `80` | Rows to return. Values outside 1–100 are clamped. |

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | [FeedList](#model-FeedList) | Newest-first event rows, already filtered. `{"rows":[{"id":"…","eventType":"moved","payload":{"from":3,"to":8},"username":"player_one"}]}` |
| 400 | [ErrorEnvelope](#model-ErrorEnvelope) | No `seasonId` query parameter. `MISSING_SEASON` `{"error":"MISSING_SEASON"}` |
| 400 | [ErrorEnvelope](#model-ErrorEnvelope) | `filter` is not one of the known tab keys. `INVALID_FILTER` `{"error":"INVALID_FILTER"}` |
| 500 | [ErrorEnvelope](#model-ErrorEnvelope) | Database or serialization failure. `FAILED` `{"error":"FAILED"}` |

### `GET /api/files` — Download an uploaded file

Serves the bytes of one stored file. Public files (avatars, banners, game covers) are world-readable and cached immutably; private files need either a signed link or the owner/staff session. When a public base URL is configured the request answers with a 302 to the direct object URL instead of streaming. Without one, every kind of object is served here.

**Auth:** public (no credentials) · **operationId:** `getFile` · **tag:** Files

```bash
curl "http://localhost:3000/api/files?key=<key>&exp=<exp>&sig=<sig>"
```

**Parameters**

| Name | In | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `key` | query | string | yes | — | Storage key, e.g. `avatar/2026/10/<uuid>.jpg`. Missing or malformed → `MISSING_KEY`. |
| `exp` | query | integer -9007199254740991…9007199254740991 | no | — | Link expiry as unix seconds — only meaningful for a private file. |
| `sig` | query | string | no | — | HMAC signature over `key` and `exp` — only meaningful for a private file. |

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | *inline, below* | The stored bytes with the row's MIME type and an immutable cache policy. |
| 302 | — | Redirect to a direct public URL when `STORAGE_PUBLIC_URL` is configured. |
| 400 | [ErrorEnvelope](#model-ErrorEnvelope) | No `key`, or it is not a well-formed storage key. `MISSING_KEY` `{"error":"MISSING_KEY"}` |
| 403 | [ErrorEnvelope](#model-ErrorEnvelope) | Private file, no valid link, and no owner/staff session. `FORBIDDEN` `{"error":"FORBIDDEN"}` |
| 404 | [ErrorEnvelope](#model-ErrorEnvelope) | No live row for the key, or the object is missing from the backend. `NOT_FOUND` `{"error":"NOT_FOUND"}` |
| 500 | [ErrorEnvelope](#model-ErrorEnvelope) | Storage or database failure. `FAILED` `{"error":"FAILED"}` |

**200 body** (`application/octet-stream`):

```json
{
  "type": "string",
  "format": "binary"
}
```

### `GET /api/chat` — Chat history page

One page of global chat, oldest → newest. Paging: while `hasMore` is true, pass the returned `nextBefore` as `before` to walk backwards. An unparsable `before` is ignored rather than rejected.

**Auth:** public (no credentials) · **operationId:** `getChatHistory` · **tag:** Chat

```bash
curl "http://localhost:3000/api/chat?limit=<limit>&before=<before>"
```

**Parameters**

| Name | In | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `limit` | query | integer 1…100 | no | `30` | Messages per page. Values outside 1–100 are clamped. |
| `before` | query | string (date-time) | no | — | ISO timestamp — return messages strictly older than it. |

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | [ChatHistory](#model-ChatHistory) | A page of history with its paging cursor. `{"messages":[{"id":"…","content":"gl hf","username":"player_one"}],"hasMore":false,"nextBefore":null}` |
| 500 | [ErrorEnvelope](#model-ErrorEnvelope) | Database failure. `FAILED` `{"error":"FAILED"}` |

### `POST /api/chat` — Send a chat message

Stores one message and mirrors it live into the `chat` room as `chat:message` (fire-and-forget: the 201 stands even if realtime is down). Rate limit: 8 messages per rolling 30 s per user.

**Auth:** `sessionCookie` — the `ggrun_session` cookie · **operationId:** `sendChatMessage` · **tag:** Chat

```bash
curl -X POST "http://localhost:3000/api/chat" \
  -H "Cookie: ggrun_session=<session token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"gl hf"}'
```

**Request body** — `ChatSendRequest` (required). JSON body. A body that is not valid JSON is rejected as `INVALID_JSON` (not as `EMPTY_CONTENT`).

Example:

```json
{
  "content": "gl hf"
}
```

Schema:

```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000,
      "description": "Message text; trimmed, so whitespace-only is rejected"
    }
  },
  "required": [
    "content"
  ]
}
```

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 201 | [ChatMessageCreated](#model-ChatMessageCreated) | Message stored. |
| 400 | [ErrorEnvelope](#model-ErrorEnvelope) | Body is not valid JSON. `INVALID_JSON` `{"error":"INVALID_JSON"}` |
| 400 | [ErrorEnvelope](#model-ErrorEnvelope) | `content` is missing, empty, or whitespace-only. `EMPTY_CONTENT` `{"error":"EMPTY_CONTENT"}` |
| 400 | [ErrorEnvelope](#model-ErrorEnvelope) | `content` is longer than 1000 characters. `CONTENT_TOO_LONG` `{"error":"CONTENT_TOO_LONG"}` |
| 401 | [ErrorEnvelope](#model-ErrorEnvelope) | No valid session cookie. `UNAUTHORIZED` `{"error":"UNAUTHORIZED"}` |
| 403 | [ErrorEnvelope](#model-ErrorEnvelope) | The authenticated user is blocked. `BLOCKED` `{"error":"BLOCKED"}` |
| 429 | [ErrorEnvelope](#model-ErrorEnvelope) | More than 8 messages in the last 30 s. `RATE_LIMITED` `{"error":"RATE_LIMITED"}` |
| 500 | [ErrorEnvelope](#model-ErrorEnvelope) | Database failure. `FAILED` `{"error":"FAILED"}` |

### `GET /api/notifications` — Inbox snapshot

The calling user's inbox — the same source as the server-rendered notifications page, serialized for the live hook. Always the 50 newest notifications; the route reads no query parameters. Owner-only by session.

**Auth:** `sessionCookie` — the `ggrun_session` cookie · **operationId:** `getNotifications` · **tag:** Notifications

```bash
curl "http://localhost:3000/api/notifications" \
  -H "Cookie: ggrun_session=<session token>"
```

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | [NotificationList](#model-NotificationList) | Newest-first notifications plus the whole-inbox unread count. |
| 401 | [ErrorEnvelope](#model-ErrorEnvelope) | No valid session cookie. `UNAUTHORIZED` `{"error":"UNAUTHORIZED"}` |
| 500 | [ErrorEnvelope](#model-ErrorEnvelope) | Database failure. `FAILED` `{"error":"FAILED"}` |

### `POST /api/bots/tick` — Drive the autonomous bot ticker

Ticks every `running` bot run whose own cadence came due — no admin page has to be open. Called by an external scheduler (systemd timer, k8s CronJob, Vercel Cron, Docker sidecar `curl`). Console start/pause/stop keeps working: it flips the same `status` column this route reads. Overlap between concurrent callers is refused per run (in-process guard + Postgres advisory lock) and reported as `ticked: false`.

**Auth:** `cronBearer` — `Authorization: Bearer $CRON_SECRET` · **operationId:** `tickBotRuns` · **tag:** Bots

```bash
curl -X POST "http://localhost:3000/api/bots/tick" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"force":true}'
```

**Request body** — `BotTickRequest` (optional). Optional JSON body. A body that is not valid JSON is treated as `{}`.

Example:

```json
{
  "force": true
}
```

Schema:

```json
{
  "type": "object",
  "properties": {
    "runId": {
      "description": "Tick exactly this run immediately, ignoring its cadence",
      "type": "string"
    },
    "force": {
      "description": "Tick every running run, ignoring their cadence",
      "type": "boolean"
    }
  },
  "description": "Optional — an empty body ticks the runs that came due."
}
```

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | [BotTickReport](#model-BotTickReport) | Per-run outcome. With a `runId` in the body the array holds exactly one entry and `ticked` is true. `{"runs":[{"runId":"…","ticked":true,"summary":{"actions":3,"errors":0,"stopped":false,"lastError":null}}]}` |
| 401 | [ErrorEnvelope](#model-ErrorEnvelope) | Missing or wrong `Authorization: Bearer <CRON_SECRET>`. `UNAUTHORIZED` `{"error":"UNAUTHORIZED"}` |
| 422 | [ErrorEnvelope](#model-ErrorEnvelope) | The run cannot be ticked: `botRunNotFound` | `botRunStopped` | `botSeasonNotActive` (other `BotError` codes surface the same way). `{"error":"botRunStopped"}` |
| 500 | [ErrorEnvelope](#model-ErrorEnvelope) | Unexpected failure. `FAILED` `{"error":"FAILED"}` |
| 503 | [ErrorEnvelope](#model-ErrorEnvelope) | `CRON_SECRET` is not set on the server. `CRON_NOT_CONFIGURED` `{"error":"CRON_NOT_CONFIGURED"}` |

### `GET /api/openapi.json` — This OpenAPI document

The API contract as OpenAPI 3.1 (JSON Schema 2020-12), generated from `lib/api/` at build time. No session, no parameters — hand it to any tool that reads OpenAPI, or to a model as structured context.

**Auth:** public (no credentials) · **operationId:** `getOpenApiDocument` · **tag:** Meta

```bash
curl "http://localhost:3000/api/openapi.json"
```

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | *inline, below* | The whole document, including the `x-realtime` extension. |

**200 body** (`application/json`):

```json
{
  "type": "object",
  "required": [
    "openapi",
    "info",
    "paths",
    "components"
  ],
  "properties": {
    "openapi": {
      "type": "string",
      "const": "3.1.0"
    },
    "info": {
      "type": "object"
    },
    "paths": {
      "type": "object",
      "additionalProperties": {
        "type": "object"
      }
    },
    "components": {
      "type": "object"
    },
    "x-realtime": {
      "type": "object",
      "description": "Socket.IO rooms, events and payload schemas"
    }
  }
}
```

### `GET /api/openapi.md` — This API as one markdown page

The same contract for readers that are not OpenAPI-aware: every endpoint, parameter, response, literal error code and realtime event in a single markdown document — byte-identical to `docs/API.md` in the repository. This is the page to paste into an agent's context.

**Auth:** public (no credentials) · **operationId:** `getOpenApiMarkdown` · **tag:** Meta

```bash
curl "http://localhost:3000/api/openapi.md"
```

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | *inline, below* | Markdown of the whole reference, generated from the same source as the JSON spec. |

**200 body** (`text/markdown`):

```json
{
  "type": "string"
}
```

### `GET /api-docs` — Rendered API reference

Interactive reference over `/api/openapi.json` (Scalar, loaded from a pinned CDN version). Rendered HTML with no session and no database access; if the CDN is unreachable the page falls back to links to the raw spec and the markdown.

**Auth:** public (no credentials) · **operationId:** `getApiReferenceUi` · **tag:** Meta

```bash
curl "http://localhost:3000/api-docs"
```

**Responses**

| Status | Body | Description |
| --- | --- | --- |
| 200 | *inline, below* | A self-contained HTML page that loads the document client-side. |

**200 body** (`text/html`):

```json
{
  "type": "string"
}
```

## Realtime (Socket.IO)

The live channel is not part of OpenAPI — it lives in the `x-realtime` extension of the JSON spec and in full here.

- **Engine:** Socket.IO 4 (same origin as the app — one HTTP server, one port)
- **Path:** `/socket.io/` (default Socket.IO path) · **Transports:** websocket, polling
- **Auth:** Handshake cookie `ggrun_session` (sha256 fingerprint, same session table as HTTP). Any failure connects the socket anonymously instead of rejecting it — public rooms still work, privileged joins do not.
- 1 MB max frame (`maxHttpBufferSize`) — oversized frames are rejected before any handler runs
- 25 s ping interval, 20 s ping timeout — dead peers are reaped promptly
- 100 ms-scale recovery: `connectionStateRecovery` resumes a socket that dropped for ≤ 2 min
- ≤ 8 rooms held per socket; ≤ 20 `join` attempts per 10 s sliding window
- 1 `chat:typing` relay per 1.5 s per socket
- **Sequencing:** Every payload published through the in-process bus is stamped with `seq` — a monotonic per-process counter. Gaps tell a resumed client it missed events; there is no `?since=` backfill endpoint, so re-read the REST snapshot (`GET /api/chat`, `GET /api/feed`) instead.

### Rooms

| Room | Visibility | Presence | Events | Notes |
| --- | --- | --- | --- | --- |
| `chat` | public | yes | `chat:message`, `chat:typing`, `presence:update` | Global chat. Anyone may join; only authenticated users may send or type. |
| `season:<seasonId>` | public | yes | `board:event`, `presence:update` | One season's public board/feed events — movement, rolls, items, effects. |
| `audit` | staff | no | `audit:created` | Admin audit log live tail. Staff only (`admin`/`judge`), re-checked against a fresh session on every join. |
| `bots:<seasonId>` | staff | no | `bots:activity`, `bots:log`, `bots:run` | Live test-bot console for one season. Staff only — bots are indistinguishable from real players in public surfaces, so their activity is never published elsewhere. |
| `user:<userId>` | owner | no | `notifications:created`, `notifications:read` | Private inbox of one user (notifications + read state). Owner-only; anonymous sockets and other users get `FORBIDDEN`. |

Join policy errors: `UNKNOWN_ROOM` (Room is not a known room name, is empty, or is longer than 80 characters.) · `FORBIDDEN` (`audit` / `bots:<seasonId>` without the `admin` or `judge` role, or `user:<userId>` not owned by the socket.) · `RATE_LIMITED` (More than 20 `join` attempts within 10 s on one socket.) · `ROOM_LIMIT` (The socket already holds 8 rooms.).

### Client → server

| Event | Ack | Errors | Notes |
| --- | --- | --- | --- |
| `join(room: string, ack: (res) => void)` | see below | `UNKNOWN_ROOM`, `FORBIDDEN`, `RATE_LIMITED`, `ROOM_LIMIT` | Join a room. Rooms held at once: ≤ 8. Ack is called after the room is actually entered. Staff/owner rooms are re-validated against a fresh session lookup on every join, so a revoked cookie or a demotion takes effect at the next join. A DB outage keeps the cached verdict. |
| `leave(room: string)` | none | — | Leave a room. Unknown or malformed room names are silently ignored. |
| `chat:typing()` | none | — | Announce typing in `chat`. The server stamps the identity (the client never sends a name) and throttles to one relay per 1.5 s per socket. Anonymous sockets are dropped. The hint is never echoed to the sender. |

`join` ack:

```json
{
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "ok"
  ],
  "additionalProperties": false,
  "description": "`{ ok: true }` or `{ ok: false, error }`"
}
```

The browser provider also synthesizes client-side ack failures without a round trip: `NO_ACK`, `EMIT_FAILED`, `NO_SOCKET`.

### Server → client

#### `chat:message`

A chat message was stored and is now visible to every member.

Rooms: `chat`

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "userId": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "username": {
      "type": "string"
    },
    "displayName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "avatarUrl": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "role": {
      "type": "string"
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "id",
    "userId",
    "content",
    "createdAt",
    "username",
    "displayName",
    "avatarUrl",
    "role"
  ],
  "additionalProperties": false
}
```

#### `chat:typing`

Ephemeral typing hint. Identity is stamped by the server; sent volatile (dropped under congestion) and never to the sender.

Rooms: `chat`

```json
{
  "type": "object",
  "properties": {
    "userId": {
      "type": "string"
    },
    "username": {
      "type": "string"
    },
    "displayName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "userId",
    "username",
    "displayName"
  ],
  "additionalProperties": false
}
```

#### `audit:created`

A new `admin_audit_log` row, shaped like a staff audit row with dates serialized.

Rooms: `audit`

```json
{
  "type": "object",
  "properties": {
    "entry": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "actorId": {
          "type": "string"
        },
        "actionType": {
          "type": "string"
        },
        "targetType": {
          "type": "string"
        },
        "targetId": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        },
        "payload": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        },
        "createdAt": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        }
      },
      "required": [
        "id",
        "actorId",
        "actionType",
        "targetType",
        "targetId",
        "payload",
        "createdAt"
      ],
      "additionalProperties": false
    },
    "username": {
      "type": "string"
    },
    "avatarUrl": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "lastSeenAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "entry",
    "username",
    "avatarUrl",
    "lastSeenAt"
  ],
  "additionalProperties": false
}
```

#### `board:event`

One public season event (movement, roll outcome, item, effect, milestone…) — the live twin of a row in `GET /api/feed`.

Rooms: `season:<seasonId>`

```json
{
  "type": "object",
  "properties": {
    "seasonId": {
      "type": "string"
    },
    "seasonPlayerId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "eventType": {
      "type": "string"
    },
    "payload": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "username": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "displayName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "avatarUrl": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "seasonId",
    "seasonPlayerId",
    "eventType",
    "payload",
    "createdAt",
    "username",
    "displayName",
    "avatarUrl"
  ],
  "additionalProperties": false
}
```

#### `bots:run`

Live bot-run state (status, counters, config) — published on every tick and lifecycle transition.

Rooms: `bots:<seasonId>`

```json
{
  "type": "object",
  "properties": {
    "runId": {
      "type": "string"
    },
    "seasonId": {
      "type": "string"
    },
    "status": {
      "type": "string"
    },
    "config": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "totalTicks": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "totalActions": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "totalErrors": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "lastError": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "runId",
    "seasonId",
    "status",
    "config",
    "totalTicks",
    "totalActions",
    "totalErrors",
    "lastError",
    "updatedAt"
  ],
  "additionalProperties": false
}
```

#### `bots:activity`

One synthetic player's step, structured (never a rendered sentence) so the console can compose a localized line from the same fields.

Rooms: `bots:<seasonId>`

```json
{
  "type": "object",
  "properties": {
    "runId": {
      "type": "string"
    },
    "seasonId": {
      "type": "string"
    },
    "seasonPlayerId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "username": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "kind": {
      "type": "string",
      "description": "roll | resolve | item | skip | error"
    },
    "outcome": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "passed | dropped | rerolled, for a resolve"
    },
    "itemKey": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "targetUsername": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "position": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "balancePoints": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "detail": {
      "type": "string",
      "description": "Raw English journal line — the debugging trace, shown verbatim"
    },
    "at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "runId",
    "seasonId",
    "seasonPlayerId",
    "username",
    "kind",
    "outcome",
    "itemKey",
    "targetUsername",
    "position",
    "balancePoints",
    "detail",
    "at"
  ],
  "additionalProperties": false
}
```

#### `bots:log`

A new `bot_logs` journal row, date serialized.

Rooms: `bots:<seasonId>`

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "runId": {
      "type": "string"
    },
    "level": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "botUsername": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "message": {
      "type": "string"
    },
    "payload": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "id",
    "runId",
    "level",
    "action",
    "botUsername",
    "message",
    "payload",
    "createdAt"
  ],
  "additionalProperties": false
}
```

#### `notifications:created`

A notification was delivered to one inbox.

Rooms: `user:<userId>`

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "userId": {
      "type": "string"
    },
    "kind": {
      "type": "string"
    },
    "titleKey": {
      "type": "string"
    },
    "bodyKey": {
      "type": "string"
    },
    "params": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "severity": {
      "type": "string"
    },
    "icon": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "imageUrl": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "href": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "labelKey": {
            "type": "string"
          },
          "href": {
            "type": "string"
          },
          "style": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "labelKey"
        ],
        "additionalProperties": false
      }
    },
    "data": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "readAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "unread": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "description": "Unread count after this change — lets badges sync without refetch"
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "id",
    "userId",
    "kind",
    "titleKey",
    "bodyKey",
    "params",
    "severity",
    "icon",
    "imageUrl",
    "href",
    "actions",
    "data",
    "readAt",
    "createdAt",
    "unread"
  ],
  "additionalProperties": false
}
```

#### `notifications:read`

Read-state sync for other tabs of the same user. `id: null` means the whole inbox was marked read.

Rooms: `user:<userId>`

```json
{
  "type": "object",
  "properties": {
    "id": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "readAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "all": {
      "type": "boolean"
    },
    "unread": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "seq": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "id",
    "readAt",
    "all",
    "unread"
  ],
  "additionalProperties": false
}
```

#### `presence:update`

Room headcount hint, pushed after every join/leave/disconnect in a public room. Ephemeral: never persisted, never backfilled.

Rooms: `chat`, `season:<seasonId>`

```json
{
  "type": "object",
  "properties": {
    "room": {
      "type": "string"
    },
    "count": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "room",
    "count"
  ],
  "additionalProperties": false
}
```

## Models

### <a id="model-ChatMessage"></a>`ChatMessage`

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "userId": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "username": {
      "type": "string"
    },
    "displayName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "avatarUrl": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "role": {
      "type": "string",
      "description": "admin | judge | player"
    }
  },
  "required": [
    "id",
    "userId",
    "content",
    "createdAt",
    "username",
    "displayName",
    "avatarUrl",
    "role"
  ],
  "additionalProperties": false,
  "description": "A chat message joined with its author's public profile."
}
```

### <a id="model-FeedRow"></a>`FeedRow`

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "seasonId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "seasonPlayerId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        {
          "type": "null"
        }
      ]
    },
    "eventType": {
      "type": "string",
      "description": "game_rolled, game_passed, moved, item_used, …"
    },
    "payload": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    },
    "username": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "displayName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "avatarUrl": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "lastSeenAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "id",
    "seasonId",
    "seasonPlayerId",
    "eventType",
    "payload",
    "createdAt",
    "username",
    "displayName",
    "avatarUrl",
    "lastSeenAt"
  ],
  "additionalProperties": false,
  "description": "One `event_log` row with the acting player's public profile."
}
```

### <a id="model-NotificationItem"></a>`NotificationItem`

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "userId": {
      "type": "string"
    },
    "kind": {
      "type": "string"
    },
    "titleKey": {
      "type": "string",
      "description": "i18n key — the client renders the text"
    },
    "bodyKey": {
      "type": "string"
    },
    "params": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {},
      "description": "Interpolation values for the title/body templates"
    },
    "severity": {
      "type": "string"
    },
    "icon": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "imageUrl": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "href": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "labelKey": {
            "type": "string"
          },
          "href": {
            "type": "string"
          },
          "style": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "labelKey"
        ],
        "additionalProperties": false
      }
    },
    "data": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "dedupeKey": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "readAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    }
  },
  "required": [
    "id",
    "userId",
    "kind",
    "titleKey",
    "bodyKey",
    "params",
    "severity",
    "icon",
    "imageUrl",
    "href",
    "actions",
    "data",
    "dedupeKey",
    "readAt",
    "createdAt"
  ],
  "additionalProperties": false
}
```

### <a id="model-BotTickSummary"></a>`BotTickSummary`

```json
{
  "type": "object",
  "properties": {
    "actions": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "errors": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "stopped": {
      "type": "boolean",
      "description": "The run halted itself during this tick (stopOnError)"
    },
    "lastError": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "actions",
    "errors",
    "stopped",
    "lastError"
  ],
  "additionalProperties": false
}
```

### <a id="model-DueTickResult"></a>`DueTickResult`

```json
{
  "type": "object",
  "properties": {
    "runId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "ticked": {
      "type": "boolean"
    },
    "reason": {
      "description": "Why the run was skipped: not-due | inflight | locked | no-longer-running",
      "type": "string"
    },
    "summary": {
      "$ref": "#/components/schemas/BotTickSummary"
    }
  },
  "required": [
    "runId",
    "ticked"
  ],
  "additionalProperties": false
}
```

### <a id="model-ErrorEnvelope"></a>`ErrorEnvelope`

```json
{
  "type": "object",
  "properties": {
    "error": {
      "type": "string",
      "description": "Machine-readable error code — the literal strings listed per status code"
    }
  },
  "required": [
    "error"
  ],
  "additionalProperties": false,
  "description": "Every error response has this shape."
}
```

### <a id="model-ChatHistory"></a>`ChatHistory`

```json
{
  "type": "object",
  "properties": {
    "messages": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ChatMessage"
      },
      "description": "Oldest → newest (the query reads newest-first, then reverses)"
    },
    "hasMore": {
      "type": "boolean"
    },
    "nextBefore": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ],
      "description": "Pass as `before` to fetch the previous page; null when the history ends"
    }
  },
  "required": [
    "messages",
    "hasMore",
    "nextBefore"
  ],
  "additionalProperties": false
}
```

### <a id="model-ChatMessageCreated"></a>`ChatMessageCreated`

```json
{
  "type": "object",
  "properties": {
    "message": {
      "$ref": "#/components/schemas/ChatMessage"
    }
  },
  "required": [
    "message"
  ],
  "additionalProperties": false
}
```

### <a id="model-FeedList"></a>`FeedList`

```json
{
  "type": "object",
  "properties": {
    "rows": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/FeedRow"
      }
    }
  },
  "required": [
    "rows"
  ],
  "additionalProperties": false
}
```

### <a id="model-NotificationList"></a>`NotificationList`

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/NotificationItem"
      }
    },
    "unread": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "description": "Unread count over the whole inbox, not just `items`"
    }
  },
  "required": [
    "items",
    "unread"
  ],
  "additionalProperties": false
}
```

### <a id="model-BotTickReport"></a>`BotTickReport`

```json
{
  "type": "object",
  "properties": {
    "runs": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/DueTickResult"
      },
      "description": "One entry per running run considered by this call"
    }
  },
  "required": [
    "runs"
  ],
  "additionalProperties": false
}
```

### <a id="model-ChatSendRequest"></a>`ChatSendRequest`

```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000,
      "description": "Message text; trimmed, so whitespace-only is rejected"
    }
  },
  "required": [
    "content"
  ]
}
```

### <a id="model-BotTickRequest"></a>`BotTickRequest`

```json
{
  "type": "object",
  "properties": {
    "runId": {
      "description": "Tick exactly this run immediately, ignoring its cadence",
      "type": "string"
    },
    "force": {
      "description": "Tick every running run, ignoring their cadence",
      "type": "boolean"
    }
  },
  "description": "Optional — an empty body ticks the runs that came due."
}
```

