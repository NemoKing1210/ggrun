import { describe, expect, it } from "vitest";

import { PLAYER_STATUSES, SEASON_STATUSES } from "@/lib/shared/admin-console/spec";
import {
  PLAYER_STATUS_VARIANT,
  SEASON_STATUS_VARIANT,
  type StatusVariant,
} from "./status-variants";

const VARIANTS: readonly StatusVariant[] = ["military", "amber", "danger", "dim", "neutral"];

describe("SEASON_STATUS_VARIANT", () => {
  it("maps every season status to exactly one variant", () => {
    expect(Object.keys(SEASON_STATUS_VARIANT).sort()).toEqual([...SEASON_STATUSES].sort());
  });

  it("locks each season status to its documented colour", () => {
    expect(SEASON_STATUS_VARIANT).toEqual({
      draft: "dim",
      active: "military",
      paused: "amber",
      finished: "neutral",
      archived: "dim",
    });
  });

  it("only uses known variants", () => {
    for (const variant of Object.values(SEASON_STATUS_VARIANT)) {
      expect(VARIANTS).toContain(variant);
    }
  });
});

describe("PLAYER_STATUS_VARIANT", () => {
  it("maps every player status to exactly one variant", () => {
    expect(Object.keys(PLAYER_STATUS_VARIANT).sort()).toEqual([...PLAYER_STATUSES].sort());
  });

  it("locks each player status to its documented colour", () => {
    expect(PLAYER_STATUS_VARIANT).toEqual({
      active: "military",
      finished: "amber",
      eliminated: "danger",
      withdrawn: "dim",
    });
  });

  it("only uses known variants", () => {
    for (const variant of Object.values(PLAYER_STATUS_VARIANT)) {
      expect(VARIANTS).toContain(variant);
    }
  });
});

describe("finished semantics", () => {
  it("colours a finished season and a finished player differently", () => {
    expect(SEASON_STATUS_VARIANT.finished).toBe("neutral");
    expect(PLAYER_STATUS_VARIANT.finished).toBe("amber");
    expect(SEASON_STATUS_VARIANT.finished).not.toBe(PLAYER_STATUS_VARIANT.finished);
  });
});
