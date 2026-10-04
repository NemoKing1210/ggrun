import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bucketForDiff,
  diffSince,
  isOnline,
  LAST_SEEN_THROTTLE_MS,
  ONLINE_THRESHOLD_MS,
} from "./presence";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("presence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports the documented thresholds", () => {
    expect(ONLINE_THRESHOLD_MS).toBe(5 * MINUTE);
    expect(LAST_SEEN_THROTTLE_MS).toBe(2 * MINUTE);
  });

  describe("isOnline", () => {
    it("treats a missing timestamp as offline", () => {
      expect(isOnline(null)).toBe(false);
      expect(isOnline(undefined)).toBe(false);
    });

    it("treats an unparseable timestamp as offline", () => {
      expect(isOnline("not-a-date")).toBe(false);
    });

    it("is online just inside the threshold and offline at it", () => {
      expect(isOnline(new Date(NOW - ONLINE_THRESHOLD_MS + 1))).toBe(true);
      expect(isOnline(new Date(NOW - ONLINE_THRESHOLD_MS))).toBe(false);
    });

    it("accepts a date string as well as a Date", () => {
      expect(isOnline(new Date(NOW - MINUTE).toISOString())).toBe(true);
    });
  });

  describe("diffSince", () => {
    it("returns null for missing or invalid timestamps", () => {
      expect(diffSince(null)).toBeNull();
      expect(diffSince(undefined)).toBeNull();
      expect(diffSince("nonsense")).toBeNull();
    });

    it("returns the elapsed milliseconds", () => {
      expect(diffSince(new Date(NOW - 1500))).toBe(1500);
      expect(diffSince(new Date(NOW - 1500).toISOString())).toBe(1500);
    });

    it("returns a negative diff for a future timestamp", () => {
      expect(diffSince(new Date(NOW + 1000))).toBe(-1000);
    });
  });

  describe("bucketForDiff", () => {
    it("returns null for a null diff", () => {
      expect(bucketForDiff(null)).toBeNull();
    });

    it("buckets the first minute as justNow", () => {
      expect(bucketForDiff(0)).toEqual({ bucket: "justNow", value: 0 });
      expect(bucketForDiff(MINUTE - 1)).toEqual({ bucket: "justNow", value: 0 });
    });

    it("buckets under an hour as minutes", () => {
      expect(bucketForDiff(MINUTE)).toEqual({ bucket: "minutes", value: 1 });
      expect(bucketForDiff(HOUR - 1)).toEqual({ bucket: "minutes", value: 59 });
    });

    it("buckets under a day as hours", () => {
      expect(bucketForDiff(HOUR)).toEqual({ bucket: "hours", value: 1 });
      expect(bucketForDiff(DAY - 1)).toEqual({ bucket: "hours", value: 23 });
    });

    it("buckets under a week as days", () => {
      expect(bucketForDiff(DAY)).toEqual({ bucket: "days", value: 1 });
      expect(bucketForDiff(7 * DAY - 1)).toEqual({ bucket: "days", value: 6 });
    });

    it("buckets a week or more as an absolute date value", () => {
      expect(bucketForDiff(7 * DAY)).toEqual({ bucket: "date", value: 7 * DAY });
    });
  });
});
