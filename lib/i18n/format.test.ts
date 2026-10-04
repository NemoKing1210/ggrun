import { describe, expect, it } from "vitest";

import { format } from "./format";

describe("format", () => {
  it("replaces a placeholder with its matching param", () => {
    expect(format("Season {season}", { season: "run-1" })).toBe("Season run-1");
  });

  it("stringifies numeric params, including zero", () => {
    expect(format("Rolled {n} of {sides}", { n: 3, sides: 6 })).toBe("Rolled 3 of 6");
    expect(format("{n}", { n: 0 })).toBe("0");
  });

  it("replaces every occurrence of a repeated placeholder", () => {
    expect(format("{x}+{x}={x}", { x: "a" })).toBe("a+a=a");
  });

  it("leaves a placeholder whose param is missing untouched", () => {
    expect(format("Season {season}", {})).toBe("Season {season}");
    expect(format("{a} {b}", { a: "x" })).toBe("x {b}");
  });

  it("returns the template unchanged when it has no placeholders", () => {
    expect(format("No params here", { unused: "x" })).toBe("No params here");
  });

  it("does not treat non-word braces as placeholders", () => {
    expect(format("{a-b} { } {}", { "a-b": "x" })).toBe("{a-b} { } {}");
  });

  it("substitutes an empty-string param rather than dropping the placeholder", () => {
    expect(format("[{value}]", { value: "" })).toBe("[]");
  });
});
