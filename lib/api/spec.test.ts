import fs from "node:fs";
import path from "node:path";

import { validate } from "@scalar/openapi-parser";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { API_ENDPOINTS } from "./contract";
import { renderApiMarkdown } from "./markdown";
import { REALTIME_EVENTS, REALTIME_ROOMS } from "./realtime";
import { apiDocument, collectRefs } from "./spec";

/**
 * The API reference is only worth anything while it matches the running code.
 *
 * Two of its halves are pinned by the type system (`RealtimeEventMap` payloads
 * in `realtime.ts`, model names in `contract.ts`). The rest is pinned here, by
 * reading the source the spec claims to describe:
 *
 * - every `app/api/**` route handler is in the spec, and every documented
 *   endpoint exists (method + path, both directions);
 * - every `error:` code a route can return is documented, and the spec invents
 *   none that the route cannot return;
 * - every realtime event in `RealtimeEventMap` is documented, and vice versa;
 * - the document is a valid OpenAPI 3.1 document whose `$ref`s all resolve;
 * - `docs/API.md` is byte-identical to what `pnpm api:doc` would write.
 *
 * Failure messages name the fix, because the fix is always the same shape:
 * change `lib/api/`, then re-run `pnpm api:doc`.
 */

const ROOT = process.cwd();
/** Every route handler in the app — the docs must describe all of them, not just app/api. */
const API_DIR = path.join(ROOT, "app");
const ROUTE_FILE_RE = /^route\.(ts|tsx|js|jsx)$/;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
/** Error codes are SCREAMING_SNAKE: `FAILED`, `RATE_LIMITED`, `content: too long`? no. */
const CODE_RE = /^[A-Z][A-Z0-9_]{3,}$/;

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
}

function routeFiles(dir = API_DIR): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (ROUTE_FILE_RE.test(entry.name)) out.push(full);
  }
  return out.sort();
}

/** `/api/bots/tick` for `app/api/bots/tick/route.ts` — the URL Next.js serves. */
function routePath(file: string): string {
  const rel = path.relative(path.join(ROOT, "app"), path.dirname(file));
  return `/${rel.split(path.sep).join("/")}`;
}

/** Exported HTTP method handlers (`export async function GET`). */
function exportedMethods(source: ts.SourceFile): string[] {
  const found: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    const exported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && (METHODS as readonly string[]).includes(statement.name.text)) {
      found.push(statement.name.text);
    }
  }
  return found;
}

/**
 * Literal error codes a handler can put in `{ error: … }`:
 * - `error: "CODE"` directly,
 * - `error: msg` where `msg` is compared to a code (`msg === "RATE_LIMITED"`),
 *   the shape the chat route uses to translate repository throws.
 * Dynamic codes (`error: e.code`) are deliberately invisible here — they are
 * documented by description, not by literal.
 */
function errorCodes(source: ts.SourceFile): string[] {
  const codes = new Set<string>();
  const isCode = (node: ts.Node): node is ts.StringLiteral =>
    ts.isStringLiteral(node) && CODE_RE.test(node.text);

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "error" && isCode(node.initializer)) {
      codes.add(node.initializer.text);
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
    ) {
      if (isCode(node.left) && ts.isIdentifier(node.right)) codes.add(node.left.text);
      if (isCode(node.right) && ts.isIdentifier(node.left)) codes.add(node.right.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...codes].sort();
}

/** Members of an `interface Name { … }` whose keys are string literals. */
function stringKeyedInterfaceMembers(source: ts.SourceFile, name: string): string[] {
  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== name) continue;
    return statement.members.flatMap((member) =>
      member.name && ts.isStringLiteral(member.name) ? [member.name.text] : [],
    );
  }
  throw new Error(`interface ${name} not found — did lib/realtime/protocol.ts change shape?`);
}

