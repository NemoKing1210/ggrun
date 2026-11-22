"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowPathIcon, PlayIcon } from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { runSandboxAction } from "@/lib/modules/iee/actions/library";
import { cleanDraft } from "@/lib/modules/iee/library/draft";
import { draftPlayKey } from "@/lib/modules/iee/library/scenario-draft";
import type { SandboxEvent, SandboxRun, SandboxTurn } from "@/lib/modules/iee/sim/sandbox";

import { Block } from "../parts";
import { useEditor, useEntryNames } from "./editor-context";

const BOT_COUNTS = [2, 3, 4] as const;
const MAX_ROUNDS = 50;

/**
 * The sandbox (spec §10.5): the draft played by bots in a season kept in
 * memory — before it is published, nothing saved. The run comes back as a
 * summary (where each bot ended, how often each entry dropped, was used, fired
 * and ran out) and every turn, round by round.
 */
export function SandboxBlock() {
  const { t } = useI18n();
  const sb = t.ieeEditor.entry.sandbox;
  const { doc, entryId } = useEditor();
  const { toast } = useToast();
  const [bots, setBots] = useState(3);
  const [rounds, setRounds] = useState(20);
  const [seed, setSeed] = useState("");
  const [startWith, setStartWith] = useState(true);
  const [withCore, setWithCore] = useState(false);
  const [result, setResult] = useState<{ run: SandboxRun; key: string } | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const [running, start] = useTransition();
  const draft = useMemo(() => cleanDraft(doc), [doc]);
  const key = useMemo(() => draftPlayKey(draft), [draft]);

  const play = () => {
    const sent = draft;
    const wanted = seed.trim() === "" ? null : Number(seed);
    start(async () => {
      const res = await runSandboxAction(entryId, sent, {
        bots,
        rounds,
        seed: wanted !== null && Number.isInteger(wanted) ? wanted : null,
        withCore,
        startWith,
      });
      if (res.error) {
        toast({ title: res.error, variant: "error", debug: res.debug, duration: 6500 });
        return;
      }
      if (!res.data) {
        toast({ title: res.ok ?? sb.run, variant: "warning", duration: 4500 });
        return;
      }
      if (!res.data.ok) {
        setBroken(res.data.message);
        setResult(null);
        return;
      }
      setBroken(null);
      setResult({ run: res.data.run, key: draftPlayKey(sent) });
      // The seed stays in the box: playing again repeats the run.
      setSeed(String(res.data.run.seed));
    });
  };

  return (
    <Block
      id="block-sandbox"
      title={t.ieeEditor.entry.blocks.sandbox}
      right={
        result && result.key !== key ? (
          <Badge variant="amber">{sb.stale}</Badge>
        ) : undefined
      }
    >
      <p className="mb-3 text-sm text-zinc-400">{sb.hint}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-display text-[10px] uppercase tracking-widest text-zinc-400">{sb.bots}</span>
          <Select value={String(bots)} aria-label={sb.bots} className="!w-20 !py-1.5" onChange={(e) => setBots(Number(e.target.value))}>
            {BOT_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[10px] uppercase tracking-widest text-zinc-400">{sb.rounds}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_ROUNDS}
            value={String(rounds)}
            aria-label={sb.rounds}
            className="!w-24 !py-1.5 font-mono"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n)) setRounds(Math.min(MAX_ROUNDS, Math.max(1, n)));
            }}
          />
        </label>
        <div className="flex items-end gap-1" title={sb.seedHint}>
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-widest text-zinc-400">{sb.seed}</span>
            <Input
              inputMode="numeric"
              value={seed}
              placeholder="—"
              aria-label={sb.seed}
              className="!w-32 !py-1.5 font-mono"
              onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            />
          </label>
          <button type="button" className="hud-btn mb-0.5 inline-flex items-center !px-1.5 !py-1" title={sb.newSeed} aria-label={sb.newSeed} onClick={() => setSeed("")}>
            <ArrowPathIcon className="size-3.5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 pb-0.5">
          <Switch size="sm" checked={startWith} label={sb.startWith} onChange={setStartWith} />
          <Switch size="sm" checked={withCore} label={sb.withCore} onChange={setWithCore} />
        </div>
        <button type="button" className="hud-btn hud-btn-primary ml-auto inline-flex items-center gap-1.5 text-xs" disabled={running} onClick={play}>
          <PlayIcon className="size-4" aria-hidden />
          {running ? sb.running : sb.run}
        </button>
      </div>

      {broken && <p className="mt-3 text-sm text-danger">{format(sb.broken, { message: broken })}</p>}
      {result && <SandboxResult run={result.run} />}
    </Block>
  );
}

