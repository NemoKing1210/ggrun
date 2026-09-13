import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { log } from "@/lib/infrastructure/logger";
import { BotError } from "@/lib/modules/bots/errors";
import { tickBotRunSystem, tickDueRuns } from "@/lib/modules/bots/service";

/**
 * Autonomous bot ticker: ticks every `running` run whose own cadence came
 * due — no open admin page needed. Called by any external scheduler
 * (systemd timer, k8s CronJob, Vercel Cron, Docker sidecar `curl`, …).
 *
 *   curl -X POST "$APP_URL/api/bots/tick" -H "Authorization: Bearer $CRON_SECRET"
 *
 * Optional JSON body: `{ "runId": "<uuid>" }` ticks one run immediately,
 * `{ "force": true }` ticks all running runs ignoring their cadence.
 * Console start/pause/stop keeps working: it flips the same `status` column
 * this ticker reads. Overlap between concurrent callers is refused per run
 * (Postgres advisory lock) and reported as `ticked: false`.
 */
export const dynamic = "force-dynamic";

function hasValidBearer(req: Request, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!hasValidBearer(req, secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  let body: { runId?: unknown; force?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    if (typeof body.runId === "string" && body.runId.length > 0) {
      const summary = await tickBotRunSystem(body.runId, "cron");
      return NextResponse.json(
        { runs: [{ runId: body.runId, ticked: true, summary }] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const runs = await tickDueRuns({ force: body.force === true, triggeredBy: "cron" });
    return NextResponse.json({ runs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BotError) {
      return NextResponse.json({ error: e.code }, { status: 422 });
    }
    log.error("bots.cron.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
