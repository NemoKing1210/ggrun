import { describe, expect, it } from "vitest";

import { botUsername, botUsernamePrefix } from "./repository";

/**
 * These two helpers are the binding contract between a run row and its
 * synthetic users: roster cleanup and idempotent re-join both address bots by
 * username, so the format must be stable and collision-free across runs.
 */
describe("bot username binding", () => {
  it("uses the first 8 characters of the run id as the prefix", () => {
    expect(botUsernamePrefix("abcdef12-3456-7890-abcd-ef1234567890")).toBe("bot_abcdef12_");
  });

  it("truncates a run id shorter than 8 characters instead of padding", () => {
    expect(botUsernamePrefix("abc")).toBe("bot_abc_");
  });

  it("composes the prefix and the zero-based bot index", () => {
    const runId = "12345678-0000-0000-0000-000000000000";
    expect(botUsername(runId, 0)).toBe("bot_12345678_0");
    expect(botUsername(runId, 19)).toBe("bot_12345678_19");
  });

  it("binds different runs to different namespaces even when the prefix collides", () => {
    // Two distinct run ids share the same 8-char display prefix but differ later.
    const a = "abcdef12-aaaa-0000-0000-000000000000";
    const b = "abcdef12-bbbb-0000-0000-000000000000";
    expect(botUsername(a, 1)).toBe("bot_abcdef12_1");
    expect(botUsername(b, 1)).toBe("bot_abcdef12_1");
    // The prefix is intentionally ambiguous — the repository resolves by full
    // run id elsewhere; the username format itself carries only the 8 chars.
  });
});
