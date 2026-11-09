"use client";

import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { EntryDescription } from "@/components/iee/EntryDescription";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  LIMITS,
  scenarioText,
  type Issue,
  type Localized,
  type ScenarioCheck,
  type ScenarioDoc,
  type ScenarioStep,
  type StepObservation,
} from "@/lib/engine/iee/dsl";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { issueSpot, move } from "@/lib/modules/iee/library/draft";
import {
  STEP_CHECKS,
  STEP_KINDS,
  acceptCheck,
  defaultStep,
  newScenario,
  nextScenarioId,
  updateScenario,
  updateStep,
  withStepKind,
  type CheckField,
  type ScenarioStatus,
  type ScenarioVerdict,
  type StepKind,
  type StepVerdict,
} from "@/lib/modules/iee/library/scenario-draft";

import { issueText, scenarioValueText } from "../issue-text";
import { Block } from "../parts";
import { issuesWhere, useEditor, useEntryNames } from "./editor-context";
import { GivenFields, StepThenFields, StepWhenFields } from "./scenario-fields";

const LOCALES = ["ru", "en", "uk"] as const;

/**
 * Scenarios (spec §5.5): what the entry promises, as Given — When — Then that
 * publishing and importing run. Each card reads back as sentences; the last
 * run's verdict sits beside every expectation, re-checked as the author edits
 * it — an expectation never changes what happens, so only a change to Given,
 * When or the rules needs a new run.
 */
export function ScenariosBlock() {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { doc, update, readOnly, analysis, scenarios } = useEditor();
  const issues = issuesWhere(analysis, (s) => s.block === "scenarios");
  const general = issues.errors.filter((i) => issueSpot(i.path).scenario === undefined);
  const list = doc.scenarios ?? [];

  return (
    <Block
      id="block-scenarios"
      title={t.ieeEditor.entry.blocks.scenarios}
      errors={issues.errors.length}
      warnings={issues.warnings.length}
      right={
        <div className="flex flex-wrap items-center gap-2">
          {list.length > 0 && <ScenarioSummary verdicts={scenarios.verdicts} />}
          <button
            type="button"
            className="hud-btn inline-flex items-center gap-1.5 text-xs"
            disabled={list.length === 0 || scenarios.running}
            title={sc.runHint}
            onClick={scenarios.run}
          >
            <PlayIcon className="size-4" aria-hidden />
            {scenarios.running ? sc.running : sc.run}
          </button>
        </div>
      }
    >
      <p className="text-sm text-zinc-400">{sc.hint}</p>
      <p className="mb-3 mt-1 text-xs leading-relaxed text-zinc-500">{sc.seasonHint}</p>
      {general.map((i, n) => (
        <p key={n} className="mb-2 flex items-start gap-1.5 text-sm text-danger">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {issueText(i, t)}
        </p>
      ))}
      {list.length === 0 && <p className="mb-3 text-sm text-dim">{sc.empty}</p>}
      <div className="flex flex-col gap-3">
        {list.map((scenario, index) => (
          <ScenarioCard
            key={index}
            scenario={scenario}
            index={index}
            count={list.length}
            verdict={scenarios.verdicts[index] ?? { status: "notRun", steps: [] }}
          />
        ))}
      </div>
      {!readOnly && (
        <button
          type="button"
          className="hud-btn mt-3 inline-flex items-center gap-1.5 text-xs"
          disabled={list.length >= LIMITS.scenarios}
          onClick={() => update((d) => ({ ...d, scenarios: [...(d.scenarios ?? []), newScenario(d)] }))}
        >
          <PlusIcon className="size-4" aria-hidden />
          {sc.add}
        </button>
      )}
    </Block>
  );
}

/** "3 of 4 green", or why there is no count yet. */
export function ScenarioSummary({ verdicts }: { verdicts: readonly ScenarioVerdict[] }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const green = verdicts.filter((v) => v.status === "green").length;
  const red = verdicts.filter((v) => v.status === "red").length;
  if (green + red === 0) {
    const stale = verdicts.some((v) => v.status === "stale");
    return <span className="font-mono text-xs text-dim">{stale ? sc.status.stale : sc.status.notRun}</span>;
  }
  return (
    <span className={`font-mono text-xs ${red > 0 ? "text-danger" : green === verdicts.length ? "text-military" : "text-zinc-300"}`}>
      {format(sc.summary, { green: String(green), total: String(verdicts.length) })}
    </span>
  );
}

