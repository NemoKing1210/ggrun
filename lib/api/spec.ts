import { z } from "zod";

import { SESSION_COOKIE } from "@/lib/realtime/access";
import pkg from "@/package.json";

import {
  API_ENDPOINTS,
  API_MODELS,
  type ApiModelName,
  type ApiParameter,
  type JsonSchema,
} from "./contract";
import {
  REALTIME_CLIENT_ACK_FALLBACKS,
  REALTIME_CLIENT_EVENTS,
  REALTIME_EVENTS,
  REALTIME_JOIN_ERRORS,
  REALTIME_ROOMS,
  REALTIME_TRANSPORT,
  type RealtimeClientEventDoc,
  type RealtimeEventDoc,
  type RealtimeRoomKind,
} from "./realtime";

/**
 * The OpenAPI 3.1 document, assembled from `contract.ts` + `realtime.ts`.
 *
 * JSON Schema is produced by Zod itself (`z.toJSONSchema`, Draft 2020-12 —
 * the dialect OpenAPI 3.1 uses), so a schema is written once and rendered
 * both here and in `docs/API.md`. Named models become
 * `components.schemas` with `$ref`s between them; the Socket.IO protocol,
 * which OpenAPI cannot express, is carried in the `x-realtime` extension
 * (`docs/API.md` renders it in full).
 *
 * Consumers: `GET /api/openapi.json` (this document), `GET /api-docs`
 * (Scalar reference over it), `GET /api/openapi.md` and `pnpm api:doc`
 * (the same facts as markdown, for agents and for the repo).
 */

export type { JsonSchema } from "./contract";

export interface ApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary: string;
    description: string;
    license: { name: string; url: string };
  };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes: Record<string, JsonSchema>;
  };
  security: Record<string, string[]>[];
  "x-realtime": RealtimeSection;
  "x-source": { repository: string };
}

export interface RealtimeSection {
  engine: string;
  path: string;
  transports: readonly string[];
  auth: string;
  limits: readonly string[];
  sequencing: string;
  rooms: {
    name: string;
    kind: RealtimeRoomKind;
    presence: boolean;
    summary: string;
    events: string[];
  }[];
  serverEvents: Record<string, { rooms: readonly string[]; summary: string; payload: JsonSchema }>;
  clientEvents: Record<
    string,
    { signature: string; summary: string; ack: JsonSchema | null; errors: readonly string[]; notes?: string }
  >;
  clientAckFallbacks: readonly string[];
  joinErrors: Record<string, string>;
}

/**
 * Component schemas are collected while converting, so a model that is
 * referenced from several places is defined once. A name collision with
 * different content means two models disagree about what it is — that is a
 * bug in the contract, not something to paper over.
 */
class ComponentBag {
  readonly schemas: Record<string, JsonSchema> = {};

  add(name: string, schema: JsonSchema): void {
    const existing = this.schemas[name];
    if (existing && JSON.stringify(existing) !== JSON.stringify(schema)) {
      throw new Error(
        `Two different schemas are registered as component "${name}" — rename one in lib/api/contract.ts.`,
      );
    }
    this.schemas[name] = schema;
  }
}

const REF_PREFIX = "#/$defs/";
const COMPONENT_PREFIX = "#/components/schemas/";

/** `#/$defs/X` (Zod's own pointers) → `#/components/schemas/X` (OpenAPI's). */
function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = key === "$ref" && typeof value === "string" && value.startsWith(REF_PREFIX)
        ? `${COMPONENT_PREFIX}${value.slice(REF_PREFIX.length)}`
        : rewriteRefs(value);
    }
    return out;
  }
  return node;
}

/**
 * Zod → JSON Schema, with nested named schemas hoisted into components and
 * the document-level keys OpenAPI does not want on an inline schema removed.
 * `io: "input"` describes what a client may send (no `additionalProperties`),
 * `io: "output"` what the server guarantees.
 */
