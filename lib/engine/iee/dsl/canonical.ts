/**
 * Canonical JSON: object keys sorted, no whitespace. Two documents that mean
 * the same thing serialise to the same string, which is what the content hash
 * of a revision is taken over (spec §4.2) — hashing itself happens outside the
 * engine, where `node:crypto` is.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}