const routes = routeFiles().map((file) => ({ file, path: routePath(file), source: parse(file) }));

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3.1 document", async () => {
    const result = await validate(apiDocument() as unknown as Record<string, unknown>);
    expect(result.errors ?? [], "lib/api/spec.ts builds an invalid document").toEqual([]);
    expect(result.valid, "lib/api/spec.ts builds an invalid document").toBe(true);
    expect(result.version).toBe("3.1");
  });

  it("documents every route handler in the app", () => {
    const documented = new Set(API_ENDPOINTS.map((e) => `${e.method.toUpperCase()} ${e.path}`));
    const missing = routes.flatMap((route) =>
      exportedMethods(route.source)
        .map((method) => `${method} ${route.path}`)
        .filter((key) => !documented.has(key))
        .map((key) => `${key} (app/${path.relative(path.join(ROOT, "app"), route.file)})`),
    );
    expect(
      missing,
      "route handlers with no entry in lib/api/contract.ts — document them (or delete the handler)",
    ).toEqual([]);
  });

  it("has a route handler for every documented endpoint", () => {
    const actual = new Set(routes.flatMap((route) => exportedMethods(route.source).map((m) => `${m} ${route.path}`)));
    const ghosts = API_ENDPOINTS.map((e) => `${e.method.toUpperCase()} ${e.path}`).filter((key) => !actual.has(key));
    expect(ghosts, "documented endpoints that no app/api route serves — fix lib/api/contract.ts").toEqual([]);
  });

  it("documents every error code the route handlers return", () => {
    const problems: string[] = [];
    for (const route of routes) {
      const documented = new Set(
        API_ENDPOINTS.filter((e) => e.path === route.path).flatMap((e) =>
          e.responses.map((r) => r.errorCode).filter((c): c is string => !!c),
        ),
      );
      for (const code of errorCodes(route.source)) {
        if (!documented.has(code)) problems.push(`${route.path} returns ${code} — add it to lib/api/contract.ts`);
      }
    }
    expect(problems, "undocumented error codes").toEqual([]);
  });

  it("documents no error code the route handlers cannot return", () => {
    const problems: string[] = [];
    for (const route of routes) {
      const actual = new Set(errorCodes(route.source));
      const documented = new Set(
        API_ENDPOINTS.filter((e) => e.path === route.path).flatMap((e) =>
          e.responses.map((r) => r.errorCode).filter((c): c is string => !!c),
        ),
      );
      for (const code of documented) {
        if (!actual.has(code)) problems.push(`${route.path} documents ${code}, which it does not return`);
      }
    }
    expect(problems, "error codes in the spec that the routes never produce").toEqual([]);
  });

  it("resolves every $ref, and every model is reachable", () => {
    const document = apiDocument();
    const names = new Set(Object.keys(document.components.schemas));
    const refs = collectRefs(document);
    const dangling = [...new Set(refs)].filter((ref) => !names.has(ref.split("/").pop() ?? ""));
    expect(dangling, "dangling $refs — a model name in lib/api/contract.ts is wrong").toEqual([]);
    const used = new Set(refs.map((ref) => ref.split("/").pop()));
    const orphans = [...names].filter((name) => !used.has(name));
    expect(orphans, "models nothing references — remove them from API_MODELS or use them").toEqual([]);
  });

  it("maps every model name to the component it says it does", () => {
    const document = apiDocument();
    for (const endpoint of API_ENDPOINTS) {
      const models = [endpoint.requestBody?.model, ...endpoint.responses.map((r) => r.model)].flatMap((m) =>
        m ? [String(m)] : [],
      );
      for (const model of models) {
        expect(
          document.components.schemas[model],
          `${endpoint.operationId} names model "${model}", which is not in components.schemas`,
        ).toBeDefined();
      }
    }
  });
});

describe("Realtime section", () => {
  it("documents every event in RealtimeEventMap, and nothing else", () => {
    const protocol = parse(path.join(ROOT, "lib", "realtime", "protocol.ts"));
    const declared = stringKeyedInterfaceMembers(protocol, "RealtimeEventMap");
    const documented = Object.keys(apiDocument()["x-realtime"].serverEvents);
    expect([...documented].sort(), "x-realtime drifted from RealtimeEventMap (lib/realtime/protocol.ts)").toEqual(
      [...declared].sort(),
    );
  });

  it("emits every documented event into rooms the server can join", () => {
    const rooms = new Set(REALTIME_ROOMS.map((r) => r.name));
    const unknown = Object.entries(REALTIME_EVENTS).flatMap(([event, doc]) =>
      doc.rooms.filter((room) => !rooms.has(room)).map((room) => `${event} → ${room}`),
    );
    expect(unknown, "events target rooms that are not in REALTIME_ROOMS").toEqual([]);
  });

  it("lists each room's events from the event table, not by hand", () => {
    const section = apiDocument()["x-realtime"];
    for (const room of section.rooms) {
      const expected = Object.entries(REALTIME_EVENTS)
        .filter(([, doc]) => doc.rooms.includes(room.name))
        .map(([name]) => name)
        .sort();
      expect(room.events, `room ${room.name} lists the wrong events`).toEqual(expected);
    }
  });
});

describe("docs/API.md", () => {
  it("is not stale", () => {
    const file = path.join(ROOT, "docs", "API.md");
    // `core.autocrlf=true` (the Windows default) checks the file out with CRLF
    // while the generator emits LF; normalise before comparing so the test
    // catches real drift, not a checkout artifact.
    const actual = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    expect(actual, "docs/API.md is out of date — run `pnpm api:doc`").toBe(renderApiMarkdown());
  });
});
