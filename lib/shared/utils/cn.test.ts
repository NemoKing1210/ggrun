import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy string arguments with a space", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy arguments", () => {
    expect(cn("a", false, null, undefined, 0, "", "b")).toBe("a b");
  });

  it("flattens arrays and resolves object conditions", () => {
    expect(cn("a", ["b", { c: true, d: false }])).toBe("a b c");
  });

  it("returns an empty string for no input", () => {
    expect(cn()).toBe("");
    expect(cn(false, null)).toBe("");
  });

  it("lets the last conflicting tailwind class win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("keeps a conditional class that overrides an earlier one", () => {
    const active = true;
    expect(cn("bg-red-500", active && "bg-blue-500")).toBe("bg-blue-500");
    expect(cn("px-2", "px-4", "py-1")).toBe("px-4 py-1");
  });
});
