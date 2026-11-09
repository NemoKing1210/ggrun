/**
 * DSL evolution (spec §5.3). A revision stores the `dslVersion` it was written
 * against and is never rewritten; the registry upgrades older documents as it
 * loads them. Version 1 is the only one so far, so the chain is empty — the
 * function exists so the first breaking change has a place to go and the
 * loader already calls it.
 */
import { DSL_VERSION } from "./doc";

export type UpgradeResult = { ok: true; doc: unknown } | { ok: false; reason: string };

/** Each entry upgrades a document from version `n` to `n + 1`. */
const UPGRADERS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

export function upgradeDoc(raw: unknown): UpgradeResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "a document is a JSON object" };
  }
  let doc = raw as Record<string, unknown>;
  let version = doc.dslVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "dslVersion is missing or invalid" };
  }
  if (version > DSL_VERSION) {
    return { ok: false, reason: `written for DSL v${version}; this build reads up to v${DSL_VERSION}` };
  }
  while (version < DSL_VERSION) {
    const step = UPGRADERS[version];
    if (!step) return { ok: false, reason: `no upgrader from DSL v${version}` };
    doc = step(doc);
    version += 1;
  }
  return { ok: true, doc };
}
