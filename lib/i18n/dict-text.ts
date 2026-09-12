import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Resolves a dictionary path stored in the catalog ("iee.items.jinx.name") to
 * the text for the active locale.
 *
 * Catalog entries hold keys rather than literals (§12 H3), so something has to
 * walk the dictionary at render time. This walker existed five times, byte for
 * byte, across the admin catalog page, the season stage, the catalog browser,
 * the wheel overlay and the inventory panel.
 *
 * **It returns the path itself when the key is missing.** That is deliberate —
 * a half-rendered screen is worse than a visible bad key — but it means a typo
 * in an entry's `i18n.name` renders as text and looks like a label. `tsc`
 * cannot catch it (the path is a plain string); the phase-11 wizard probe
 * asserts no rendered row contains one.
 */
export function dictText(t: Dictionary, path: string): string {
  const parts = path.split(".");
  let node: unknown = t;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return path;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : path;
}
