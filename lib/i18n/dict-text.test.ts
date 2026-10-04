import { describe, expect, it } from "vitest";

import type { Dictionary } from "@/lib/i18n/dictionaries";

import { dictText } from "./dict-text";

const t = {
  a: { b: { c: "hello" } },
  top: "world",
  num: 5,
  nul: null,
} as unknown as Dictionary;

describe("dictText", () => {
  it("walks a dotted path to its string leaf", () => {
    expect(dictText(t, "a.b.c")).toBe("hello");
    expect(dictText(t, "top")).toBe("world");
  });

  it("returns the path itself when a segment is missing", () => {
    expect(dictText(t, "a.b.missing")).toBe("a.b.missing");
    expect(dictText(t, "nope.deep")).toBe("nope.deep");
  });

  it("returns the path when the resolved leaf is not a string", () => {
    expect(dictText(t, "a.b")).toBe("a.b");
    expect(dictText(t, "num")).toBe("num");
  });

  it("returns the path when traversal hits a non-object before the last segment", () => {
    expect(dictText(t, "top.deeper")).toBe("top.deeper");
    expect(dictText(t, "nul.deeper")).toBe("nul.deeper");
  });

  it("returns the empty path unchanged", () => {
    expect(dictText(t, "")).toBe("");
  });
});
