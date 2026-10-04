import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { ModerationConfigSchema } from "./moderation";

describe("ModerationConfigSchema", () => {
  it("defaults completion approval to off, like the season default", () => {
    expect(ModerationConfigSchema.parse({})).toEqual({
      completionRequireApproval: DEFAULT_SEASON_CONFIG.moderation.completionRequireApproval,
    });
    expect(ModerationConfigSchema.parse({})).toEqual({ completionRequireApproval: false });
  });

  it("lets the host require approval", () => {
    expect(ModerationConfigSchema.parse({ completionRequireApproval: true })).toEqual({
      completionRequireApproval: true,
    });
  });

  it("rejects a non-boolean", () => {
    expect(() => ModerationConfigSchema.parse({ completionRequireApproval: "yes" })).toThrow();
  });
});
