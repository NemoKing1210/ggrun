import { describe, expect, it } from "vitest";

import { AUDIT_ROOM, CHAT_ROOM, parseSeasonRoom, seasonRoom } from "./protocol";

describe("seasonRoom", () => {
  it("namespaces the room by season id", () => {
    expect(seasonRoom("abc")).toBe("season:abc");
  });
});

describe("parseSeasonRoom", () => {
  it("round-trips rooms built by seasonRoom", () => {
    expect(parseSeasonRoom(seasonRoom("season-1"))).toBe("season-1");
  });

  it("accepts uuids, digits, dashes and underscores", () => {
    expect(parseSeasonRoom("season:687a5e41-b2c8-46e5-9f1a-489ec99232c9")).toBe(
      "687a5e41-b2c8-46e5-9f1a-489ec99232c9",
    );
    expect(parseSeasonRoom("season:A_1-2")).toBe("A_1-2");
  });

  it("rejects anything that is not a season room", () => {
    expect(parseSeasonRoom(CHAT_ROOM)).toBeNull();
    expect(parseSeasonRoom(AUDIT_ROOM)).toBeNull();
    expect(parseSeasonRoom("season:")).toBeNull();
    expect(parseSeasonRoom("season:two:rooms")).toBeNull();
    expect(parseSeasonRoom("season:has space")).toBeNull();
    expect(parseSeasonRoom("season:has.dot")).toBeNull();
    expect(parseSeasonRoom("")).toBeNull();
    expect(parseSeasonRoom("season:" + "x".repeat(65))).toBeNull();
  });
});
