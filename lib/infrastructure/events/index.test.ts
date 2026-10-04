import { describe, expect, it } from "vitest";

import { AUDIT_PERIOD_HOURS } from "./index";

describe("AUDIT_PERIOD_HOURS", () => {
  it("maps each preset to its hour span", () => {
    expect(AUDIT_PERIOD_HOURS["24h"]).toBe(24);
    expect(AUDIT_PERIOD_HOURS["7d"]).toBe(24 * 7);
    expect(AUDIT_PERIOD_HOURS["30d"]).toBe(24 * 30);
  });

  it("exposes exactly the non-'all' presets that carry a time filter", () => {
    expect(Object.keys(AUDIT_PERIOD_HOURS).sort()).toEqual(["24h", "30d", "7d"]);
  });
});
