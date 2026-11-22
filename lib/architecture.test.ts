import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { FEED_FILTER_TYPES } from "@/lib/engine/feed/filters";

// Each scan parses the source tree: about a second alone, several under a full
// coverage run on a small machine.
vi.setConfig({ testTimeout: 30_000 });

/**
 * A few rules the compiler and the linter each express only once, restated
 * here so they cannot be deleted in silence.
 *
 * The ESLint config states the layering rule, but a rule that lives in a config
 * is one edit from gone, and the config cannot see across a `import type`. The
 * husky hooks are what stop a red commit from being pushed, but nothing fails
 * when a hook file is removed. And the exhaustiveness of the feed tabs is a
 * compile-time trick that vanishes the moment the type alias is refactored —
 * at which point `Exclude<EventType, FiltrableEventType>` becomes `never` and
 * stops proving anything.
 *
 * So this reads the source: the import graph exists only as text, the hooks
 * only as text, and the event union only as a parse tree.
 */

const ROOT = process.cwd();

function parse(file: string, kind = ts.ScriptKind.TS): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : kind,
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Source files only: tests are excluded because a test may legitimately reach anywhere. */
function sourceFiles(dir: string): string[] {
  return walk(dir).filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) &&
      !/\.test\.(ts|tsx)$/.test(file) &&
      !/\.d\.ts$/.test(file),
  );
}

function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

/** Every module specifier a file statically imports/re-exports, plus dynamic import()/require(). */
function moduleSpecifiers(file: string): string[] {
  const sf = parse(file);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) out.push(spec.text);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const first = node.arguments[0];
      if ((isDynamicImport || isRequire) && first && ts.isStringLiteral(first)) {
        out.push(first.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

type ImportRule = { label: string; matches: (specifier: string) => boolean; fix: string };

/** Mirrors the `no-restricted-imports` group for `lib/engine` in `eslint.config.mjs`. */
const ENGINE_RULES: ImportRule[] = [
  {
    label: "next/*",
    matches: (s) => s === "next" || s.startsWith("next/"),
    fix: "Keep lib/engine off the Next.js runtime; run it from a use-case/module that passes data in.",
  },
  {
    label: "react",
    matches: (s) => s === "react",
    fix: "Keep lib/engine a pure-TS domain; render React in components, not here.",
  },
  {
    label: "drizzle-orm",
    matches: (s) => s === "drizzle-orm" || s.startsWith("drizzle-orm/"),
    fix: "Keep lib/engine off the ORM; map rows to engine types at the infrastructure boundary.",
  },
  {
    label: "pg",
    matches: (s) => s === "pg",
    fix: "Keep lib/engine off the driver; the database pool belongs in lib/infrastructure.",
  },
  {
    label: "@/lib/infrastructure/*",
    matches: (s) => s.startsWith("@/lib/infrastructure/"),
    fix: "Domain must not depend on infrastructure — depend on types and inject the effect.",
  },
];

/** Mirrors the `no-restricted-imports` group for `lib/shared` in `eslint.config.mjs`. */
const SHARED_RULES: ImportRule[] = [
  {
    label: "@/lib/infrastructure/*",
    matches: (s) => s.startsWith("@/lib/infrastructure/"),
    fix: "Shared is a leaf; it must not reach the database, logger, or event infrastructure.",
  },
  {
    label: "@/lib/modules/*",
    matches: (s) => s.startsWith("@/lib/modules/"),
    fix: "Shared is a leaf; modules may import from it, never the other way around.",
  },
  {
    label: "@/lib/use-cases/*",
    matches: (s) => s.startsWith("@/lib/use-cases/"),
    fix: "Shared is a leaf; use-cases are above it, not below.",
  },
];

function importViolations(dir: string, rules: ImportRule[]): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(dir)) {
    for (const spec of moduleSpecifiers(file)) {
      const rule = rules.find((r) => r.matches(spec));
      if (rule) found.push(`${rel(file)} imports "${spec}" (${rule.label}). ${rule.fix}`);
    }
  }
  return found;
}

