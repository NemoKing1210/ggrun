import { describe, expect, it } from "vitest";

import type { EntryDoc } from "./doc";
import { IDS, effectDoc, itemDoc } from "./fixtures.test-helpers";
import { compileSet, type SetMemberInput } from "./set";

const rev = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const member = (entryId: string, revisionId: string, doc: unknown): SetMemberInput => ({ entryId, revisionId, doc });

const slowed = effectDoc({ slug: "slowed", name: { ru: "Замедление", en: "Slowed", uk: "Уповільнення" } });
const hex = itemDoc({ slug: "hex" });
const salve: EntryDoc = itemDoc({
  slug: "salve",
  rarity: "rare",
  usage: { activation: "active", charges: 1 },
  rules: [{ when: "onUse", do: [{ op: "cleanse", character: "penalty", count: "all" }] }],
});

describe("compileSet", () => {
  it("compiles a consistent set and indexes it by key, entry and revision", () => {
    const set = compileSet([member(IDS.slowed, rev(1), slowed), member(IDS.hex, rev(2), hex), member(IDS.salve, rev(3), salve)]);
    expect(set.failures).toEqual([]);
    expect(set.warnings).toEqual([]);
    expect([...set.byKey.keys()]).toEqual(["slowed", "hex", "salve"]);
    expect(set.byEntryId.get(IDS.hex)?.key).toBe("hex");
    expect(set.byRevisionId.get(rev(1))?.key).toBe("slowed");
    // The item's text names the effect from inside the set.
    expect(set.byKey.get("hex")?.ruleText.en).toContain("“Slowed”");
  });

  it("plays an entry whose scenarios name entries the set does not hold — a season plays rules", () => {
    const withScenario = effectDoc({
      slug: "slowed",
      scenarios: [
        {
          title: { ru: "С мазью" },
          given: { holder: { carries: [{ entry: "self" }, { entry: { entry: IDS.gift, slug: "gift" } }] } },
          steps: [{ do: "roll", outcome: "passed", dice: 3 }],
        },
      ],
    });
    const set = compileSet([member(IDS.slowed, rev(1), withScenario)]);
    expect(set.failures).toEqual([]);
    expect(set.byKey.has("slowed")).toBe(true);
  });

  it("disables a broken entry and everything that references it, and plays the rest", () => {
    const brokenSlowed = { ...slowed, duration: { unit: "rolls" } };
    const set = compileSet([
      member(IDS.slowed, rev(1), brokenSlowed),
      member(IDS.hex, rev(2), hex),
      member(IDS.salve, rev(3), salve),
    ]);
    expect(set.failures.map((f) => [f.slug, f.errors[0]!.code])).toEqual([
      ["slowed", "duration_count"],
      ["hex", "missing_ref"],
    ]);
    expect([...set.byKey.keys()]).toEqual(["salve"]);
  });

  it("reports documents it cannot read at all", () => {
    const set = compileSet([
      member(IDS.slowed, rev(1), { dslVersion: 7 }),
      member(IDS.hex, rev(2), { dslVersion: 1, kind: "item" }),
      member(IDS.salve, rev(3), "not a document"),
    ]);
    expect(set.failures.map((f) => [f.slug, f.errors[0]!.code])).toEqual([
      [null, "schema"],
      [null, "schema"],
      [null, "schema"],
    ]);
    expect(set.entries).toEqual([]);
  });

  it("says where a document breaks the format, and every place it does", () => {
    const { tags: _tags, rarity: _rarity, ...noTags } = slowed as Record<string, unknown>;
    const set = compileSet([member(IDS.slowed, rev(1), noTags)]);
    expect(set.failures[0]!.errors.map((e) => [e.code, e.path])).toEqual([
      ["schema", ["rarity"]],
      ["schema", ["tags"]],
    ]);
  });

  it("takes every member of a grant loop out, and keeps the first of two duplicates", () => {
    const a = effectDoc({
      slug: "loop_a",
      character: "bonus",
      rules: [{ when: "onApply", do: [{ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }] }],
    });
    const b = effectDoc({
      slug: "loop_b",
      character: "bonus",
      rules: [{ when: "onExpire", do: [{ op: "grantEffect", entry: { entry: IDS.slowed }, to: "self" }] }],
    });
    const loop = compileSet([member(IDS.slowed, rev(1), a), member(IDS.tailwind, rev(2), b)]);
    expect(loop.failures.map((f) => [f.slug, f.errors[0]!.code])).toEqual([
      ["loop_a", "grant_cycle"],
      ["loop_b", "grant_cycle"],
    ]);

    const twice = compileSet([
      member(IDS.slowed, rev(1), slowed),
      member(IDS.tailwind, rev(2), slowed),
      member(IDS.slowed, rev(3), { ...slowed, slug: "slowed_again" }),
    ]);
    expect(twice.failures.map((f) => [f.revisionId, f.errors[0]!.code])).toEqual([
      [rev(2), "duplicate_slug"],
      [rev(3), "duplicate_id"],
    ]);
    expect(twice.entries.map((e) => e.revisionId)).toEqual([rev(1)]);
  });

  it("passes set warnings through to the entry they concern", () => {
    const set = compileSet([member(IDS.slowed, rev(1), slowed)]);
    expect(set.warnings.map((w) => [w.slug, w.issue.code])).toEqual([["slowed", "no_counter"]]);
  });

  it("compiles older revisions held by live instances against the same catalog", () => {
    const old = { ...slowed, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -3 }] }] };
    const set = compileSet(
      [member(IDS.slowed, rev(2), slowed), member(IDS.salve, rev(3), salve)],
      [member(IDS.slowed, rev(1), old), member(IDS.slowed, rev(2), slowed), member(IDS.hex, rev(9), { dslVersion: 3 })],
    );
    expect(set.byKey.get("slowed")?.revisionId).toBe(rev(2));
    expect(set.byRevisionId.get(rev(1))?.ruleText.en).toContain("3 cells shorter");
    expect(set.byRevisionId.size).toBe(3);
    expect(set.failures.map((f) => f.revisionId)).toEqual([rev(9)]);
  });

  it("an older revision that no longer checks out is reported, not compiled", () => {
    const set = compileSet([member(IDS.salve, rev(3), salve)], [member(IDS.hex, rev(4), hex)]);
    expect(set.failures.map((f) => [f.slug, f.errors[0]!.code])).toEqual([["hex", "missing_ref"]]);
    expect(set.byRevisionId.has(rev(4))).toBe(false);
  });
});
