/**
 * In-process realtime counters — the observability half of `socket-server.ts`.
 *
 * Dependency-free on purpose (importable from the socket server, a future
 * admin metrics route, and unit tests). All mutations go through `count`,
 * reads through `snapshot`; `resetRealtimeMetrics` exists for tests only.
 */

export type RealtimeMetricName =
  | "connections"
  | "disconnects"
  | "joins"
  | "joinDenied"
  | "leaves"
  | "typingRelayed"
  | "typingDropped"
  | "published"
  | "presenceUpdates";

export type RealtimeMetricsSnapshot = Record<RealtimeMetricName, number>;

const counters: RealtimeMetricsSnapshot = {
  connections: 0,
  disconnects: 0,
  joins: 0,
  joinDenied: 0,
  leaves: 0,
  typingRelayed: 0,
  typingDropped: 0,
  published: 0,
  presenceUpdates: 0,
};

export function count(metric: RealtimeMetricName, by = 1): void {
  counters[metric] += by;
}

export function snapshotRealtimeMetrics(): RealtimeMetricsSnapshot {
  return { ...counters };
}

export function resetRealtimeMetrics(): void {
  for (const key of Object.keys(counters) as RealtimeMetricName[]) {
    counters[key] = 0;
  }
}
