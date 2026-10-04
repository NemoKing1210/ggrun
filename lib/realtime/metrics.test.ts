import { describe, expect, it } from "vitest";

import {
  count,
  resetRealtimeMetrics,
  snapshotRealtimeMetrics,
} from "./metrics";

describe("realtime metrics", () => {
  it("accumulates and snapshots counters", () => {
    resetRealtimeMetrics();
    count("connections");
    count("joins", 2);
    count("joinDenied");
    expect(snapshotRealtimeMetrics()).toMatchObject({
      connections: 1,
      joins: 2,
      joinDenied: 1,
    });
  });

  it("resets to zero", () => {
    count("published");
    resetRealtimeMetrics();
    expect(snapshotRealtimeMetrics()).toMatchObject({
      connections: 0,
      joins: 0,
      published: 0,
    });
  });
});
