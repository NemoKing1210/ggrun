"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import type { BotRunConfig } from "@/db/schema/bots";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { cleanupBotRunAction, updateBotConfigAction } from "@/lib/modules/bots/actions";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Range } from "@/components/ui/Range";
import { Switch } from "@/components/ui/Switch";

export interface ConsoleBotRun {
  id: string;
  status: string;
  config: BotRunConfig;
  totalTicks: number;
  totalActions: number;
  totalErrors: number;
  lastError: string | null;
  createdAt: string;
}

export interface ConsoleBotLog {
  id: string;
  runId: string;
  level: string;
  action: string;
  botUsername: string | null;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ConsoleRosterRow {
  username: string;
  seasonPlayerId: string | null;
  status: string | null;
  position: number | null;
  balancePoints: number | null;
}

export type BotsText = Dictionary["admin"]["bots"];

const STATUS_VARIANT: Record<string, "emerald" | "amber" | "dim"> = {
  running: "emerald",
  paused: "amber",
  stopped: "dim",
};

function statusLabel(t: BotsText, status: string): string {
  if (status === "running") return t.statusRunning;
  if (status === "stopped") return t.statusStopped;
  return t.statusPaused;
}
/** Countdown to the next tick: fills over `intervalMs`, holds full while the
 *  server step runs long, restarts on every completed tick (`cycleKey`). */
export function TickCountdown({
  intervalMs,
  cycleKey,
  t,
}: {
  intervalMs: number;
  cycleKey: number;
  t: BotsText;
}) {
  const startRef = useRef(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    startRef.current = Date.now();
    setNow(startRef.current);
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [cycleKey, intervalMs]);
  const span = Math.max(1, intervalMs);
  const ratio = Math.min(1, Math.max(0, now - startRef.current) / span);
  const remainS = (Math.max(0, span - (now - startRef.current)) / 1000).toFixed(1);
  return (
    <span className="mt-2 flex items-center gap-2" aria-label={format(t.nextTickIn, { s: remainS })}>
      <span className="h-1 flex-1 bg-[#1a1a1a]">
        <span className="block h-1 bg-amber transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
        {format(t.nextTickIn, { s: remainS })}
      </span>
    </span>
  );
}
/** One run: live controls, bot roster and editable settings. */
export function BotsRunCard({
  run,
  roster,
  isTicking,
  busy,
  tickIntervalMs: loopIntervalMs,
  tickCycle,
  tickingActive,
  lastTick,
  playerStatusLabels,
  t,
  onStart,
  onRestart,
  onPause,
  onStop,
  onStep,
  onViewLogs,
}: {
  run: ConsoleBotRun;
  roster: ConsoleRosterRow[];
  isTicking: boolean;
  busy: boolean;
  tickIntervalMs: number | null;
  /** Bumps on every completed tick — restarts the countdown. */
  tickCycle: number;
  tickingActive: boolean;
  lastTick: { runId: string; actions: number; errors: number } | null;
  playerStatusLabels: Record<string, string>;
  t: BotsText;
  onStart: (run: ConsoleBotRun) => void;
  onRestart: (run: ConsoleBotRun) => void;
  onPause: (runId: string) => void;
  onStop: (runId: string) => void;
  onStep: (runId: string) => void;
  onViewLogs: (runId: string) => void;
}) {
  const router = useRouter();
  const [configState, configAction, configPending] = useActionState(updateBotConfigAction, {});
  const [actionsPerTick, setActionsPerTick] = useState(run.config.actionsPerTick);
  const [tickIntervalMs, setTickIntervalMs] = useState(run.config.tickIntervalMs);
  const [passWeight, setPassWeight] = useState(run.config.passWeight);
  const [dropWeight, setDropWeight] = useState(run.config.dropWeight);
  const [rerollWeight, setRerollWeight] = useState(run.config.rerollWeight);
  const [enableRoll, setEnableRoll] = useState(run.config.enableRoll);
  const [enableResolve, setEnableResolve] = useState(run.config.enableResolve);
  const [stopOnError, setStopOnError] = useState(run.config.stopOnError);

  useEffect(() => {
    if (configState.ok) router.refresh();
  }, [configState.ok, router]);

  // A stopped run restarts only while its bots are still season members —
  // after "Remove bots" there is nobody to tick, and the server refuses too.
  const canRestart = roster.some((b) => b.seasonPlayerId !== null);

  return (
    <article className="hud-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-dim">#{run.id.slice(0, 8)}</span>
        <Badge variant={STATUS_VARIANT[run.status] ?? "dim"}>{statusLabel(t, run.status)}</Badge>
        {isTicking && <Badge variant="emerald">{t.tickingLabel}</Badge>}
        {!isTicking && <Badge variant="dim">{t.idleLabel}</Badge>}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-dim">
          {format(t.statsFormat, {
            actions: run.totalActions,
            errors: run.totalErrors,
            ticks: run.totalTicks,
          })}
        </span>
      </div>
      {isTicking && loopIntervalMs !== null && (
        <TickCountdown intervalMs={loopIntervalMs} cycleKey={tickCycle} t={t} />
      )}
      <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-dim">
        {run.config.botCount} bots · {run.config.actionsPerTick}/tick · {run.config.tickIntervalMs}ms ·
        pass {run.config.passWeight} / drop {run.config.dropWeight} / reroll {run.config.rerollWeight}
        {!run.config.enableRoll && " · no-roll"}
        {!run.config.enableResolve && " · no-resolve"}
        {run.config.stopOnError && " · stop-on-error"}
      </p>
      {run.lastError && (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-danger">
          {t.lastErrorLabel}: {run.lastError}
        </p>
      )}
      {lastTick?.runId === run.id && (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-emerald">
          {format(t.lastTickLabel, { actions: lastTick.actions, errors: lastTick.errors })}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {run.status === "running" && !isTicking ? (
          <button type="button" className="hud-btn hud-btn-primary" disabled={busy || tickingActive} onClick={() => onStart(run)}>
            {t.resumeButton}
          </button>
        ) : !isTicking ? (
          <button
            type="button"
            className="hud-btn hud-btn-primary"
            disabled={busy || tickingActive || (run.status === "stopped" && !canRestart)}
            onClick={() => (run.status === "stopped" ? onRestart(run) : onStart(run))}
          >
            {run.status === "stopped" ? t.restartButton : t.startButton}
          </button>
        ) : (
          <button type="button" className="hud-btn" disabled={busy} onClick={() => onPause(run.id)}>
            {t.pauseButton}
          </button>
        )}
        {!isTicking && run.status !== "stopped" && (
          <button type="button" className="hud-btn" disabled={busy || tickingActive} onClick={() => onStep(run.id)}>
            {t.stepButton}
          </button>
        )}
        {!isTicking && run.status !== "stopped" && (
          <button type="button" className="hud-btn" disabled={busy} onClick={() => onStop(run.id)}>
            {t.stopButton}
          </button>
        )}
        <button type="button" className="hud-btn" onClick={() => onViewLogs(run.id)}>
          {t.viewLogsButton}
        </button>
        {!isTicking && (
          <form action={cleanupBotRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <ConfirmButton
              message={format(t.cleanupConfirm, { count: run.config.botCount })}
              danger
              className="hud-btn"
              disabled={busy}
            >
              {t.cleanupButton}
            </ConfirmButton>
          </form>
        )}
        {!isTicking && (
          <form action={cleanupBotRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="deleteRun" value="on" />
            <ConfirmButton
              message={format(t.cleanupConfirm, { count: run.config.botCount })}
              danger
              className="hud-btn"
              disabled={busy}
            >
              {t.deleteRunButton}
            </ConfirmButton>
          </form>
        )}
      </div>

      <details className="mt-3 border border-[#3d3d34] px-3 py-2">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-widest text-amber">
          {format(t.rosterHeading, { count: roster.length })}
        </summary>
        {roster.length === 0 ? (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-dim">{t.logsEmpty}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            <li className="grid grid-cols-[1fr_auto_auto_auto] gap-3 font-mono text-[10px] uppercase tracking-widest text-dim">
              <span>{t.rosterBot}</span>
              <span>{t.rosterStatus}</span>
              <span>{t.rosterPosition}</span>
              <span>{t.rosterPoints}</span>
            </li>
            {roster.map((b) => (
              <li
                key={b.username}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 font-mono text-[11px] text-zinc-300"
              >
                <span className="truncate text-amber">{b.username}</span>
                <span>{b.status ? (playerStatusLabels[b.status] ?? b.status) : t.rosterNoMember}</span>
                <span>{b.position ?? "—"}</span>
                <span>{b.balancePoints ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="mt-2 border border-[#3d3d34] px-3 py-2">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-widest text-amber">
          {t.settingsHeading}
        </summary>
        <form
          action={configAction}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="runId" value={run.id} />
          <input type="hidden" name="botCount" value={run.config.botCount} />
          <Field label={t.actionsPerTickLabel}>
            <Input
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
          <Field label={`${t.passWeightLabel}: ${passWeight}`}>
            <Range name="passWeight" min={0} max={100} value={passWeight} onChange={(e) => setPassWeight(Number(e.target.value))} />
          </Field>
          <Field label={`${t.dropWeightLabel}: ${dropWeight}`}>
            <Range name="dropWeight" min={0} max={100} value={dropWeight} onChange={(e) => setDropWeight(Number(e.target.value))} />
          </Field>
          <Field label={`${t.rerollWeightLabel}: ${rerollWeight}`}>
            <Range name="rerollWeight" min={0} max={100} value={rerollWeight} onChange={(e) => setRerollWeight(Number(e.target.value))} />
          </Field>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <input type="hidden" name="enableRoll" value={enableRoll ? "on" : ""} />
            <input type="hidden" name="enableResolve" value={enableResolve ? "on" : ""} />
            <input type="hidden" name="stopOnError" value={stopOnError ? "on" : ""} />
            <Switch checked={enableRoll} onChange={setEnableRoll} label={t.enableRollLabel} size="sm" />
            <Switch checked={enableResolve} onChange={setEnableResolve} label={t.enableResolveLabel} size="sm" />
            <Switch checked={stopOnError} onChange={setStopOnError} label={t.stopOnErrorLabel} size="sm" variant="danger" />
          </div>
          {configState.error && (
            <p role="alert" className="text-danger text-sm sm:col-span-2">
              {configState.error}
            </p>
          )}
          {configState.ok && <p className="text-sm text-emerald sm:col-span-2">{configState.ok}</p>}
          <button type="submit" className="hud-btn self-start" disabled={configPending || busy}>
            {configPending ? "…" : t.settingsSave}
          </button>
        </form>
      </details>
    </article>
  );
}