const STATUS_BADGE: Record<ScenarioStatus, "military" | "danger" | "dim" | "amber"> = {
  green: "military",
  red: "danger",
  notRun: "dim",
  stale: "amber",
};

function StatusBadge({ status }: { status: ScenarioStatus }) {
  const { t } = useI18n();
  return <Badge variant={STATUS_BADGE[status]}>{t.ieeEditor.entry.scenarios.status[status]}</Badge>;
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="hud-btn inline-flex items-center !px-1.5 !py-1"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Section({ label, last = false, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid gap-2 py-2 sm:grid-cols-[5rem_minmax(0,1fr)] ${last ? "" : "border-b border-[#2a2a22]"}`}>
      <span className="pt-1.5 font-display text-xs uppercase tracking-widest text-amber">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function IssueLines({ errors, warnings, small = false }: { errors: readonly Issue[]; warnings: readonly Issue[]; small?: boolean }) {
  const { t } = useI18n();
  const size = small ? "text-xs" : "text-sm";
  return (
    <>
      {errors.map((i, n) => (
        <p key={`e${n}`} className={`mb-1.5 flex items-start gap-1.5 ${size} text-danger`}>
          <ExclamationTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {issueText(i, t)}
        </p>
      ))}
      {warnings.map((i, n) => (
        <p key={`w${n}`} className={`mb-1.5 flex items-start gap-1.5 ${size} text-amber`}>
          <ExclamationTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {issueText(i, t)}
        </p>
      ))}
    </>
  );
}

function ScenarioCard({ scenario, index, count, verdict }: { scenario: ScenarioDoc; index: number; count: number; verdict: ScenarioVerdict }) {
  const { t, locale } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { doc, update, readOnly, analysis } = useEditor();
  const { idOf, nameOf, kindOf } = useEntryNames();
  const [noteOpen, setNoteOpen] = useState(false);
  const own = issuesWhere(analysis, (s) => s.block === "scenarios" && s.scenario === index && s.step === undefined);
  const stepIssues = issuesWhere(analysis, (s) => s.block === "scenarios" && s.scenario === index && s.step !== undefined);
  const set = (change: (s: ScenarioDoc) => ScenarioDoc) => update((d) => updateScenario(d, index, change));
  const setText = (key: "title" | "note", loc: (typeof LOCALES)[number], value: string) =>
    set((s) => ({ ...s, [key]: { ru: "", ...s[key], [loc]: value } as Localized }));
  const showNote = noteOpen || scenario.note !== undefined;
  const refusals = t.core.errors as Record<string, string>;
  const text = safeText(scenario, {
    locale,
    name: (e) => nameOf(idOf(e)),
    kind: (e) => kindOf(idOf(e)),
    refusal: (code) => refusals[code] ?? code,
  });
  const tone =
    own.errors.length > 0 || stepIssues.errors.length > 0 || verdict.status === "red"
      ? "border-danger/50"
      : verdict.status === "green"
        ? "border-military/40"
        : "border-[#3d3d34]";

  return (
    <article
      id={`scenario-${index}`}
      className={`scroll-mt-24 border bg-[#1a1a1a] p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${tone}`}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xs uppercase tracking-widest text-zinc-300">{format(sc.scenario, { number: String(index + 1) })}</h3>
          <StatusBadge status={verdict.status} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="w-40" title={sc.idHint}>
            <Input
              value={scenario.id ?? ""}
              disabled={readOnly}
              placeholder={sc.idHint}
              aria-label={sc.id}
              className="!py-1.5 font-mono uppercase"
              onChange={(e) => {
                const id = e.target.value.toUpperCase().replace(/\s+/g, "-");
                set(({ id: _id, ...s }) => (id ? { ...s, id } : s));
              }}
            />
          </div>
          {!readOnly && (
            <>
              <IconButton
                label={sc.duplicate}
                disabled={count >= LIMITS.scenarios}
                onClick={() =>
                  update((d) => {
                    const all = [...(d.scenarios ?? [])];
                    const source = all[index];
                    if (!source) return d;
                    const { id: _id, ...copy } = structuredClone(source);
                    const id = nextScenarioId(d, source.id);
                    all.splice(index + 1, 0, id ? { ...copy, id } : copy);
                    return { ...d, scenarios: all };
                  })
                }
              >
                <DocumentDuplicateIcon className="size-3.5" aria-hidden />
              </IconButton>
              <IconButton
                label={t.ieeEditor.entry.rules.moveUp}
                disabled={index === 0}
                onClick={() => update((d) => ({ ...d, scenarios: move(d.scenarios ?? [], index, -1) }))}
              >
                <ArrowUpIcon className="size-3.5" aria-hidden />
              </IconButton>
              <IconButton
                label={t.ieeEditor.entry.rules.moveDown}
                disabled={index === count - 1}
                onClick={() => update((d) => ({ ...d, scenarios: move(d.scenarios ?? [], index, 1) }))}
              >
                <ArrowDownIcon className="size-3.5" aria-hidden />
              </IconButton>
              <IconButton
                label={sc.removeScenario}
                onClick={() =>
                  update((d) => {
                    const rest = (d.scenarios ?? []).filter((_, i) => i !== index);
                    return { ...d, scenarios: rest };
                  })
                }
              >
                <TrashIcon className="size-3.5" aria-hidden />
              </IconButton>
            </>
          )}
        </div>
      </header>

      <IssueLines errors={own.errors} warnings={own.warnings} small />

      <Field label={sc.title} hint={sc.titleHint}>
        <div className="grid gap-2 sm:grid-cols-3">
          {LOCALES.map((loc) => (
            <Input
              key={loc}
              value={scenario.title[loc] ?? ""}
              disabled={readOnly}
              maxLength={LIMITS.scenarioTitleLength}
              placeholder={t.ieeEditor.locales[loc]}
              aria-label={`${sc.title} ${t.ieeEditor.locales[loc]}`}
              invalid={loc === "ru" && !scenario.title.ru.trim()}
              onChange={(e) => setText("title", loc, e.target.value)}
            />
          ))}
        </div>
      </Field>

      {showNote ? (
        <div className="mt-2">
          <Field label={sc.note}>
            <div className="grid gap-2 sm:grid-cols-3">
              {LOCALES.map((loc) => (
                <Textarea
                  key={loc}
                  rows={2}
                  value={scenario.note?.[loc] ?? ""}
                  disabled={readOnly}
                  placeholder={t.ieeEditor.locales[loc]}
                  aria-label={`${sc.note} ${t.ieeEditor.locales[loc]}`}
                  onChange={(e) => setText("note", loc, e.target.value)}
                />
              ))}
            </div>
          </Field>
        </div>
      ) : (
        !readOnly && (
          <button type="button" className="mt-2 text-xs text-zinc-500 underline-offset-2 hover:text-amber hover:underline" onClick={() => setNoteOpen(true)}>
            {sc.addNote}
          </button>
        )
      )}

      <div className="mt-2">
        <Section label={sc.given}>
          <GivenFields scenario={scenario} onChange={(given) => set((s) => ({ ...s, given }))} />
        </Section>
        <Section label={sc.steps} last>
          <ol className="flex flex-col gap-3">
            {scenario.steps.map((step, n) => (
              <StepCard
                key={n}
                scenarioIndex={index}
                step={step}
                n={n}
                total={scenario.steps.length}
                verdict={verdict.steps[n] ?? null}
                issues={issuesWhere(analysis, (s) => s.block === "scenarios" && s.scenario === index && s.step === n)}
              />
            ))}
          </ol>
          {!readOnly && scenario.steps.length < LIMITS.scenarioSteps && (
            <div className="mt-2 max-w-xs">
              <Select
                value=""
                aria-label={sc.addStep}
                className="!py-1.5"
                onChange={(e) => {
                  const kind = e.target.value as StepKind | "";
                  if (kind) set((s) => ({ ...s, steps: [...s.steps, defaultStep(doc, kind)] }));
                }}
              >
                <option value="">{sc.addStep}</option>
                {STEP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {sc.kinds[k]}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </Section>
      </div>

      <div className="mt-3 border-t border-[#2a2a22] pt-2">
        <p className="font-display text-[10px] uppercase tracking-widest text-dim">{sc.reads}</p>
        {text === null ? (
          <p className="mt-1 text-xs text-amber">{sc.unreadable}</p>
        ) : (
          <>
            {text.given && (
              <EntryDescription tone="dense" className="!mt-0.5">
                {text.given}
              </EntryDescription>
            )}
            {text.steps.map((s, n) => (
              <EntryDescription key={n} tone="dense" className="!mt-0.5">
                {text.steps.length > 1 ? `${n + 1}. ` : ""}
                {s.when} {s.then}
              </EntryDescription>
            ))}
          </>
        )}
      </div>
    </article>
  );
}

/** The scenario in words, or null when a half-filled form cannot be read yet. */
function safeText(scenario: ScenarioDoc, env: Parameters<typeof scenarioText>[1]) {
  try {
    return scenarioText(scenario, env);
  } catch {
    return null;
  }
}

function StepCard({
  scenarioIndex,
  step,
  n,
  total,
  verdict,
  issues,
}: {
  scenarioIndex: number;
  step: ScenarioStep;
  n: number;
  total: number;
  verdict: StepVerdict | null;
  issues: { errors: Issue[]; warnings: Issue[] };
}) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { doc, update, readOnly } = useEditor();
  const { nameOf } = useEntryNames();
  const setStep = (next: ScenarioStep) => update((d) => updateStep(d, scenarioIndex, n, () => next));
  const setSteps = (change: (steps: ScenarioStep[]) => ScenarioStep[]) =>
    update((d) => updateScenario(d, scenarioIndex, (s) => ({ ...s, steps: change(s.steps) })));
  const failed = verdict !== null && verdict.ran && !verdict.ok;

  /** The last run's word on a field: each of its checks, held or missed. */
  const verdictOf = (field: CheckField) => {
    if (!verdict || !verdict.ran || verdict.broken) return null;
    const checks = verdict.checks.filter((c) => c.field === field);
    if (checks.length === 0) return null;
    return (
      <ul className="mt-1 flex flex-col gap-0.5">
        {checks.map((check, row) => (
          <CheckVerdict
            key={row}
            check={check}
            label={check.entry ? nameOf(check.entry.id) : null}
            onAccept={readOnly ? null : () => setStep(acceptCheck(step, check, row))}
          />
        ))}
      </ul>
    );
  };

  return (
    <li
      className={`border-l-2 pl-3 ${
        issues.errors.length > 0 || failed ? "border-danger" : verdict?.ok ? "border-military/60" : issues.warnings.length > 0 ? "border-amber/60" : "border-[#3d3d34]"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xs uppercase tracking-widest text-zinc-100">{format(sc.step, { number: String(n + 1) })}</span>
          <div className="w-44">
            <Select
              value={step.do}
              disabled={readOnly}
              aria-label={format(sc.step, { number: String(n + 1) })}
              className="!py-1.5"
              onChange={(e) => setStep(withStepKind(doc, step, e.target.value as StepKind))}
            >
              {STEP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {sc.kinds[k]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            {total > 1 && (
              <>
                <IconButton label={t.ieeEditor.entry.rules.moveUp} disabled={n === 0} onClick={() => setSteps((steps) => move(steps, n, -1))}>
                  <ArrowUpIcon className="size-3" aria-hidden />
                </IconButton>
                <IconButton label={t.ieeEditor.entry.rules.moveDown} disabled={n === total - 1} onClick={() => setSteps((steps) => move(steps, n, 1))}>
                  <ArrowDownIcon className="size-3" aria-hidden />
                </IconButton>
              </>
            )}
            <IconButton label={sc.removeStep} disabled={total <= 1} onClick={() => setSteps((steps) => steps.filter((_, i) => i !== n))}>
              <TrashIcon className="size-3" aria-hidden />
            </IconButton>
          </div>
        )}
      </div>

      <IssueLines errors={issues.errors} warnings={issues.warnings} small />

      <div className="flex flex-col gap-2">
        <StepWhenFields step={step} onChange={setStep} />
        <div>
          <p className="mb-1 font-display text-[10px] uppercase tracking-widest text-amber">{sc.then}</p>
          <StepThenFields step={step} onChange={setStep} verdict={verdictOf} observed={verdict?.observed ?? null} />
        </div>
      </div>

      {verdict?.broken && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
          <XCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {brokenText(verdict.broken, t, nameOf)}
        </p>
      )}
      {verdict !== null && !verdict.ran && <p className="mt-2 text-xs text-dim">{sc.notReached}</p>}
      {verdict?.observed && <Happened step={step} observed={verdict.observed} />}
    </li>
  );
}

function brokenText(broken: NonNullable<StepVerdict["broken"]>, t: Dictionary, nameOf: (id: string) => string): string {
  const template = (t.ieeEditor.entry.scenarios.broken as Record<string, string>)[broken.reason] ?? broken.reason;
  const params = { ...broken.params };
  if (params.entry) params.entry = nameOf(params.entry);
  return format(template, params);
}

const show = (value: unknown) => (value === null || value === undefined ? "nothing" : String(value));

/** One check against the last run: held, or what happened instead — and a way to take it. */
function CheckVerdict({ check, label, onAccept }: { check: ScenarioCheck; label: string | null; onAccept: (() => void) | null }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const prefix = label ? `«${label}»: ` : "";
  if (check.ok) {
    return (
      <li className="flex items-center gap-1 text-xs text-military">
        <CheckCircleIcon className="size-3.5 shrink-0" aria-hidden />
        {prefix}
        {sc.holds}
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-danger">
      <span className="inline-flex items-center gap-1">
        <XCircleIcon className="size-3.5 shrink-0" aria-hidden />
        {prefix}
        {format(sc.failed, {
          expected: scenarioValueText(check.field, show(check.expected), t),
          actual: scenarioValueText(check.field, show(check.actual), t),
        })}
      </span>
      {onAccept && (
        <button type="button" className="text-zinc-400 underline underline-offset-2 hover:text-amber" onClick={onAccept}>
          {sc.accept}
        </button>
      )}
    </li>
  );
}

/** What the step did in the last run, whatever it checks — the material for its next check. */
function Happened({ step, observed }: { step: ScenarioStep; observed: StepObservation }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { nameOf } = useEntryNames();
  const fields = (STEP_CHECKS[step.do] as readonly CheckField[]).filter((f) => f !== "holder" && f !== "rival");
  const value = (field: CheckField): string | null => {
    const v = (observed as unknown as Record<string, unknown>)[field];
    if (v === undefined || (field === "reason" && v === null)) return null;
    const text = scenarioValueText(field, show(v), t);
    return (field === "balance" || field === "rivalBalance") && typeof v === "number" && v > 0 ? `+${text}` : text;
  };
  const holdings = (side: "holder" | "rival") => {
    const rows = Object.entries(observed[side]).filter(([, n]) => n > 0);
    return rows.length === 0 ? sc.nothing : rows.map(([id, n]) => (n > 1 ? `«${nameOf(id)}» ×${n}` : `«${nameOf(id)}»`)).join(", ");
  };
  return (
    <details className="mt-2 text-xs text-zinc-500">
      <summary className="cursor-pointer select-none font-display uppercase tracking-widest hover:text-zinc-300">{sc.happened}</summary>
      <dl className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
        {fields.map((f) => {
          const v = value(f);
          return v === null ? null : (
            <div key={f} className="contents">
              <dt className="text-zinc-500">{sc.checks[f]}</dt>
              <dd className="font-mono text-zinc-300">{v}</dd>
            </div>
          );
        })}
        {(["holder", "rival"] as const).map((side) => (
          <div key={side} className="contents">
            <dt className="text-zinc-500">{sc.checks[side]}</dt>
            <dd className="text-zinc-300">{holdings(side)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
