import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { contentHash, factsOfDoc, planPublish, type PublishCandidate } from "./publish";
import { planWithScenarios } from "./scenarios";

/** A core document as a fixture — without its scenarios, which name core's own entries. */
const docOf = (key: CoreKey): EntryDoc => {
  const { scenarios: _scenarios, ...doc } = structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);
  return doc;
};

const candidate = (key: CoreKey, over: Partial<PublishCandidate> = {}): PublishCandidate => {
  const draft = docOf(key);
  return { entryId: CORE_ENTRY_IDS[key], slug: draft.slug, kind: draft.kind, published: false, draft, ...over };
};

const nothingPublished = () => null;
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("contentHash", () => {
  it("is the same for the same content, whatever the key order", () => {
    const doc = docOf("swamp");
    const shuffled = Object.fromEntries(Object.entries(doc).reverse()) as EntryDoc;
    expect(contentHash(shuffled)).toBe(contentHash(doc));
    expect(contentHash(doc)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with any change of content", () => {
    const doc = docOf("swamp");
    expect(contentHash({ ...doc, rarity: "rare" })).not.toBe(contentHash(doc));
  });
});

describe("planPublish — one draft", () => {
  it("passes a valid draft with its hash and parsed document", () => {
    const [plan] = planPublish({ candidates: [candidate("tailwind")], published: nothingPublished, packmates: [] });
    expect(plan).toMatchObject({ entryId: CORE_ENTRY_IDS.tailwind, errors: [] });
    expect(plan!.hash).toBe(contentHash(docOf("tailwind")));
    expect(plan!.doc?.slug).toBe("tailwind");
  });

  it("blocks a draft that does not parse, with every problem where it is", () => {
    const draft = { ...docOf("tailwind"), name: { en: "No Russian" }, rarity: "mythic" };
    const [plan] = planPublish({ candidates: [candidate("tailwind", { draft })], published: nothingPublished, packmates: [] });
    expect(plan!.hash).toBeNull();
    expect(plan!.doc).toBeNull();
    expect(plan!.errors.map((e) => e.path[0])).toEqual(expect.arrayContaining(["name", "rarity"]));
    expect(new Set(codes(plan!.errors))).toEqual(new Set(["schema"]));
  });

  it("blocks a document the upgrader cannot read", () => {
    const draft = { ...docOf("tailwind"), dslVersion: 99 };
    const [plan] = planPublish({ candidates: [candidate("tailwind", { draft })], published: nothingPublished, packmates: [] });
    expect(plan!.errors).toEqual([expect.objectContaining({ code: "schema", path: [] })]);
  });

  it("keeps the kind of an entry that has been published", () => {
    const [plan] = planPublish({
      candidates: [candidate("tailwind", { kind: "item", published: true })],
      published: nothingPublished,
      packmates: [],
    });
    expect(codes(plan!.errors)).toEqual(["kind_locked"]);
  });

  it("lets a never-published entry change its kind", () => {
    const [plan] = planPublish({
      candidates: [candidate("tailwind", { kind: "item", published: false })],
      published: nothingPublished,
      packmates: [],
    });
    expect(plan!.errors).toEqual([]);
  });

  it("refuses a draft whose slug is not the entry's", () => {
    const [plan] = planPublish({
      candidates: [candidate("tailwind", { slug: "gust" })],
      published: nothingPublished,
      packmates: [],
    });
    expect(codes(plan!.errors)).toEqual(["slug_mismatch"]);
  });

  it("carries the engine's checks: an effect with no rules is refused", () => {
    const draft = { ...docOf("tailwind"), rules: [] };
    const [plan] = planPublish({ candidates: [candidate("tailwind", { draft })], published: nothingPublished, packmates: [] });
    expect(codes(plan!.errors)).toContain("no_rules");
  });
});

describe("planPublish — references", () => {
  it("lets drafts published together reference each other", () => {
    const plans = planPublish({
      candidates: [candidate("hex_scroll"), candidate("swamp")],
      published: nothingPublished,
      packmates: [],
    });
    expect(plans.map((p) => p.errors)).toEqual([[], []]);
    expect(plans.every((p) => p.hash !== null)).toBe(true);
  });

  it("resolves a reference outside the set through the latest revision", () => {
    const swamp = factsOfDoc(CORE_ENTRY_IDS.swamp, docOf("swamp"));
    const ok = planPublish({
      candidates: [candidate("hex_scroll")],
      published: (id) => (id === CORE_ENTRY_IDS.swamp ? swamp : null),
      packmates: [],
    });
    expect(ok[0]!.errors).toEqual([]);

    const missing = planPublish({ candidates: [candidate("hex_scroll")], published: nothingPublished, packmates: [] });
    expect(codes(missing[0]!.errors)).toContain("missing_ref");
  });

  it("a draft that fails takes down the drafts that reference it", () => {
    const broken = { ...docOf("swamp"), rules: [] };
    const slowedRevision = factsOfDoc(CORE_ENTRY_IDS.swamp, docOf("swamp"));
    const plans = planPublish({
      candidates: [candidate("hex_scroll"), candidate("swamp", { draft: broken })],
      // Even with an older revision of `swamp` published: the set publishes
      // what it checked, and a reference into a failed draft is not resolved
      // behind its back.
      published: (id) => (id === CORE_ENTRY_IDS.swamp ? slowedRevision : null),
      packmates: [],
    });
    expect(codes(plans[1]!.errors)).toContain("no_rules");
    expect(codes(plans[0]!.errors)).toContain("missing_ref");
    expect(plans.map((p) => p.hash)).toEqual([null, null]);
  });

  it("blocks drafts that hand each other out in a loop", () => {
    const X = CORE_ENTRY_IDS.tailwind;
    const Y = CORE_ENTRY_IDS.lucky;
    const loop = (key: CoreKey, other: string, slug: string): PublishCandidate => {
      const draft = docOf(key);
      draft.rules = [{ when: "onApply", do: [{ op: "grantEffect", entry: { entry: other, slug }, to: "self" }] }];
      return candidate(key, { draft });
    };
    const plans = planPublish({
      candidates: [loop("tailwind", Y, "lucky"), loop("lucky", X, "tailwind")],
      published: nothingPublished,
      packmates: [],
    });
    expect(plans.map((p) => codes(p.errors))).toEqual([["grant_cycle"], ["grant_cycle"]]);
  });
});

describe("planPublish — the pack as a whole", () => {
  it("warns about a penalty effect nothing in the pack can remove", () => {
    const alone = planPublish({ candidates: [candidate("toll")], published: nothingPublished, packmates: [] });
    expect(codes(alone[0]!.warnings)).toContain("no_counter");
    expect(alone[0]!.hash).not.toBeNull();

    const withSalve = planPublish({
      candidates: [candidate("toll")],
      published: nothingPublished,
      packmates: [{ entryId: CORE_ENTRY_IDS.cleansing_salve, doc: docOf("cleansing_salve") }],
    });
    expect(codes(withSalve[0]!.warnings)).not.toContain("no_counter");
  });

  it("does not double-count a packmate that is itself being published", () => {
    const plans = planPublish({
      candidates: [candidate("tailwind")],
      published: nothingPublished,
      packmates: [{ entryId: CORE_ENTRY_IDS.tailwind, doc: { ...docOf("tailwind"), rarity: "rare" } }],
    });
    expect(codes(plans[0]!.errors)).toEqual([]);
  });
});

describe("planWithScenarios — the checks, then what each draft promises (§5.5)", () => {
  const promise = (moved: number) => ({
    title: { ru: "Попутный ветер: +2" },
    given: { holder: { carries: [{ entry: "self" as const }] } },
    steps: [{ do: "roll" as const, outcome: "passed" as const, dice: 4, expect: { moved } }],
  });
  const plan = (draft: EntryDoc, over: Partial<Parameters<typeof planWithScenarios>[0]> = {}) =>
    planWithScenarios({
      candidates: [candidate("tailwind", { draft })],
      published: nothingPublished,
      packmates: [],
      docs: () => null,
      ...over,
    });

  it("a green scenario keeps the plan as the checks made it", async () => {
    const [p] = await plan({ ...docOf("tailwind"), scenarios: [promise(6)] });
    expect(p!.errors).toEqual([]);
    expect(p!.hash).not.toBeNull();
  });

  it("a red one refuses the draft, its finding pointing at the step", async () => {
    const [p] = await plan({ ...docOf("tailwind"), scenarios: [promise(5)] });
    expect(p!.hash).toBeNull();
    expect(p!.errors).toMatchObject([{ code: "scenario_failed", path: ["scenarios", 0, "steps", 0, "expect", "moved"] }]);
  });

  it("a draft refused by the checks runs nothing", async () => {
    const [p] = await plan({ ...docOf("tailwind"), rules: [], scenarios: [promise(5)] });
    expect(codes(p!.errors)).toEqual(["no_rules"]);
  });

  it("refusals passed in fail the draft from the start", () => {
    const refused = new Map([[CORE_ENTRY_IDS.tailwind, [{ code: "scenario_failed" as const, path: ["scenarios"], message: "red" }]]]);
    const [p] = planPublish({ candidates: [candidate("tailwind")], published: nothingPublished, packmates: [], refused });
    expect(codes(p!.errors)).toEqual(["scenario_failed"]);
    expect(p!.hash).toBeNull();
  });

  it("other entries a scenario names play the documents `docs` hands over", async () => {
    const withSalve = {
      ...docOf("tailwind"),
      scenarios: [
        {
          title: { ru: "Мазь не трогает бонусы" },
          given: { holder: { carries: [{ entry: "self" as const }, { entry: { entry: CORE_ENTRY_IDS.cleansing_salve } }] } },
          steps: [{ do: "use" as const, item: { entry: CORE_ENTRY_IDS.cleansing_salve }, expect: { holder: [{ entry: "self" as const, count: 1 }] } }],
        },
      ],
    };
    const facts = (id: string) => (id === CORE_ENTRY_IDS.cleansing_salve ? factsOfDoc(id, docOf("cleansing_salve")) : null);
    const missing = await plan(withSalve, { published: facts });
    expect(codes(missing[0]!.errors)).toEqual(["scenario_broken"]);
    const found = await plan(withSalve, {
      published: facts,
      docs: (id) => (id === CORE_ENTRY_IDS.cleansing_salve ? docOf("cleansing_salve") : null),
    });
    expect(found[0]!.errors).toEqual([]);
  });
});