function SandboxResult({ run }: { run: SandboxRun }) {
  const { t } = useI18n();
  const sb = t.ieeEditor.entry.sandbox;
  const { entryId } = useEditor();
  const { nameOf } = useEntryNames();
  const [onlyMine, setOnlyMine] = useState(true);
  const bot = (id: string) => format(sb.botName, { number: id.replace(/^bot-/, "") });
  const tookPart = (turn: SandboxTurn) =>
    turn.wheel?.entryId === entryId || turn.uses.some((u) => u.entryId === entryId || u.events.some((e) => e.entryId === entryId)) || turn.events.some((e) => e.entryId === entryId);
  const turns = onlyMine ? run.turns.filter(tookPart) : run.turns;
  const byRound = new Map<number, SandboxTurn[]>();
  for (const turn of turns) byRound.set(turn.round, [...(byRound.get(turn.round) ?? []), turn]);
  const names = run.summary.entries.map((e) => nameOf(e.entryId));
  const sameName = (id: string) => names.filter((n) => n === nameOf(id)).length > 1;
  const th = "px-2 py-1 text-left font-display text-[10px] uppercase tracking-widest text-zinc-400";
  const td = "px-2 py-1";

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="font-mono text-xs text-zinc-400">
        {format(sb.ranSummary, { seed: String(run.seed), bots: String(run.bots), played: String(run.played), rounds: String(run.rounds) })}
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section>
          <h3 className="mb-1 font-display text-xs uppercase tracking-widest text-amber">{sb.botsTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a22]">
                  <th className={th}>{sb.bots}</th>
                  <th className={th}>{sb.cell}</th>
                  <th className={th}>{sb.points}</th>
                  <th className={th}>{sb.holds}</th>
                </tr>
              </thead>
              <tbody>
                {run.summary.bots.map((b) => {
                  const holds = Object.entries(b.holds).map(([id, n]) => (n > 1 ? `«${nameOf(id)}» ×${n}` : `«${nameOf(id)}»`));
                  return (
                    <tr key={b.id} className="border-b border-[#2a2a22]/60 align-top">
                      <td className={`${td} whitespace-nowrap text-zinc-200`}>
                        {bot(b.id)}
                        {b.status !== "active" && <span className="ml-1.5 text-xs text-dim">{sb.status[b.status]}</span>}
                      </td>
                      <td className={`${td} font-mono`}>{b.position}</td>
                      <td className={`${td} font-mono`}>{b.balance}</td>
                      <td className={`${td} text-zinc-300`}>{holds.length ? holds.join(", ") : sb.nothing}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3 className="mb-1 font-display text-xs uppercase tracking-widest text-amber">{sb.entriesTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a22]">
                  <th className={th}>{sb.columns.entry}</th>
                  {(["dropped", "granted", "used", "fired", "expired"] as const).map((c) => (
                    <th key={c} className={`${th} text-right`}>
                      {sb.columns[c]}
                    </th>
                  ))}
                  <th className={`${th} text-right`} title={sb.movedHint}>
                    {sb.columns.moved}
                  </th>
                </tr>
              </thead>
              <tbody>
                {run.summary.entries.map((e) => (
                  <tr key={e.entryId} className={`border-b border-[#2a2a22]/60 ${e.entryId === entryId ? "text-amber" : "text-zinc-300"}`}>
                    <td className={td}>
                      {nameOf(e.entryId)}
                      {/* Two entries may share a name; their slugs never do. */}
                      {sameName(e.entryId) && <span className="ml-1.5 font-mono text-xs text-dim">{e.key}</span>}
                    </td>
                    {([e.dropped, e.granted, e.used, e.fired, e.expired] as const).map((n, i) => (
                      <td key={i} className={`${td} text-right font-mono`}>
                        {n}
                      </td>
                    ))}
                    <td className={`${td} text-right font-mono`}>{signed(e.moved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xs uppercase tracking-widest text-amber">{sb.trace}</h3>
          <Switch size="sm" checked={onlyMine} label={sb.onlyMine} onChange={setOnlyMine} />
        </div>
        {run.setup.length > 0 && (
          <p className="mb-2 text-xs text-zinc-400">
            <span className="font-display uppercase tracking-widest text-zinc-500">{sb.setup}:</span>{" "}
            {run.setup.map((e) => eventText(e, null, bot, nameOf, sb)).join(" · ")}
          </p>
        )}
        {run.turns.length === 0 && <p className="text-sm text-dim">{sb.empty}</p>}
        <div className="flex flex-col gap-1">
          {[...byRound.entries()].map(([round, list]) => (
            <details key={round} open={round <= 3} className="border-l-2 border-[#3d3d34] pl-3">
              <summary className="cursor-pointer select-none font-display text-xs uppercase tracking-widest text-zinc-300 hover:text-amber">
                {format(sb.round, { number: String(round) })}
              </summary>
              <ul className="mt-1 flex flex-col gap-1.5 pb-1">
                {list.map((turn) => (
                  <TurnLine key={`${turn.round}-${turn.bot}`} turn={turn} bot={bot} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

type Words = ReturnType<typeof useI18n>["t"]["ieeEditor"]["entry"]["sandbox"];

/** A count of cells with its sign, a true minus for the negative ones. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** One journal row in words: who, what happened, to which entry. */
function eventText(e: SandboxEvent, self: string | null, bot: (id: string) => string, nameOf: (id: string) => string, sb: Words): string {
  const who = e.target ?? e.actor;
  const op = (sb.ops as Record<string, string>)[e.op] ?? e.op;
  const what = e.entryId ? `«${nameOf(e.entryId)}»` : "";
  const steps = e.op === "fire" && typeof e.outcome.stepsDelta === "number" ? ` (${signed(e.outcome.stepsDelta)})` : "";
  const prefix = who && who !== self ? `${bot(who)}: ` : "";
  return `${prefix}${op} ${what}${steps}`.trim();
}

function TurnLine({ turn, bot }: { turn: SandboxTurn; bot: (id: string) => string }) {
  const { t } = useI18n();
  const sb = t.ieeEditor.entry.sandbox;
  const { nameOf } = useEntryNames();
  const refusal = (code: string | null) => (code ? ((t.core.errors as Record<string, string>)[code] ?? code) : "");
  const wheel =
    turn.wheel === null
      ? null
      : format(sb.wheel, { what: turn.wheel.entryId ? `«${nameOf(turn.wheel.entryId)}»` : sb.wheelNothing });
  const events = turn.events.map((e) => eventText(e, turn.bot, bot, nameOf, sb));
  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-zinc-100">{bot(turn.bot)}</span>
        {turn.game && <span className="text-xs text-zinc-400">«{turn.game}»</span>}
        {/* No result when an item of its own took the bot to the finish before it rolled. */}
        {turn.outcome && <Badge variant={turn.outcome === "passed" ? "military" : "danger"}>{sb.outcome[turn.outcome]}</Badge>}
        <span className="font-mono text-xs text-zinc-300">
          {turn.outcome ? `${turn.dice.join("+") || "0"} · ` : ""}
          {turn.from} → {turn.to}
        </span>
        {turn.cell && <span className="text-xs text-zinc-400">{t.core.cellTypes[turn.cell]}</span>}
        {wheel && <span className="text-xs text-amber">{wheel}</span>}
        <span className="font-mono text-xs text-dim">
          {sb.points}: {turn.balance}
        </span>
        {turn.finished && <span className="text-xs text-military">{sb.status.finished}</span>}
      </div>
      {turn.uses.map((u, i) => (
        <p key={i} className={`text-xs ${u.ok ? "text-zinc-300" : "text-danger"}`}>
          {u.ok
            ? u.target && u.target !== turn.bot
              ? format(sb.used, { item: `«${u.entryId ? nameOf(u.entryId) : u.key}»`, target: bot(u.target) })
              : format(sb.usedSelf, { item: `«${u.entryId ? nameOf(u.entryId) : u.key}»` })
            : format(sb.refused, { item: `«${u.entryId ? nameOf(u.entryId) : u.key}»`, reason: refusal(u.code) })}
          {u.ok && u.events.length > 1 && (
            <span className="text-zinc-500"> — {u.events.filter((e) => e.op !== "use").map((e) => eventText(e, turn.bot, bot, nameOf, sb)).join(" · ")}</span>
          )}
        </p>
      ))}
      {events.length > 0 && <p className="font-mono text-xs text-zinc-500">{events.join(" · ")}</p>}
    </li>
  );
}