describe("architecture: layer purity", () => {
  it("lib/engine imports nothing from the framework, the DB, or infrastructure", () => {
    const violations = importViolations(path.join(ROOT, "lib", "engine"), ENGINE_RULES);
    expect(
      violations,
      "lib/engine is the pure domain. Offending imports:\n" + violations.join("\n"),
    ).toEqual([]);
  });

  it("lib/shared imports nothing from infrastructure, modules, or use-cases", () => {
    const violations = importViolations(path.join(ROOT, "lib", "shared"), SHARED_RULES);
    expect(
      violations,
      "lib/shared is a dependency leaf. Offending imports:\n" + violations.join("\n"),
    ).toEqual([]);
  });
});

/**
 * A file with `"use client"` at the top runs in the browser; `"use server"`
 * makes every export an RPC endpoint. Either directive leaked into the domain
 * would quietly change how it is bundled and where it can be called. The pure
 * layers must never carry one — that is what "pure" buys them.
 */
function hasDirective(file: string, directive: string): boolean {
  const sf = parse(file);
  const first = sf.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === directive
  );
}

function directiveViolations(dir: string): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(dir)) {
    for (const directive of ["use client", "use server"] as const) {
      if (hasDirective(file, directive)) {
        found.push(`${rel(file)} starts with "${directive}"`);
      }
    }
  }
  return found;
}

describe("architecture: the pure layers carry no client/server directive", () => {
  it('no file under lib/engine has "use client" or "use server"', () => {
    const violations = directiveViolations(path.join(ROOT, "lib", "engine"));
    expect(violations, "Remove the directive:\n" + violations.join("\n")).toEqual([]);
  });

  it('no file under lib/shared has "use client" or "use server"', () => {
    const violations = directiveViolations(path.join(ROOT, "lib", "shared"));
    expect(violations, "Remove the directive:\n" + violations.join("\n")).toEqual([]);
  });
});

/**
 * The mechanism that stops a broken commit from leaving the machine.
 *
 * `pre-push` runs `pnpm verify`, `verify` chains the three gates, `prepare`
 * installs husky so the hooks survive a fresh clone, and `commit-msg` +
 * `commitlint` hold the history to a parseable format. None of those files are
 * referenced by any test, so deleting one today breaks nothing observable until
 * the day it matters. This is the reference.
 */

