import { describe, expect, it } from "vitest";

import { referencedEntries } from "./refs";

const A = "2b7a7198-9e78-44b6-9038-22c167cc5810";
const B = "d010558f-1f33-4da4-96b9-53e2596f8d16";

describe("referencedEntries", () => {
  it("finds entry references in actions and conditions, each once, in order", () => {
    const doc = {
      rules: [
        { when: "onUse", do: [{ op: "grantEffect", entry: { entry: A, slug: "a" }, to: "target" }] },
        {
          when: "onOutcome",
          if: [{ op: "hasEntry", who: "self", entry: { entry: B } }],
          do: [{ op: "grantItem", entry: { entry: A }, to: "self" }],
        },
      ],
    };
    expect(referencedEntries(doc)).toEqual([A, B]);
  });

  it("reads only the rules — a uuid elsewhere in the card is not a reference", () => {
    expect(referencedEntries({ name: { ru: A }, flavor: { entry: A }, rules: [] })).toEqual([]);
  });

  it("ignores objects that only look like references", () => {
    const doc = {
      rules: [
        {
          when: "onUse",
          do: [
            { op: "x", entry: { entry: "not-a-uuid" } },
            { op: "x", entry: { entry: A, extra: 1 } },
            { op: "x", entry: { entry: 42 } },
            { op: "x", entry: { entry: A, slug: 7 } },
          ],
        },
      ],
    };
    expect(referencedEntries(doc)).toEqual([]);
  });

  it("normalises the case of an id", () => {
    expect(referencedEntries({ rules: [{ do: [{ entry: { entry: A.toUpperCase() } }] }] })).toEqual([A]);
  });

  it("survives anything that is not a document", () => {
    expect(referencedEntries(null)).toEqual([]);
    expect(referencedEntries("rules")).toEqual([]);
    expect(referencedEntries({})).toEqual([]);
  });
});
