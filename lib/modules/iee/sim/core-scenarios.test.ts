import { describe, expect, it } from "vitest";

import { SCENARIOS } from "@/lib/engine";
import { CORE_DOCS } from "@/lib/engine/iee/core-docs";

import { runEntryScenarios, scenarioIssues } from "./scenarios";

/**
 * What the system pack promises, proved the way publishing proves it: every
 * scenario of every `core` entry (spec §5.5) runs green against the rest of
 * the pack. A red one here is a red one at boot, when `pnpm iee:import`
 * refuses the file — so this suite is where a change of behaviour shows first.
 */
const DOCS = new Map(CORE_DOCS.map((r) => [r.entryId, r.doc]));

describe("core — every entry's scenarios are green", () => {
  it.each(CORE_DOCS.map((r) => [r.doc.slug, r] as const))("%s", async (_slug, record) => {
    const run = await runEntryScenarios({ entryId: record.entryId, doc: record.doc, docOf: (id) => DOCS.get(id) ?? null });
    expect(scenarioIssues(run)).toEqual([]);
    expect(run.reports.length).toBeGreaterThan(0);
  });
});

describe("core — the scenarios as a catalogue", () => {
  const ids = CORE_DOCS.flatMap((r) => (r.doc.scenarios ?? []).map((s) => s.id ?? ""));

  it("every entry promises something", () => {
    expect(CORE_DOCS.filter((r) => (r.doc.scenarios ?? []).length === 0).map((r) => r.doc.slug)).toEqual([]);
  });

  it("ids are well formed and unique across the pack and the subsystem table", () => {
    for (const id of ids) expect(id).toMatch(/^SC-[A-Z]+-\d+$/);
    const all = [...ids, ...SCENARIOS.map((s) => s.id)];
    expect(new Set(all).size).toBe(all.length);
  });

  it("every title reads in all three languages", () => {
    for (const r of CORE_DOCS) {
      for (const s of r.doc.scenarios ?? []) {
        expect(`${s.id}:${Boolean(s.title.en && s.title.uk)}`).toBe(`${s.id}:true`);
        if (s.note) expect(`${s.id}:${Boolean(s.note.en && s.note.uk)}`).toBe(`${s.id}:true`);
      }
    }
  });
});