function readText(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

/** The `extends` values of the default object export of a JS config file. */
function esmDefaultExtends(relative: string): string[] {
  const sf = parse(path.join(ROOT, relative), ts.ScriptKind.JS);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === "extends") {
      const items = ts.isArrayLiteralExpression(node.initializer)
        ? node.initializer.elements
        : [node.initializer];
      for (const item of items) if (ts.isStringLiteral(item)) out.push(item.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("architecture: the push gate cannot be disarmed by accident", () => {
  const pkg = JSON.parse(readText("package.json")) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};

  it("`prepare` installs husky so a fresh clone gets the hooks", () => {
    expect(scripts.prepare, "package.json must keep `prepare: husky`").toBe("husky");
  });

  it("`verify` chains lint, typecheck and the coverage run", () => {
    const steps = (scripts.verify ?? "").split("&&").map((s) => s.trim());
    expect(
      steps,
      "`verify` is the single command the pre-push hook and handoffs rely on",
    ).toEqual(
      expect.arrayContaining(["pnpm lint", "pnpm typecheck", "pnpm test:coverage"]),
    );
  });

  it("`pre-push` runs the full gate and does not swallow its failure", () => {
    const hook = readText(".husky/pre-push");
    expect(hook, "pre-push must run `pnpm verify`").toContain("pnpm verify");
    expect(
      hook,
      "pre-push must not mask a red verify with `|| true` / `|| exit 0`",
    ).not.toMatch(/\|\|\s*(true|exit\s+0)/);
  });

  it("`commit-msg` enforces Conventional Commits via commitlint", () => {
    const hook = readText(".husky/commit-msg");
    expect(hook, "commit-msg must invoke commitlint on the message file").toContain("commitlint");
  });

  it("`pre-commit` runs lint-staged on the staged files", () => {
    const hook = readText(".husky/pre-commit");
    expect(hook, "pre-commit must invoke lint-staged").toContain("lint-staged");
  });

  it("`commitlint.config.mjs` extends the conventional preset", () => {
    expect(
      esmDefaultExtends("commitlint.config.mjs"),
      "commit-msg is only as strict as the preset it extends",
    ).toContain("@commitlint/config-conventional");
  });
});

/**
 * The feed tabs and the event union are one fact stated twice.
 *
 * `lib/infrastructure/events` has a compile-time proof that `EventType` is
 * covered by `FiltrableEventType`, but that proof is invisible to a refactor
 * that renames the alias or replaces the union — `Exclude<...>` silently
 * degrades to `never`. This restates the invariant against the runtime table,
 * so the mechanism survives the refactor the type check would not.
 */
function eventTypeMembers(file: string): string[] {
  const sf = parse(file);
  for (const stmt of sf.statements) {
    if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === "EventType") {
      if (!ts.isUnionTypeNode(stmt.type)) return [];
      const members: string[] = [];
      for (const member of stmt.type.types) {
        if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
          members.push(member.literal.text);
        }
      }
      return members;
    }
  }
  return [];
}

describe("architecture: every event type is under a feed tab", () => {
  const eventTypes = eventTypeMembers(path.join(ROOT, "lib", "infrastructure", "events", "index.ts"));

  it("the union is still parsed (a scan of nothing proves nothing)", () => {
    expect(
      eventTypes,
      "`EventType` must remain a string-literal union in lib/infrastructure/events/index.ts",
    ).toEqual(
      expect.arrayContaining(["game_rolled", "completion_requested", "reroll_rejected"]),
    );
  });

  it("no event type is missing a tab — it would render under 'All' only", () => {
    const filed = new Set<string>();
    for (const types of Object.values(FEED_FILTER_TYPES)) {
      for (const type of types) filed.add(type);
    }
    const unfiled = eventTypes.filter((type) => !filed.has(type));
    expect(
      unfiled,
      "Add each to a tab in lib/engine/feed/filters.ts:\n" + unfiled.join("\n"),
    ).toEqual([]);
  });

  it("no tab names a type the log can never write", () => {
    const known = new Set(eventTypes);
    const stale: string[] = [];
    for (const types of Object.values(FEED_FILTER_TYPES)) {
      for (const type of types) if (!known.has(type)) stale.push(type);
    }
    expect(
      stale,
      "Tab entries that are not EventType members would sit empty forever:\n" + stale.join("\n"),
    ).toEqual([]);
  });
});

/**
 * Items and effects have one writer (docs/IEE_CONSTRUCTOR_SPEC.md §9.1).
 *
 * Every grant, use, firing, tick, end and reset is an executor operation,
 * journaled with its cause; the store under it is the only code that writes the
 * IEE tables, and only the execution context opens that store. Three grant
 * paths that each wrote their own rows is how a season's tuning and the
 * stacking policy once applied to a third of the game — a second writer here
 * would bring that back without failing a single unit test.
 */
const IEE_WRITER = "lib/modules/iee/executor/store.ts";
const IEE_CONTEXT = "lib/modules/iee/executor/context.ts";
const IEE_TABLES = /^(ieeInstances|ieeJournal|ieeDecisions)$/;