function convert(schema: z.ZodType, io: "input" | "output", bag: ComponentBag): JsonSchema {
  const raw = z.toJSONSchema(schema, {
    io,
    target: "draft-2020-12",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  delete raw.$schema;
  delete raw.$id;
  const defs = (raw.$defs ?? {}) as Record<string, JsonSchema>;
  delete raw.$defs;
  for (const [name, def] of Object.entries(defs)) {
    bag.add(name, rewriteRefs(def) as JsonSchema);
  }
  return rewriteRefs(raw) as JsonSchema;
}

function parameterSchema(param: ApiParameter, bag: ComponentBag): JsonSchema {
  return convert(param.schema, "output", bag);
}

function securityFor(auth: "public" | "session" | "cron"): Record<string, string[]>[] {
  if (auth === "session") return [{ sessionCookie: [] }];
  if (auth === "cron") return [{ cronBearer: [] }];
  return [];
}

const TAG_DESCRIPTIONS: Record<string, string> = {
  Feed: "Public season event log — the live log behind the board and feed pages.",
  Chat: "Global chat: history over REST, delivery and typing over Socket.IO.",
  Notifications: "The signed-in user's inbox.",
  Bots: "Autonomous test-bot runs. Machine-driven: authenticated by `CRON_SECRET`, not by a session.",
  Meta: "The reference itself: the OpenAPI document, its markdown twin and the rendered UI.",
};

function infoSummary(): { summary: string; description: string } {
  return {
    summary: "Every HTTP endpoint and the Socket.IO protocol of GGRun.",
    description: [
      "Machine-readable contract of the GGRun platform, generated from the source of truth in",
      "`lib/api/` and verified against the route handlers by `lib/api/spec.test.ts`.",
      "",
      "**HTTP.** Five route handlers under `app/api/**`; everything else the app does happens in",
      "server actions (Next.js RPC over the page URL), which are internal to the web UI and",
      "deliberately not part of this API.",
      "",
      "**Auth.** `sessionCookie` is the `ggrun_session` cookie — httpOnly, SameSite=Lax, 30-day",
      "lifetime, set by `/login` (scrypt password hashes, sessions table). `cronBearer` is a",
      "shared secret for the scheduler-driven bot ticker only.",
      "",
      "**Errors.** `{ \"error\": \"CODE\" }` with the exact literal codes documented per response —",
      "domain code strings, not prose, so clients can branch on them.",
      "",
      "**Realtime.** Socket.IO on the same origin and port as the app (default path `/socket.io/`,",
      "session cookie on the handshake, anonymous sockets welcome in public rooms). OpenAPI has no",
      "vocabulary for a socket protocol, so it lives in the `x-realtime` extension of the JSON",
      "document: transport facts and limits, the five rooms (`chat`, `season:<seasonId>`, `audit`,",
      "`bots:<seasonId>`, `user:<userId>`), the ten server events with their payload schemas, and the",
      "three client events. `GET /api/openapi.md` — checked in as `docs/API.md` — renders all of it",
      "inline on one page, for readers that do not parse OpenAPI.",
    ].join("\n"),
  };
}

function buildRealtimeSection(bag: ComponentBag): RealtimeSection {
  // Re-annotated so `Object.entries` yields one widened value type instead of
  // the per-row union `satisfies` produces (optional fields would vanish).
  const eventDocs: Record<string, RealtimeEventDoc> = REALTIME_EVENTS;
  const clientDocs: Record<string, RealtimeClientEventDoc> = REALTIME_CLIENT_EVENTS;

  const serverEvents: RealtimeSection["serverEvents"] = {};
  for (const [name, doc] of Object.entries(eventDocs)) {
    serverEvents[name] = {
      rooms: doc.rooms,
      summary: doc.summary,
      payload: convert(doc.payload, "output", bag),
    };
  }

  const clientEvents: RealtimeSection["clientEvents"] = {};
  for (const [name, doc] of Object.entries(clientDocs)) {
    clientEvents[name] = {
      signature: doc.signature,
      summary: doc.summary,
      ack: doc.ack ? convert(doc.ack, "output", bag) : null,
      errors: doc.errors,
      notes: doc.notes,
    };
  }

  return {
    engine: REALTIME_TRANSPORT.engine,
    path: REALTIME_TRANSPORT.path,
    transports: REALTIME_TRANSPORT.transports,
    auth: REALTIME_TRANSPORT.auth,
    limits: REALTIME_TRANSPORT.limits,
    sequencing: REALTIME_TRANSPORT.sequencing,
    rooms: REALTIME_ROOMS.map((room) => ({
      ...room,
      events: Object.entries(eventDocs)
        .filter(([, event]) => event.rooms.includes(room.name))
        .map(([name]) => name)
        .sort(),
    })),
    serverEvents,
    clientEvents,
    clientAckFallbacks: REALTIME_CLIENT_ACK_FALLBACKS,
    joinErrors: { ...REALTIME_JOIN_ERRORS },
  };
}

/** Builds the document. Pure — same input, byte-identical output. */
export function buildApiDocument(): ApiDocument {
  const bag = new ComponentBag();

  // Named models first, so an endpoint body can be a bare `$ref`.
  const modelRefs = new Map<ApiModelName, JsonSchema>();
  for (const [name, schema] of Object.entries(API_MODELS) as [ApiModelName, z.ZodType][]) {
    modelRefs.set(name, convert(schema, name.endsWith("Request") ? "input" : "output", bag));
  }
  for (const [name, schema] of modelRefs) bag.add(name, schema);

  const paths: ApiDocument["paths"] = {};
  for (const endpoint of API_ENDPOINTS) {
    const operation: Record<string, unknown> = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      description: endpoint.description,
      tags: [endpoint.tag],
      security: securityFor(endpoint.auth),
      parameters: endpoint.parameters.map((param) => ({
        name: param.name,
        in: param.in,
        required: param.required,
        description: param.description,
        schema: parameterSchema(param, bag),
      })),
      responses: Object.fromEntries(
        endpoint.responses.map((response) => {
          const mediaType = response.contentType ?? "application/json";
          const hasBody = response.model !== undefined || response.schema !== undefined || response.example !== undefined;
          return [
            String(response.status),
            {
              description: response.description,
              ...(hasBody
                ? {
                    content: {
                      [mediaType]: {
                        schema: response.model ? { $ref: `${COMPONENT_PREFIX}${response.model}` } : (response.schema ?? {}),
                        ...(response.example !== undefined ? { example: response.example } : {}),
                      },
                    },
                  }
                : {}),
            },
          ];
        }),
      ),
    };

    if (endpoint.requestBody) {
      operation.requestBody = {
        required: endpoint.requestBody.required,
        description: endpoint.requestBody.description,
        content: {
          "application/json": {
            schema: { $ref: `${COMPONENT_PREFIX}${endpoint.requestBody.model}` },
            ...(endpoint.requestBody.example !== undefined ? { example: endpoint.requestBody.example } : {}),
          },
        },
      };
    }

    const pathItem = (paths[endpoint.path] ??= {});
    pathItem[endpoint.method] = operation;
  }

  const { summary, description } = infoSummary();

  return {
    openapi: "3.1.0",
    info: {
      title: "GGRun API",
      version: pkg.version,
      summary,
      description,
      license: { name: "MIT", url: "https://github.com/NemoKing1210/ggrun/blob/main/LICENSE" },
    },
    // Deliberately env-free and relative: the app serves its own reference, so
    // "/" is the origin the reader already reached, and `docs/API.md` stays
    // byte-identical wherever it is generated. Tooling resolves it against the
    // serving origin (Try-it against a deployment included).
    servers: [
      {
        url: "/",
        description: "Same origin as this document — the app serves its own API reference (http://localhost:3000 in development).",
      },
    ],
    tags: Object.entries(TAG_DESCRIPTIONS).map(([name, description]) => ({ name, description })),
    paths,
    components: {
      schemas: bag.schemas,
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: SESSION_COOKIE,
          description:
            "Browser session cookie, set by the login flow — httpOnly, SameSite=Lax, 30-day lifetime, revoked by logout. Server-side it resolves to a user whose row is not blocked.",
        },
        cronBearer: {
          type: "http",
          scheme: "bearer",
          description:
            "`CRON_SECRET` sent as `Authorization: Bearer <secret>`. Compared in constant time. Unset server-side → every call is `503 CRON_NOT_CONFIGURED`.",
        },
      },
    },
    security: [],
    "x-realtime": buildRealtimeSection(bag),
    "x-source": { repository: "https://github.com/NemoKing1210/ggrun" },
  };
}

let cached: ApiDocument | null = null;

/** Memoized document — the route, the markdown renderer and the tests share it. */
export function apiDocument(): ApiDocument {
  return (cached ??= buildApiDocument());
}

/** Every `$ref` target used anywhere in the document (for the dangling-ref check). */
export function collectRefs(document: ApiDocument): string[] {
  const refs: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "$ref" && typeof value === "string") refs.push(value);
        else walk(value);
      }
    }
  };
  walk(document);
  return refs;
}
