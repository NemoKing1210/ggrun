/**
 * In-process realtime counters — the observability half of `socket-server.ts`.
 *
 * Dependency-free on purpose (importable from the socket server, the admin
 * console diagnostics and unit tests). All mutations go through `count`, reads
 * through `snapshot`; `resetRealtimeMetrics` exists for tests only.
 *
 * The counters live on `globalThis`, not in a module-level object: `server.ts`
 * (tsx) and the Next.js server bundle are separate module registries in the
 * same process, so a plain `const` would give the admin console a second,
 * always-zero copy. Same trick as the realtime bus.
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

const METRICS_KEY = "__ggrun_realtime_metrics__";

function store(): RealtimeMetricsSnapshot {
  const g = globalThis as unknown as { [METRICS_KEY]?: RealtimeMetricsSnapshot };
  if (!g[METRICS_KEY]) {
    g[METRICS_KEY] = {
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
  }
  return g[METRICS_KEY];
}

export function count(metric: RealtimeMetricName, by = 1): void {
  store()[metric] += by;
}

export function snapshotRealtimeMetrics(): RealtimeMetricsSnapshot {
  return { ...store() };
}

export function resetRealtimeMetrics(): void {
  const counters = store();
  for (const key of Object.keys(counters) as RealtimeMetricName[]) {
    counters[key] = 0;
  }
}
