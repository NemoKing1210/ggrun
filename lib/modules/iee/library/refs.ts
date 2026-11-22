/**
 * References between entries (docs/IEE_CONSTRUCTOR_SPEC.md §10.3): a rule
 * names another entry as `{ "entry": "<uuid>", "slug"?: "…" }`. The library
 * reads them out of drafts and revisions to maintain pack dependencies, and
 * publish resolves them.
 *
 * Any object of exactly that shape counts, wherever it sits — so a primitive
 * added in a later wave needs nothing here.
 *
 * Rules and scenarios (§5.5) are told apart: what the rules reference is what
 * an entry needs to *play* — a season attaches it along — while a scenario's
 * entries are only needed to *check* it. The pack depends on both.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isEntryRef(value: unknown): value is { entry: string; slug?: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.includes("entry") || keys.some((k) => k !== "entry" && k !== "slug")) return false;
  const ref = value as { entry: unknown; slug?: unknown };
  return typeof ref.entry === "string" && UUID_RE.test(ref.entry) && (ref.slug === undefined || typeof ref.slug === "string");
}

/** Entry ids under one field of a document, each once, in order of appearance. */
function refsUnder(doc: unknown, field: "rules" | "scenarios"): string[] {
  if (doc === null || typeof doc !== "object") return [];
  const found: string[] = [];
  const walk = (value: unknown) => {
    if (isEntryRef(value)) {
      const id = value.entry.toLowerCase();
      if (!found.includes(id)) found.push(id);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk((doc as Record<string, unknown>)[field]);
  return found;
}

/** Entry ids a document references from its rules — what it needs to play. */
export function referencedEntries(doc: unknown): string[] {
  return refsUnder(doc, "rules");
}

/** Entry ids a document's scenarios set up, hand out, use or count. */
export function scenarioEntries(doc: unknown): string[] {
  return refsUnder(doc, "scenarios");
}

/** Everything a document names — its rules', then its scenarios' — each once. The pack depends on all of it. */
export function mentionedEntries(doc: unknown): string[] {
  const rules = referencedEntries(doc);
  return [...rules, ...scenarioEntries(doc).filter((id) => !rules.includes(id))];
}