/** `x.insert(table)`, `x.update(table)` or `x.delete(table)` on a table the pattern names. */
function writesTables(file: string, tables: RegExp, ops: readonly string[] = ["insert", "update", "delete"]): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ops.includes(node.expression.name.text)
    ) {
      const first = node.arguments[0];
      if (first && ts.isIdentifier(first) && tables.test(first.text)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

const writesIeeTables = (file: string) => writesTables(file, IEE_TABLES);

function callsFunction(file: string, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

describe("architecture: IEE state has one writer", () => {
  const files = ["app", "lib", "components", "scripts"]
    .map((dir) => path.join(ROOT, dir))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => sourceFiles(dir));
  const writers = files.filter(writesIeeTables).map(rel);

  it("the executor's store writes the IEE tables (a scan of nothing proves nothing)", () => {
    expect(writers).toContain(IEE_WRITER);
  });

  it("nothing else does", () => {
    expect(
      writers.filter((file) => file !== IEE_WRITER),
      "Write through lib/modules/iee/executor — a second writer bypasses tuning, stacking and the journal.",
    ).toEqual([]);
  });

  it("only the execution context opens the store", () => {
    expect(files.filter((file) => callsFunction(file, "pgStore")).map(rel)).toEqual([IEE_CONTEXT]);
  });
});

/**
 * The library writes the definitions, and a revision never changes
 * (docs/IEE_CONSTRUCTOR_SPEC.md §4.2, §10.1).
 *
 * A season pins a revision and an instance remembers the one it was granted
 * with; both trust that what they point at is what was published. An UPDATE
 * on a revision would change a running season's rules behind its back, and a
 * DELETE would leave instances pointing at nothing — the foreign keys refuse
 * the second, this test the first.
 */
const LIBRARY_WRITER = "lib/modules/iee/library/store.ts";
const LIBRARY_TABLES = /^(ieePacks|ieeEntries|ieeEntryRevisions|ieePackDependencies)$/;

describe("architecture: the IEE library has one writer, and revisions are insert-only", () => {
  const files = ["app", "lib", "components", "scripts"]
    .map((dir) => path.join(ROOT, dir))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => sourceFiles(dir));

  it("the library's store writes the definition tables, and nothing else does", () => {
    const writers = files.filter((file) => writesTables(file, LIBRARY_TABLES)).map(rel);
    expect(writers, "Write packs, entries and revisions through lib/modules/iee/library.").toEqual([LIBRARY_WRITER]);
  });

  it("no code updates or deletes a revision", () => {
    const offenders = files
      .filter((file) => writesTables(file, /^ieeEntryRevisions$/, ["update", "delete"]))
      .map(rel);
    expect(offenders, "Revisions are insert-only: publish a new one instead.").toEqual([]);
  });

  it("only the library opens its store", () => {
    const openers = files.filter((file) => callsFunction(file, "pgLibraryStore")).map(rel);
    expect(openers.length).toBeGreaterThan(0);
    expect(openers.filter((file) => !file.startsWith("lib/modules/iee/library/"))).toEqual([]);
  });
});

/**
 * Which revision of which entry a season plays (spec §4.2) changes in one
 * place, with the checks that keep a season's set whole — its references
 * attached, its keys unique — and the audit row. The demo seed inserts its
 * tracer rows in plain SQL; no TypeScript writes the table but the store.
 */
describe("architecture: the season catalog has one writer", () => {
  const files = ["app", "lib", "components", "scripts"]
    .map((dir) => path.join(ROOT, dir))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => sourceFiles(dir));

  it("the catalog's store writes season_catalog, and nothing else does", () => {
    const writers = files.filter((file) => writesTables(file, /^seasonCatalog$/)).map(rel);
    expect(writers, "Change a season's catalog through lib/modules/iee/catalog.").toEqual([
      "lib/modules/iee/catalog/store.ts",
    ]);
  });

  it("only the catalog module opens its store", () => {
    const openers = files.filter((file) => callsFunction(file, "pgSeasonCatalogStore")).map(rel);
    expect(openers.length).toBeGreaterThan(0);
    expect(openers.filter((file) => !file.startsWith("lib/modules/iee/catalog/"))).toEqual([]);
  });
});
