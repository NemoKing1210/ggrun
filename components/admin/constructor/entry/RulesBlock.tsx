"use client";

import { ArrowDownIcon, ArrowUpIcon, ExclamationTriangleIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { EntryDescription } from "@/components/iee/EntryDescription";
import { Select } from "@/components/ui/Select";
import {
  LIMITS,
  actionsAt,
  conditionsAt,
  scopeOf,
  triggerShape,
  triggersFor,
  type ActionOp,
  type ConditionOp,
  type RuleDoc,
} from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  defaultAction,
  defaultCondition,
  issueSpot,
  issuesAt,
  move,
  newRule,
  updateRule,
} from "@/lib/modules/iee/library/draft";

import { issueText, primitiveLabel } from "../issue-text";
import { Block } from "../parts";
import { issuesWhere, useEditor } from "./editor-context";
import { ActionFields, ConditionFields } from "./ops";

const PRIORITIES = ["early", "normal", "late"] as const;

/**
 * Rules (plan §6 task 3.2): each a card "When · If · Do". Every choice is a
 * typed control; the vocabulary decides what a moment offers, so a condition
 * or an action that cannot run there is never offered (spec §6.7).
 */
export function RulesBlock() {
  const { t } = useI18n();
  const r = t.ieeEditor.entry.rules;
  const { doc, update, readOnly, analysis } = useEditor();
  const issues = issuesWhere(analysis, (s) => s.block === "rules");
  // Findings about the rules as a whole: none at all, no "when used" rule.
  const general = issues.errors.filter((i) => issueSpot(i.path).rule === undefined);

  return (
    <Block id="block-rules" title={t.ieeEditor.entry.blocks.rules} errors={issues.errors.length} warnings={issues.warnings.length}>
      {general.map((i, n) => (
        <p key={n} className="mb-2 flex items-start gap-1.5 text-sm text-danger">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {issueText(i, t)}
        </p>
      ))}
      {doc.rules.length === 0 && general.length === 0 && <p className="mb-3 text-sm text-dim">{r.empty}</p>}
      <div className="flex flex-col gap-3">
        {doc.rules.map((rule, index) => (
          <RuleCard key={index} rule={rule} index={index} count={doc.rules.length} />
        ))}
      </div>
      {!readOnly && (
        <button
          type="button"
          className="hud-btn mt-3 inline-flex items-center gap-1.5 text-xs"
          disabled={doc.rules.length >= LIMITS.rules}
          onClick={() => update((d) => ({ ...d, rules: [...d.rules, newRule(d.kind, triggerShape(d))] }))}
        >
          <PlusIcon className="size-4" aria-hidden />
          {r.add}
        </button>
      )}
    </Block>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
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

function RuleCard({ rule, index, count }: { rule: RuleDoc; index: number; count: number }) {
  const { t, locale } = useI18n();
  const r = t.ieeEditor.entry.rules;
  const { doc, update, readOnly, analysis } = useEditor();
  const scope = scopeOf(doc);
  const triggers: string[] = triggersFor(doc.kind, triggerShape(doc));
  if (rule.when && !triggers.includes(rule.when)) triggers.push(rule.when);
  const conditions = rule.if ?? [];
  const actions = rule.do;
  const ruleIssues = issuesWhere(analysis, (s) => s.rule === index);
  const head = ruleIssues.errors.filter((i) => {
    const spot = issueSpot(i.path);
    return spot.part === undefined || spot.part === "when" || spot.part === "priority" || spot.item === undefined;
  });
  const broken = analysis.brokenRules.includes(index);
  const sentence = analysis.ruleSentences[index];
  const set = (change: (rule: RuleDoc) => RuleDoc) => update((d) => updateRule(d, index, change));
  const triggerHints = t.ieeEditor.vocab.triggers as Record<string, { hint: string } | undefined>;

  return (
    <article
      id={`rule-${index}`}
      className={`scroll-mt-24 border bg-[#1a1a1a] p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${
        ruleIssues.errors.length > 0 ? "border-danger/50" : "border-[#3d3d34]"
      }`}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xs uppercase tracking-widest text-zinc-300">{format(r.rule, { number: String(index + 1) })}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="w-32" title={r.priorityHint}>
            <Select
              value={rule.priority ?? "normal"}
              disabled={readOnly}
              aria-label={r.priority}
              onChange={(e) => set((x) => ({ ...x, priority: e.target.value as RuleDoc["priority"] }))}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {r.priorities[p]}
                </option>
              ))}
            </Select>
          </div>
          {!readOnly && (
            <>
              <IconButton label={r.moveUp} disabled={index === 0} onClick={() => update((d) => ({ ...d, rules: move(d.rules, index, -1) }))}>
                <ArrowUpIcon className="size-3.5" aria-hidden />
              </IconButton>
              <IconButton
                label={r.moveDown}
                disabled={index === count - 1}
                onClick={() => update((d) => ({ ...d, rules: move(d.rules, index, 1) }))}
              >
                <ArrowDownIcon className="size-3.5" aria-hidden />
              </IconButton>
              <IconButton label={r.removeRule} onClick={() => update((d) => ({ ...d, rules: d.rules.filter((_, i) => i !== index) }))}>
                <TrashIcon className="size-3.5" aria-hidden />
              </IconButton>
            </>
          )}
        </div>
      </header>

      {head.map((i, n) => (
        <p key={n} className="mb-2 flex items-start gap-1.5 text-xs text-danger">
          <ExclamationTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {issueText(i, t)}
        </p>
      ))}

      <Section label={r.when}>
        <div className="max-w-xs">
          <Select
            value={rule.when}
            disabled={readOnly}
            aria-label={r.when}
            invalid={!rule.when}
            onChange={(e) => set((x) => ({ ...x, when: e.target.value }))}
          >
            {!rule.when && <option value="">—</option>}
            {triggers.map((tr) => (
              <option key={tr} value={tr}>
                {primitiveLabel(tr, t)}
              </option>
            ))}
          </Select>
        </div>
        {triggerHints[rule.when]?.hint && <p className="mt-1 text-xs text-zinc-500">{triggerHints[rule.when]!.hint}</p>}
      </Section>

      <Section label={r.if}>
        {conditions.length === 0 && <p className="text-sm text-dim">{r.always}</p>}
        <ul className="flex flex-col gap-2">
          {conditions.map((op, item) => (
            <OpRow key={item} index={index} part="if" item={item} total={conditions.length} op={op} />
          ))}
        </ul>
        {!readOnly && conditionsAt(rule.when, scope).length > 0 && conditions.length < LIMITS.conditionsPerRule && (
          <AddPicker
            label={r.addCondition}
            options={conditionsAt(rule.when, scope).map((op) => ({ value: op, label: primitiveLabel(op, t) }))}
            onPick={(op) => set((x) => ({ ...x, if: [...(x.if ?? []), defaultCondition(op as ConditionOp)] }))}
          />
        )}
      </Section>

      <Section label={r.do} last>
        <ul className="flex flex-col gap-2">
          {actions.map((op, item) => (
            <OpRow key={item} index={index} part="do" item={item} total={actions.length} op={op} />
          ))}
        </ul>
        {!readOnly && actionsAt(rule.when, scope).length > 0 && actions.length < LIMITS.actionsPerRule && (
          <AddPicker
            label={r.addAction}
            options={actionsAt(rule.when, scope).map((op) => ({ value: op, label: primitiveLabel(op, t) }))}
            onPick={(op) =>
              set((x) => ({
                ...x,
                do: [...x.do, defaultAction(op as ActionOp, { scope, when: x.when, character: doc.character })],
              }))
            }
          />
        )}
      </Section>

      <div className="mt-3 border-t border-[#2a2a22] pt-2">
        <p className="font-display text-[10px] uppercase tracking-widest text-dim">{r.reads}</p>
        {broken || !sentence ? (
          <p className="mt-1 text-xs text-amber">{r.unreadable}</p>
        ) : (
          <EntryDescription tone="dense" className="!mt-0.5">
            {sentence[locale]}
          </EntryDescription>
        )}
      </div>
    </article>
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

/** "Add condition…" — a dropdown of what the moment offers; picking adds it. */
function AddPicker({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="mt-2 max-w-xs">
      <Select
        value=""
        aria-label={label}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** One condition or action: its name, its typed fields, its findings. */
function OpRow({
  index,
  part,
  item,
  total,
  op,
}: {
  index: number;
  part: "if" | "do";
  item: number;
  total: number;
  op: RuleDoc["do"][number];
}) {
  const { t } = useI18n();
  const r = t.ieeEditor.entry.rules;
  const { update, readOnly, analysis } = useEditor();
  const errors = issuesAt(analysis.errors, index, part, item);
  const warnings = issuesAt(analysis.warnings, index, part, item);
  const path = { rule: index, part, item };
  const hints = (part === "if" ? t.ieeEditor.vocab.conditions : t.ieeEditor.vocab.actions) as Record<string, { hint: string } | undefined>;
  const setList = (change: (list: RuleDoc["do"]) => RuleDoc["do"]) =>
    update((d) => updateRule(d, index, (rule) => ({ ...rule, [part]: change(rule[part] ?? []) })));

  return (
    <li
      className={`border-l-2 pl-3 ${errors.length > 0 ? "border-danger" : warnings.length > 0 ? "border-amber/60" : "border-[#3d3d34]"}`}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-display text-xs uppercase tracking-widest text-zinc-100">{primitiveLabel(op.op, t)}</span>
          {hints[op.op]?.hint && <span className="ml-2 text-xs text-zinc-500">{hints[op.op]!.hint}</span>}
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            {part === "do" && total > 1 && (
              <>
                <IconButton label={r.moveUp} disabled={item === 0} onClick={() => setList((list) => move(list, item, -1))}>
                  <ArrowUpIcon className="size-3" aria-hidden />
                </IconButton>
                <IconButton label={r.moveDown} disabled={item === total - 1} onClick={() => setList((list) => move(list, item, 1))}>
                  <ArrowDownIcon className="size-3" aria-hidden />
                </IconButton>
              </>
            )}
            <IconButton label={t.ieeEditor.remove} onClick={() => setList((list) => list.filter((_, i) => i !== item))}>
              <TrashIcon className="size-3" aria-hidden />
            </IconButton>
          </div>
        )}
      </div>
      {part === "if" ? <ConditionFields op={op} path={path} /> : <ActionFields op={op} path={path} />}
      {errors.map((i, n) => (
        <p key={`e${n}`} className="mt-1 text-xs text-danger">
          {issueText(i, t)}
        </p>
      ))}
      {warnings.map((i, n) => (
        <p key={`w${n}`} className="mt-1 text-xs text-amber">
          {issueText(i, t)}
        </p>
      ))}
    </li>
  );
}
