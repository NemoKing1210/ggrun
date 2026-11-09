/**
 * Loads `seed/iee/core.ggpack` into the library as the system pack
 * (docs/IEE_CONSTRUCTOR_SPEC.md §10.2). Idempotent: revisions are matched by
 * content hash, so a second run adds nothing. Shared by `pnpm iee:import` and
 * the demo seed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CORE_PACK_FILE, importSystemPack, type ImportReport } from "@/lib/modules/iee/library";

export async function importCorePack(root = process.cwd()): Promise<ImportReport> {
  return importSystemPack(new Uint8Array(readFileSync(resolve(root, CORE_PACK_FILE))));
}

/** One line for a terminal: what the import changed. */
export function describeImport(report: ImportReport): string {
  const count = (state: string) => report.entries.filter((e) => e.state === state).length;
  const revisions = report.entries.reduce((n, e) => n + e.revisionsAdded, 0);
  if (report.pack.state === "unchanged" && revisions === 0 && count("updated") === 0) {
    return `${report.pack.slug}: up to date (${report.entries.length} entries)`;
  }
  const parts = [
    `pack ${report.pack.state}`,
    `${count("added")} entries added`,
    `${count("updated")} updated`,
    `${revisions} revisions added`,
  ];
  if (report.draftsKept.length > 0) parts.push(`local drafts kept: ${report.draftsKept.join(", ")}`);
  return `${report.pack.slug}: ${parts.join(", ")}`;
}
