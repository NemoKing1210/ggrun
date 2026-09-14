"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { format } from "@/lib/i18n/format";
import {
  BotsRunCard,
  type BotsText,
  type ConsoleBotLog,
  type ConsoleBotRun,
  type ConsoleRosterRow,
} from "@/components/admin/BotsRunCard";
import {
  createBotRunAction,
  pauseBotRunAction,
  resumeBotRunAction,
  restartBotRunAction,
  stopBotRunAction,
  tickBotsAction,
  type BotTickState,
} from "@/lib/modules/bots/actions";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Range } from "@/components/ui/Range";
import { Switch } from "@/components/ui/Switch";

function runForm(runId: string): FormData {
  const fd = new FormData();
  fd.set("runId", runId);
  return fd;
}

export function BotsConsole({
  seasonId,
  seasonActive,
  runs,
  logs,
  rosters,
  playerStatusLabels,
  t,
}: {
  seasonId: string;
  seasonActive: boolean;
  runs: ConsoleBotRun[];
  logs: ConsoleBotLog[];
  rosters: Record<string, ConsoleRosterRow[]>;
  playerStatusLabels: Record<string, string>;
  t: BotsText;
}) {
  const router = useRouter();
  const [createState, createAction, createPending] = useActionState(createBotRunAction, {});
  const [busy, startBusy] = useTransition();

  const loopOn = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  function clearLoop() {
    loopOn.current = false;
    clearTimeout(timer.current);
    timer.current = undefined;
  }
  // --- create-form controls (Ranges/Switches are client state) ---
  const [botCount, setBotCount] = useState(3);
  const [actionsPerTick, setActionsPerTick] = useState(2);
  const [tickIntervalMs, setTickIntervalMs] = useState(2000);
  const [passWeight, setPassWeight] = useState(70);
  const [dropWeight, setDropWeight] = useState(20);
  const [rerollWeight, setRerollWeight] = useState(10);
  const [enableRoll, setEnableRoll] = useState(true);
  const [enableResolve, setEnableResolve] = useState(true);
  const [stopOnError, setStopOnError] = useState(false);

  // --- ticking loop (one run at a time; ticks are server action calls) ---
  const [tickingId, setTickingId] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<{ runId: string; actions: number; errors: number } | null>(null);
  const [tickError, setTickError] = useState<string | null>(null);
  /** Interval the active loop ticks on — drives the countdown bar. */
  const [loopIntervalMs, setLoopIntervalMs] = useState<number | null>(null);
  /** Bumps on every completed tick — restarts the countdown bar. */
  const [tickCycle, setTickCycle] = useState(0);

  function stopLoopUi() {
    clearLoop();
    setTickingId(null);
    setLoopIntervalMs(null);
  }

  useEffect(() => () => clearLoop(), []);

  // Live log feed while a run ticks (server re-render, client state kept).
  useEffect(() => {
    if (!tickingId) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [tickingId, router]);

  useEffect(() => {
    if (createState.ok) router.refresh();
  }, [createState.ok, router]);

  async function loopTick(runId: string, intervalMs: number) {
    if (!loopOn.current) return;
    let res: BotTickState;
    try {
      res = await tickBotsAction(runForm(runId));
    } catch {
      setTickError("tick failed");
      setTickCycle((n) => n + 1);
      stopLoopUi();
      router.refresh();
      return;
    }
    if (!loopOn.current) return;
    setTickCycle((n) => n + 1);
    if (res.error) {
      setTickError(res.error);
      stopLoopUi();
      router.refresh();
      return;
    }
    setLastTick({ runId, actions: res.actions ?? 0, errors: res.errors ?? 0 });
    setTickError(null);
    router.refresh();
    if (res.stopped) {
      stopLoopUi();
      return;
    }
    timer.current = window.setTimeout(() => void loopTick(runId, intervalMs), intervalMs);
  }

  function startRun(run: ConsoleBotRun) {
    if (tickingId) return;
    setTickError(null);
    startBusy(async () => {
      await resumeBotRunAction(runForm(run.id));
      setTickingId(run.id);
      setLoopIntervalMs(run.config.tickIntervalMs);
      loopOn.current = true;
      router.refresh();
      void loopTick(run.id, run.config.tickIntervalMs);
    });
  }

  function restartRun(run: ConsoleBotRun) {
    if (tickingId) return;
    setTickError(null);
    startBusy(async () => {
      await restartBotRunAction(runForm(run.id));
      setTickingId(run.id);
      setLoopIntervalMs(run.config.tickIntervalMs);
      loopOn.current = true;
      router.refresh();
      void loopTick(run.id, run.config.tickIntervalMs);
    });
  }

  function pauseRun(runId: string) {
    stopLoopUi();
    startBusy(async () => {
      await pauseBotRunAction(runForm(runId));
      router.refresh();
    });
  }

  function stopRun(runId: string) {
    stopLoopUi();
    startBusy(async () => {
      await stopBotRunAction(runForm(runId));
      router.refresh();
    });
  }

  function stepRun(runId: string) {
    if (tickingId) return;
    setTickError(null);
    startBusy(async () => {
      const res = await tickBotsAction(runForm(runId));
      if (res.error) setTickError(res.error);
      else setLastTick({ runId, actions: res.actions ?? 0, errors: res.errors ?? 0 });
      router.refresh();
    });
  }

  type ConsoleTab = "runs" | "logs" | "stats";
  const [tab, setTab] = useState<ConsoleTab>("runs");

  // --- log viewer filter ---
  const [logRun, setLogRun] = useState<string>("all");
  const [logLevel, setLogLevel] = useState<string>("all");
  const [logAction, setLogAction] = useState<string>("all");
  const [logQuery, setLogQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function viewLogs(runId: string) {
    setLogRun(runId);
    setTab("logs");
  }

  function payloadText(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
    return null;
  }

  const logActions = [...new Set(logs.map((l) => l.action))].sort().slice(0, 12);
  const query = logQuery.trim().toLowerCase();
  const visibleLogs = logs.filter(
    (l) =>
      (logRun === "all" || l.runId === logRun) &&
      (logLevel === "all" || l.level === logLevel) &&
      (logAction === "all" || l.action === logAction) &&
      (query.length === 0 ||
        l.message.toLowerCase().includes(query) ||
        (l.botUsername ?? "").toLowerCase().includes(query) ||
        (payloadText(l.payload, "errorCode") ?? "").toLowerCase().includes(query)),
  );

  // --- stats from the loaded trace ---
  function countBy(get: (l: ConsoleBotLog) => string | null): Array<[string, number]> {
    const counts: Record<string, number> = {};
    for (const l of logs) {
      const key = get(l);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }
  const statsByAction = countBy((l) => l.action);
  const statsByError = countBy((l) => (l.level === "error" ? (payloadText(l.payload, "errorCode") ?? l.action) : null));
  const statsByBot = countBy((l) => (l.level === "info" ? (l.botUsername ?? null) : null)).slice(0, 10);
  const statsMax = Math.max(1, ...statsByAction.map(([, n]) => n), ...statsByError.map(([, n]) => n), ...statsByBot.map(([, n]) => n));

  return (
    <div className="flex flex-col gap-6">
      {!seasonActive && (
        <p role="alert" className="hud-card border-danger/60 p-4 font-mono text-xs uppercase tracking-widest text-danger">
          {t.seasonNotActive}
        </p>
      )}

      <nav className="flex flex-wrap items-stretch gap-1 border-b border-[#3d3d34]" role="tablist" aria-label="bots console">
        {(
          [
            { key: "runs", label: t.tabsRuns },
            { key: "logs", label: t.tabsLogs },
            { key: "stats", label: t.tabsStats },
          ] as Array<{ key: ConsoleTab; label: string }>
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-display text-xs uppercase tracking-widest transition-colors ${
              tab === key
                ? "border-amber bg-amber/10 text-amber"
                : "border-transparent text-zinc-400 hover:border-amber/40 hover:text-amber"
            }`}
          >
            {label}
            {key === "logs" && logs.length > 0 && (
              <span className="inline-flex min-w-[20px] items-center justify-center border border-[#3d3d34] bg-[#1a1a1a] px-1 py-px font-mono text-[10px] leading-none text-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
                {logs.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "runs" && (
        <>
      <section className="hud-card p-4 sm:p-6">
        <h2 className="font-display text-sm uppercase tracking-widest text-amber">{t.createHeading}</h2>
        <form action={createAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="seasonId" value={seasonId} />
          <Field label={t.botCountLabel}>
            <Input
              type="number"
              name="botCount"
              min={1}
              max={20}
              value={botCount}
              onChange={(e) => setBotCount(Number(e.target.value))}
              required
            />
          </Field>
          <Field label={t.actionsPerTickLabel}>
            <Input
              type="number"
              name="actionsPerTick"
              min={1}
              max={10}
              value={actionsPerTick}
              onChange={(e) => setActionsPerTick(Number(e.target.value))}
              required
            />
          </Field>
          <Field label={format(t.speedLabel, { ms: tickIntervalMs })}>
            <Range
              name="tickIntervalMs"
              min={250}
              max={10000}
              step={250}
              value={tickIntervalMs}
              onChange={(e) => setTickIntervalMs(Number(e.target.value))}
            />
          </Field>
          <div className="flex flex-col gap-3">
            <Field label={`${t.passWeightLabel}: ${passWeight}`}>
              <Range name="passWeight" min={0} max={100} value={passWeight} onChange={(e) => setPassWeight(Number(e.target.value))} />
            </Field>
            <Field label={`${t.dropWeightLabel}: ${dropWeight}`}>
              <Range name="dropWeight" min={0} max={100} value={dropWeight} onChange={(e) => setDropWeight(Number(e.target.value))} />
            </Field>
            <Field label={`${t.rerollWeightLabel}: ${rerollWeight}`}>
              <Range name="rerollWeight" min={0} max={100} value={rerollWeight} onChange={(e) => setRerollWeight(Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <input type="hidden" name="enableRoll" value={enableRoll ? "on" : ""} />
            <input type="hidden" name="enableResolve" value={enableResolve ? "on" : ""} />
            <input type="hidden" name="stopOnError" value={stopOnError ? "on" : ""} />
            <Switch checked={enableRoll} onChange={setEnableRoll} label={t.enableRollLabel} description={t.enableRollHint} />
            <Switch checked={enableResolve} onChange={setEnableResolve} label={t.enableResolveLabel} description={t.enableResolveHint} />
            <Switch checked={stopOnError} onChange={setStopOnError} label={t.stopOnErrorLabel} description={t.stopOnErrorHint} variant="danger" />
          </div>
          {createState.error && (
            <p role="alert" className="text-danger text-sm sm:col-span-2">
              {createState.error}
            </p>
          )}
          {createState.ok && (
            <p className="text-sm text-emerald sm:col-span-2">{createState.ok}</p>
          )}
          <button type="submit" className="hud-btn hud-btn-primary self-start" disabled={createPending || busy}>
            {createPending ? "…" : t.createButton}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        {runs.length === 0 && <p className="font-mono text-xs uppercase tracking-widest text-dim">{t.noRuns}</p>}
        {runs.map((run) => (
          <BotsRunCard
            key={run.id}
            run={run}
            roster={rosters[run.id] ?? []}
            isTicking={tickingId === run.id}
            busy={busy}
            tickingActive={tickingId !== null}
            tickIntervalMs={tickingId === run.id ? loopIntervalMs : null}
            tickCycle={tickCycle}
            lastTick={lastTick}
            playerStatusLabels={playerStatusLabels}
            t={t}
            onStart={startRun}
            onPause={pauseRun}
            onStop={stopRun}
            onRestart={restartRun}
            onStep={stepRun}
            onViewLogs={viewLogs}
          />
        ))}
        {tickError && (
          <p role="alert" className="text-danger font-mono text-xs uppercase tracking-widest">
            {tickError}
          </p>
        )}
      </section>
        </>
      )}

      {tab === "logs" && (
      <section className="hud-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">{t.logsHeading}</h2>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-dim">
            {format(t.logsCount, { shown: visibleLogs.length, total: logs.length })}
          </span>
          <button type="button" className="hud-btn !px-3 !py-1 text-xs" onClick={() => router.refresh()}>
            {t.logsRefresh}
          </button>
        </div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-dim">{t.logsAutoRefresh}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip active={logRun === "all"} onClick={() => setLogRun("all")}>
            {t.logsAllRuns}
          </Chip>
          {runs.map((r) => (
            <Chip key={r.id} active={logRun === r.id} onClick={() => setLogRun(r.id)}>
              #{r.id.slice(0, 8)}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip active={logLevel === "all"} onClick={() => setLogLevel("all")}>
            {t.logsLevelAll}
          </Chip>
          <Chip active={logLevel === "info"} onClick={() => setLogLevel("info")}>
            {t.logsLevelInfo}
          </Chip>
          <Chip active={logLevel === "error"} onClick={() => setLogLevel("error")}>
            {t.logsLevelError}
          </Chip>
        </div>
        {logActions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={logAction === "all"} onClick={() => setLogAction("all")} size="sm">
              {t.logsActionAll}
            </Chip>
            {logActions.map((a) => (
              <Chip key={a} active={logAction === a} onClick={() => setLogAction(a)} size="sm">
                {a}
              </Chip>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Input
            type="search"
            value={logQuery}
            onChange={(e) => setLogQuery(e.target.value)}
            placeholder={t.logsSearchPlaceholder}
          />
        </div>
        {visibleLogs.length === 0 ? (
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-dim">{t.logsEmpty}</p>
        ) : (
          <ul className="mt-4 flex max-h-[480px] flex-col gap-1.5 overflow-y-auto">
            {visibleLogs.map((l) => {
              const errorCode = payloadText(l.payload, "errorCode");
              const outcome = payloadText(l.payload, "outcome");
              const step = payloadText(l.payload, "step");
              const detailJson = JSON.stringify(l.payload, null, 2);
              return (
                <li
                  key={l.id}
                  className={`border px-2.5 py-1.5 font-mono text-[11px] leading-relaxed ${
                    l.level === "error" ? "border-danger/50 text-danger" : "border-[#3d3d34] text-zinc-300"
                  }`}
                >
                  <span className="text-dim">{new Date(l.createdAt).toLocaleTimeString()}</span>{" "}
                  <span className="uppercase tracking-widest text-dim">[{l.action}]</span>{" "}
                  {l.botUsername && <span className="text-amber">{l.botUsername}</span>}{" "}
                  {errorCode && <Badge variant="danger">{errorCode}</Badge>}{" "}
                  {outcome && <span className="uppercase tracking-widest text-dim">{outcome}</span>}{" "}
                  {step && <span className="text-dim">step {step}</span>}{" "}
                  <span>{l.message}</span>
                  {detailJson !== "{}" && (
                    <details className="mt-1">
                      <div className="mt-1 flex items-start gap-2">
                        <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-zinc-400">
                          {detailJson}
                        </pre>
                        <button
                          type="button"
                          className="hud-btn shrink-0 !px-2 !py-0.5 text-[10px]"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(`${l.createdAt} [${l.action}] ${l.botUsername ?? ""} ${l.message}\n${detailJson}`)
                              .then(() => {
                                setCopiedId(l.id);
                                window.setTimeout(() => setCopiedId((cur) => (cur === l.id ? null : cur)), 1500);
                              })
                              .catch(() => undefined);
                          }}
                        >
                          {copiedId === l.id ? t.logsCopied : t.logsCopy}
                        </button>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}

      {tab === "stats" && (
      <section className="hud-card p-4 sm:p-6">
        <h2 className="font-display text-sm uppercase tracking-widest text-amber">{t.statsHeading}</h2>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-dim">
          {format(t.statsNote, { count: logs.length })}
        </p>
        {logs.length === 0 ? (
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-dim">{t.statsNoData}</p>
        ) : (
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            {(
              [
                { title: t.statsByAction, rows: statsByAction },
                { title: t.statsByError, rows: statsByError, danger: true },
                { title: t.statsByBot, rows: statsByBot },
              ] as Array<{ title: string; rows: Array<[string, number]>; danger?: boolean }>
            ).map((group) => (
              <div key={group.title}>
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-dim">{group.title}</h3>
                {group.rows.length === 0 ? (
                  <p className="mt-2 font-mono text-[11px] text-dim">—</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {group.rows.map(([name, n]) => (
                      <li key={name} className="font-mono text-[11px]">
                        <span className="flex items-baseline justify-between gap-2 text-zinc-300">
                          <span className="truncate">{name}</span>
                          <span className={group.danger ? "text-danger" : "text-amber"}>{n}</span>
                        </span>
                        <span className="mt-0.5 block h-1 bg-[#1a1a1a]">
                          <span
                            className={`block h-1 ${group.danger ? "bg-danger" : "bg-amber"}`}
                            style={{ width: `${Math.max(4, Math.round((n / statsMax) * 100))}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
