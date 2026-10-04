import { describe, expect, it } from "vitest";

import type { FeedRow } from "@/lib/modules/season/repository/players";

import { isSerializedFeedRows, serializeFeedRows } from "./feed-wire";

const row = (over: Partial<FeedRow> = {}): FeedRow => ({
  id: "e1",
  seasonId: "s1",
  seasonPlayerId: null,
  eventType: "game_rolled",
  payload: { title: "Doom" },
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
  lastSeenAt: null,
  ...over,
});

describe("serializeFeedRows", () => {
  it("turns the two Date columns into ISO strings so rows survive the RSC boundary", () => {
    const out = serializeFeedRows([
      row({
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
        lastSeenAt: new Date("2026-02-03T04:05:06.000Z"),
      }),
    ]);
    expect(out[0].createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect(out[0].lastSeenAt).toBe("2026-02-03T04:05:06.000Z");
  });

  it("keeps a never-seen user as null rather than inventing a date", () => {
    expect(serializeFeedRows([row({ lastSeenAt: null })])[0].lastSeenAt).toBeNull();
  });

  it("preserves every non-date column untouched", () => {
    const out = serializeFeedRows([row({ eventType: "moved", payload: { position: 7 } })]);
    expect(out[0]).toMatchObject({
      id: "e1",
      seasonId: "s1",
      eventType: "moved",
      payload: { position: 7 },
      username: "ada",
      displayName: "Ada",
      avatarUrl: null,
    });
  });

  it("maps an empty feed to an empty list", () => {
    expect(serializeFeedRows([])).toEqual([]);
  });
});

describe("isSerializedFeedRows", () => {
  it("accepts an empty list", () => {
    expect(isSerializedFeedRows([])).toBe(true);
  });

  it("accepts rows carrying at least an id and an ISO createdAt", () => {
    expect(
      isSerializedFeedRows([{ id: "e1", createdAt: "2026-01-02T03:04:05.000Z", extra: 1 }]),
    ).toBe(true);
  });

  it("rejects anything that is not an array", () => {
    expect(isSerializedFeedRows(null)).toBe(false);
    expect(isSerializedFeedRows({ id: "e1" })).toBe(false);
    expect(isSerializedFeedRows("[]")).toBe(false);
  });

  it("rejects a null or primitive element", () => {
    expect(isSerializedFeedRows([null])).toBe(false);
    expect(isSerializedFeedRows([42])).toBe(false);
  });

  it("requires a string id and a string createdAt on every row", () => {
    expect(isSerializedFeedRows([{ createdAt: "2026-01-02T03:04:05.000Z" }])).toBe(false);
    expect(isSerializedFeedRows([{ id: 1, createdAt: "2026-01-02T03:04:05.000Z" }])).toBe(false);
    expect(isSerializedFeedRows([{ id: "e1" }])).toBe(false);
    expect(isSerializedFeedRows([{ id: "e1", createdAt: 7 }])).toBe(false);
  });

  it("rejects the whole list when a single later row is malformed", () => {
    const ok = { id: "e1", createdAt: "2026-01-02T03:04:05.000Z" };
    expect(isSerializedFeedRows([ok, { id: "e2" }])).toBe(false);
  });

  it("does not accept raw rows whose createdAt is still a Date", () => {
    expect(isSerializedFeedRows([row()])).toBe(false);
  });
});
