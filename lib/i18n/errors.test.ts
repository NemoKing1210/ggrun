import { describe, expect, it } from "vitest";

import { errorText } from "./errors";

const errors = {
  formUnknown: "Something went wrong",
  season_locked: "Season {name} is locked",
};

describe("errorText", () => {
  it("returns the known code's template with params interpolated", () => {
    expect(errorText(errors, "season_locked", { name: "run-1" })).toBe(
      "Season run-1 is locked",
    );
    expect(errorText({ e: "{a}-{b}" }, "e", { a: "x", b: "y" })).toBe("x-y");
  });

  it("leaves a placeholder without a matching param intact", () => {
    expect(errorText({ e: "Season {season}" }, "e")).toBe("Season {season}");
  });

  it("falls back to formUnknown for an unknown code", () => {
    expect(errorText(errors, "nope")).toBe("Something went wrong");
  });

  it("returns the code itself when there is no formUnknown fallback", () => {
    expect(errorText({ known: "K" }, "missing_code", { x: "1" })).toBe(
      "missing_code",
    );
  });

  it("treats an empty template as missing and falls back", () => {
    expect(errorText({ broken: "", formUnknown: "Fallback" }, "broken")).toBe(
      "Fallback",
    );
    expect(errorText({ broken: "" }, "broken")).toBe("broken");
  });
});
