import { describe, expect, it } from "vitest";
import { NOTIFICATION_KINDS, NOTIFICATION_TEMPLATES } from "./registry";

const T = NOTIFICATION_TEMPLATES;

describe("NOTIFICATION_TEMPLATES — kind identity", () => {
  it("exposes exactly the template keys as the published kind list", () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual(Object.keys(NOTIFICATION_TEMPLATES).sort());
  });

  it("every template's kind matches the record key it lives under", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(NOTIFICATION_TEMPLATES[kind].kind).toBe(kind);
    }
  });
});

describe("dedupeKeyOf — season-scoped kinds", () => {
  it("keys off the season id, and dedupes nothing without one", () => {
    expect(T.player_added.dedupeKeyOf({ seasonId: "s1" })).toBe("player:added:s1");
    expect(T.player_removed.dedupeKeyOf({ seasonId: "s1" })).toBe("player:removed:s1");
    expect(T.season_started.dedupeKeyOf({ seasonId: "s1" })).toBe("season:started:s1");
    expect(T.player_added.dedupeKeyOf({})).toBeNull();
    expect(T.player_removed.dedupeKeyOf({})).toBeNull();
    expect(T.season_started.dedupeKeyOf({})).toBeNull();
  });
});

describe("dedupeKeyOf — request-scoped kinds", () => {
  it("prefers the request id to the roll id", () => {
    expect(T.reroll_requested.dedupeKeyOf({ requestId: "r1", rollId: "roll1" })).toBe(
      "reroll:requested:r1",
    );
    expect(T.completion_requested.dedupeKeyOf({ requestId: "r1", rollId: "roll1" })).toBe(
      "completion:requested:r1",
    );
  });

  it("falls back to the roll id when there is no request yet", () => {
    expect(T.reroll_requested.dedupeKeyOf({ rollId: "roll1" })).toBe("reroll:requested:roll:roll1");
    expect(T.completion_requested.dedupeKeyOf({ rollId: "roll1" })).toBe(
      "completion:requested:roll:roll1",
    );
  });

  it("dedupes nothing when neither id is present", () => {
    expect(T.reroll_requested.dedupeKeyOf({})).toBeNull();
    expect(T.completion_requested.dedupeKeyOf({})).toBeNull();
  });

  it("keys each verdict by the request it answers, and nothing without one", () => {
    expect(T.reroll_approved.dedupeKeyOf({ requestId: "r1" })).toBe("reroll:approved:r1");
    expect(T.reroll_rejected.dedupeKeyOf({ requestId: "r1" })).toBe("reroll:rejected:r1");
    expect(T.completion_approved.dedupeKeyOf({ requestId: "r1" })).toBe("completion:approved:r1");
    expect(T.completion_rejected.dedupeKeyOf({ requestId: "r1" })).toBe("completion:rejected:r1");
    expect(T.reroll_approved.dedupeKeyOf({})).toBeNull();
    expect(T.reroll_rejected.dedupeKeyOf({ requestId: null })).toBeNull();
    expect(T.completion_approved.dedupeKeyOf({ requestId: null })).toBeNull();
    expect(T.completion_rejected.dedupeKeyOf({})).toBeNull();
  });
});

describe("dedupeKeyOf — kinds that never dedupe", () => {
  it("player_adjusted is idempotent-free even with a season in hand", () => {
    expect(T.player_adjusted.dedupeKeyOf({ seasonId: "s1" })).toBeNull();
  });

  it("admin_broadcast is personal correspondence, never deduped", () => {
    expect(T.admin_broadcast.dedupeKeyOf({ seasonId: "s1", requestId: "r1", rollId: "roll1" })).toBeNull();
  });
});
