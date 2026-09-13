/**
 * Autonomous bot ticker — one shot over due `running` runs.
 * Usage:
 *   pnpm bots:tick            # tick runs whose cadence came due
 *   pnpm bots:tick --force     # tick all running runs now
 *
 * Same steps as the admin console tick, minus the staff session: safe to run
 * from any OS scheduler every 10–30s (systemd timer, Task Scheduler, cron).
 * For HTTP setups use POST /api/bots/tick with CRON_SECRET instead.
 */
import "./lib/load-env";

import { tickDueRuns } from "@/lib/modules/bots/service";

async function main() {
  const force = process.argv.includes("--force");
  const results = await tickDueRuns({ force, triggeredBy: "cron:cli" });
  const ticked = results.filter((r) => r.ticked).length;
  for (const r of results) {
    if (r.ticked) {
      console.log(
        `ticked ${r.runId.slice(0, 8)}: ${r.summary?.actions ?? 0} actions, ${r.summary?.errors ?? 0} errors` +
          (r.summary?.lastError ? ` — last: ${r.summary.lastError}` : ""),
      );
    } else {
      console.log(`skipped ${r.runId.slice(0, 8)} (${r.reason ?? "unknown"})`);
    }
  }
  if (results.length === 0) console.log("no running bot runs");
  else console.log(`${ticked}/${results.length} runs ticked`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
