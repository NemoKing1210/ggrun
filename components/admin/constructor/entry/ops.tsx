"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useId } from "react";

import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import {
  ACTIONS,
  CELL_TYPES,
  LIMITS,
  RARITIES,
  isActionOp,
  recipientsAt,
  scopeOf,
  sourcesAt,
  type EntryDoc,
  type OpDoc,
  type ValueSourceName,
} from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { declareParam, defaultSource, updateOp, withField } from "@/lib/modules/iee/library/draft";

import { useEditor } from "./editor-context";
import { intOf } from "./UsageBlock";

/** Where an operation sits in the draft: rule, part, position. */
export interface OpPath {
  rule: number;
  part: "if" | "do";
  item: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Sets one field of the operation at `path`. */
function useOpField(path: OpPath) {
  const { update } = useEditor();
  return (key: string, value: unknown) => update((d) => updateOp(d, path.rule, path.part, path.item, (op) => withField(op, key, value)));
}

/** Replaces the operation at `path` — for a primitive whose shapes differ (a place: `is` or `lte`). */
function useReplaceOp(path: OpPath) {
  const { update } = useEditor();
  return (next: OpDoc) => update((d) => updateOp(d, path.rule, path.part, path.item, () => next));
}

type Mode = "number" | "param" | "random" | "table" | "source";

function modeOf(value: unknown): Mode {
  if (isRecord(value) && typeof value.param === "string") return "param";
  if (isRecord(value) && Array.isArray(value.random)) return "random";
  if (isRecord(value) && isRecord(value.table)) return "table";
  if (isRecord(value) && typeof value.source === "string") return "source";
  return "number";
}

/**
 * What a number of an action may read from the game here (spec §6.5): only a
 * field whose sentence can say it, and only what the moment knows.
 */
function sourcesFor(doc: EntryDoc, path: OpPath, field: string): ValueSourceName[] {
  if (path.part !== "do") return [];
  const rule = doc.rules[path.rule];
  const op = rule?.do[path.item]?.op;
  if (!rule || !op || !isActionOp(op) || !(ACTIONS[op].sourceFields ?? []).includes(field)) return [];
  return sourcesAt(scopeOf(doc), rule.when);
}

type TableRow = { upTo: number; value: number };

/** A die table as the editor holds it — whatever the draft has, made readable. */
function tableOf(value: unknown): { die: number; rows: TableRow[] } {
  const table = isRecord(value) && isRecord(value.table) ? value.table : {};
  const rows = Array.isArray(table.rows)
    ? table.rows.filter(isRecord).map((r) => ({ upTo: Number(r.upTo) || 1, value: Number(r.value) || 0 }))
    : [];
  return { die: Number(table.die) || 6, rows };
}

/**
 * A number in a rule (spec §6.5): a literal, a parameter the season may tune,
 * or a server-side random range. Switching to "Parameter" declares one from
 * the current number — that is how a value becomes tunable.
 */
export function ValueInput({
  path,
  field,
  opName,
  allowRandom = true,
  allowTable = false,
  suffix,
  label,
}: {
  path: OpPath;
  /** The operation's field holding the value. */
  field: string;
  /** The operation's name — names a new parameter (`steps.delta` → `steps`). */
  opName: string;
  allowRandom?: boolean;
  /** A die rolled on a table («Кубик хаоса») — offered where the rule text can say it. */
  allowTable?: boolean;
  suffix?: string;
  label: string;
}) {
  const { t } = useI18n();
  const v = t.ieeEditor.entry.value;
  const { doc, update, readOnly } = useEditor();
  const op = doc.rules[path.rule]?.[path.part]?.[path.item];
  const value = op?.[field];
  const mode = modeOf(value);
  const set = useOpField(path);
  const intParams = Object.entries(doc.params ?? {}).filter(([, d]) => d.type === "int");

  /** The number the value stands for now — what a mode switch carries over. */
  const current = (): number => {
    if (typeof value === "number") return value;
    if (mode === "param" && isRecord(value)) {
      const decl = doc.params?.[String(value.param)];
      return decl && decl.type === "int" ? decl.default : 0;
    }
    if (mode === "random" && isRecord(value) && Array.isArray(value.random)) return Number(value.random[0]) || 0;
    if (mode === "table") return tableOf(value).rows.at(-1)?.value ?? 0;
    if (mode === "source" && isRecord(value) && typeof value.multiplier === "number") return value.multiplier;
    return 0;
  };
  const sources = sourcesFor(doc, path, field);

  const declare = () =>
    update((d) => {
      const { doc: next, name } = declareParam(d, `${opName}.${field}`, current());
      return updateOp(next, path.rule, path.part, path.item, (o) => withField(o, field, { param: name }));
    });

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (next === "number") set(field, current());
    else if (next === "param") {
      if (intParams.length > 0) set(field, { param: intParams[0]![0] });
      else declare();
    } else if (next === "table") {
      // A d6 to start from: a bad third, a quiet third, a good third.
      const n = current() || 1;
      set(field, { table: { die: 6, rows: [{ upTo: 2, value: -Math.abs(n) }, { upTo: 4, value: 0 }, { upTo: 6, value: Math.abs(n) }] } });
    } else if (next === "source") {
      set(field, defaultSource(sources[0] ?? "itemCount", doc.character));
    } else {
      const n = current();
      set(field, { random: [Math.min(n, n + 2), Math.max(n, n + 2)] });
    }
  };

  const modes: Mode[] = [
    "number",
    "param",
    ...(allowRandom ? (["random"] as const) : []),
    ...(allowTable ? (["table"] as const) : []),
    // Read from the game — where the sentence can say it and the moment knows it.
    ...(sources.length > 0 || mode === "source" ? (["source"] as const) : []),
  ];

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <div className="flex flex-wrap gap-1">
        {modes.map((m) => (
          <Chip key={m} size="sm" active={mode === m} disabled={readOnly} onClick={() => switchTo(m)}>
            {v[m]}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {mode === "number" && (
          <Input
            type="number"
            className="!w-28"
            value={typeof value === "number" ? value : ""}
            disabled={readOnly}
            aria-label={label}
            onChange={(e) => set(field, intOf(e.target.value))}
          />
        )}
        {mode === "param" && isRecord(value) && (
          <div className="w-48">
            <Select
              value={String(value.param)}
              disabled={readOnly}
              aria-label={label}
              onChange={(e) => (e.target.value === "__new" ? declare() : set(field, { param: e.target.value }))}
            >
              {!intParams.some(([name]) => name === value.param) && <option value={String(value.param)}>{String(value.param)}</option>}
              {intParams.map(([name, decl]) => (
                <option key={name} value={name}>
                  {name} = {decl.default as number}
                </option>
              ))}
              <option value="__new">{v.newParam}</option>
            </Select>
          </div>
        )}
        {mode === "random" && isRecord(value) && Array.isArray(value.random) && (
          <RandomRange
            range={value.random as unknown[]}
            readOnly={readOnly}
            label={label}
            words={v}
            onChange={(range) => set(field, { random: range })}
          />
        )}
        {mode === "table" && (
          <DieTable table={tableOf(value)} readOnly={readOnly} label={label} words={v} onChange={(table) => set(field, { table })} />
        )}
        {mode === "source" && isRecord(value) && (
          <SourcePicker value={value} offered={sources} readOnly={readOnly} label={label} onChange={(next) => set(field, next)} />
        )}
        {suffix && <span className="font-mono text-xs text-dim">{suffix}</span>}
      </div>
    </div>
  );
}

/**
 * A number read from the game (spec §6.5): the dice result, the items held —
 * which of them, so much per item — or the chosen player's last roll.
 */
function SourcePicker({
  value,
  offered,
  readOnly,
  label,
  onChange,
}: {
  value: Record<string, unknown>;
  offered: readonly ValueSourceName[];
  readOnly: boolean;
  label: string;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const v = t.ieeEditor.entry.value;
  const { doc } = useEditor();
  const source = String(value.source) as ValueSourceName;
  const options = offered.includes(source) ? offered : [...offered, source];
  const character = typeof value.character === "string" ? value.character : "";
  const multiplier = typeof value.multiplier === "number" ? value.multiplier : 1;
  return (
    <>
      <div className="w-60">
        <Select
          value={source}
          disabled={readOnly}
          aria-label={label}
          onChange={(e) => onChange(defaultSource(e.target.value as ValueSourceName, doc.character))}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {(v.sources as Record<string, string>)[o] ?? o}
            </option>
          ))}
        </Select>
      </div>
      {source === "itemCount" && (
        <>
          <div className="w-40">
            <Select
              value={character}
              disabled={readOnly}
              aria-label={v.itemsOf}
              onChange={(e) => {
                const { character: _drop, ...rest } = value;
                onChange(e.target.value ? { ...rest, character: e.target.value } : rest);
              }}
            >
              <option value="">{v.itemsAll}</option>
              <option value="bonus">{v.itemsBonus}</option>
              <option value="penalty">{v.itemsCursed}</option>
            </Select>
          </div>
          <span className="text-xs text-dim">{v.perItem}</span>
          <Input
            type="number"
            className="!w-24"
            value={multiplier}
            disabled={readOnly}
            aria-label={`${label} ${v.perItem}`}
            onChange={(e) => onChange({ ...value, multiplier: intOf(e.target.value) ?? 0 })}
          />
        </>
      )}
    </>
  );
}

function RandomRange({
  range,
  readOnly,
  label,
  words,
  onChange,
}: {
  range: unknown[];
  readOnly: boolean;
  label: string;
  words: { from: string; to: string };
  onChange: (range: [number, number]) => void;
}) {
  const low = Number(range[0]) || 0;
  const high = Number(range[1]) || 0;
  return (
    <>
      <span className="text-xs text-dim">{words.from}</span>
      <Input
        type="number"
        className="!w-24"
        value={low}
        disabled={readOnly}
        aria-label={`${label} ${words.from}`}
        onChange={(e) => onChange([intOf(e.target.value) ?? 0, high])}
      />
      <span className="text-xs text-dim">{words.to}</span>
      <Input
        type="number"
        className="!w-24"
        value={high}
        disabled={readOnly}
        aria-label={`${label} ${words.to}`}
        onChange={(e) => onChange([low, intOf(e.target.value) ?? 0])}
      />
    </>
  );
}

/**
 * A die rolled on a table (spec §6.5): the die, then a row per stretch of its
 * faces — "up to 5 → −2". The last row always reaches the die's highest face.
 */
function DieTable({
  table,
  readOnly,
  label,
  words,
  onChange,
}: {
  table: { die: number; rows: TableRow[] };
  readOnly: boolean;
  label: string;
  words: { die: string; upTo: string; addRow: string; removeRow: string };
  onChange: (table: { die: number; rows: TableRow[] }) => void;
}) {
  const { die, rows } = table;
  const setRow = (i: number, patch: Partial<TableRow>) => onChange({ die, rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-xs text-dim">
        {words.die}
        <Input
          type="number"
          className="!w-20"
          min={2}
          max={100}
          value={die}
          disabled={readOnly}
          aria-label={`${label} ${words.die}`}
          onChange={(e) => {
            const next = intOf(e.target.value) ?? die;
            // The last row follows the die: it covers its highest face.
            onChange({ die: next, rows: rows.map((r, i) => (i === rows.length - 1 ? { ...r, upTo: next } : r)) });
          }}
        />
      </label>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-dim">{words.upTo}</span>
          <Input
            type="number"
            className="!w-20"
            min={1}
            max={die}
            value={row.upTo}
            disabled={readOnly || i === rows.length - 1}
            aria-label={`${label} ${words.upTo} ${i + 1}`}
            onChange={(e) => setRow(i, { upTo: intOf(e.target.value) ?? row.upTo })}
          />
          <span className="font-mono text-xs text-dim">→</span>
          <Input
            type="number"
            className="!w-20"
            value={row.value}
            disabled={readOnly}
            aria-label={`${label} ${i + 1}`}
            onChange={(e) => setRow(i, { value: intOf(e.target.value) ?? 0 })}
          />
          {rows.length > 2 && (
            <button
              type="button"
              className="hud-btn !px-2 !py-1"
              disabled={readOnly}
              aria-label={`${words.removeRow} ${i + 1}`}
              onClick={() => {
                const next = rows.filter((_, j) => j !== i);
                next[next.length - 1] = { ...next[next.length - 1]!, upTo: die };
                onChange({ die, rows: next });
              }}
            >
              <TrashIcon className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      ))}
      {rows.length < 12 && (
        <button
          type="button"
          className="hud-btn self-start !px-2 !py-1 text-xs"
          disabled={readOnly || rows.length >= die}
          onClick={() => {
            // A new row splits the last stretch: it ends a face before the die.
            const last = rows[rows.length - 1]!;
            const before = rows.length > 1 ? rows[rows.length - 2]!.upTo : 0;
            const split = Math.max(before + 1, die - 1);
            onChange({ die, rows: [...rows.slice(0, -1), { upTo: split, value: last.value }, { upTo: die, value: last.value }] });
          }}
        >
          <PlusIcon className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {words.addRow}
        </button>
      )}
    </div>
  );
}

/**
 * Picks a library entry for a reference (spec §10.3): by entry, never by
 * revision. Grouped by pack; an entry not published yet is marked — it
 * resolves only once published, or when the pack is published with it.
 */
export function EntryRefPicker({
  kind,
  value,
  onChange,
  label,
}: {
  kind: "item" | "effect" | null;
  value: unknown;
  onChange: (ref: { entry: string; slug: string } | undefined) => void;
  label: string;
}) {
  const { t, locale } = useI18n();
  const p = t.ieeEditor.entry.picker;
  const { refs, readOnly } = useEditor();
  const selected = isRecord(value) && typeof value.entry === "string" ? value.entry : "";
  const options = refs.filter((r) => (kind === null || r.kind === kind) && (r.available || r.entryId === selected));
  const packs = [...new Map(options.map((r) => [r.packId, r.packName[locale]])).entries()];

  if (options.length === 0) {
    return <p className="text-xs text-dim">{format(p.noOptions, { kind: kind ? t.ieeEditor.kind[kind] : t.ieeEditor.any })}</p>;
  }

  return (
    <Select
      value={selected}
      disabled={readOnly}
      aria-label={label}
      invalid={selected === ""}
      onChange={(e) => {
        const ref = refs.find((r) => r.entryId === e.target.value);
        onChange(ref ? { entry: ref.entryId, slug: ref.slug } : undefined);
      }}
    >
      <option value="">{p.choose}</option>
      {packs.map(([packId, packName]) => (
        <optgroup key={packId} label={packName}>
          {options
            .filter((r) => r.packId === packId)
            .map((r) => (
              <option key={r.entryId} value={r.entryId}>
                {(r.name[locale] ?? r.name.ru) || r.slug} ({r.slug})
                {!r.published ? ` · ${p.notPublished}` : ""}
                {!r.available ? ` · ${p.archived}` : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** "The holder" / "the chosen player", offered only where a chosen player exists (§6.7). */
function RecipientSelect({ path, field, value, label }: { path: OpPath; field: string; value: unknown; label: string }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { doc, readOnly } = useEditor();
  const set = useOpField(path);
  const when = doc.rules[path.rule]?.when ?? "";
  const options: string[] = recipientsAt(scopeOf(doc), when);
  const current = typeof value === "string" ? value : "self";
  if (!options.includes(current)) options.push(current);
  return (
    <div className="w-56">
      <Select value={current} disabled={readOnly} aria-label={label} onChange={(e) => set(field, e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "target" ? f.target : f.self}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Whom a swap trades places with: the chosen player where there is one, or the nearest rival behind. */
function SwapWith({ path, value }: { path: OpPath; value: unknown }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { doc, readOnly } = useEditor();
  const set = useOpField(path);
  const when = doc.rules[path.rule]?.when ?? "";
  const options: string[] = recipientsAt(scopeOf(doc), when).includes("target") ? ["target", "nearestBehind"] : ["nearestBehind"];
  const current = typeof value === "string" ? value : "nearestBehind";
  if (!options.includes(current)) options.push(current);
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <Chip key={o} size="sm" active={current === o} disabled={readOnly} onClick={() => set("with", o)}>
          {o === "target" ? f.target : f.nearestBehind}
        </Chip>
      ))}
    </div>
  );
}

/** Which rarities an item operation takes (wave B, spec §6.12): any, or the ones picked. */
function RarityChips({ path, value }: { path: OpPath; value: unknown }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { readOnly } = useEditor();
  const set = useOpField(path);
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip size="sm" active={chosen.length === 0} disabled={readOnly} onClick={() => set("rarity", undefined)}>
        {f.anyRarity}
      </Chip>
      {RARITIES.map((r) => (
        <Chip
          key={r}
          size="sm"
          active={chosen.includes(r)}
          disabled={readOnly}
          onClick={() => {
            // Kept in the rarities' own order, so the sentence reads the same however they were picked.
            const next = chosen.includes(r) ? chosen.filter((x) => x !== r) : RARITIES.filter((x) => x === r || chosen.includes(x));
            set("rarity", next.length > 0 ? next : undefined);
          }}
        >
          {t.iee.rarity[r]}
        </Chip>
      ))}
    </div>
  );
}

/** How many items an operation moves: 1–8. */
function ItemCountInput({ path, value }: { path: OpPath; value: unknown }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { readOnly } = useEditor();
  const set = useOpField(path);
  return (
    <Input
      type="number"
      min={1}
      max={8}
      className="!w-24"
      value={typeof value === "number" ? value : 1}
      disabled={readOnly}
      aria-label={f.count}
      onChange={(e) => {
        const n = intOf(e.target.value);
        // One is the default: the document says nothing.
        set("count", n === 1 ? undefined : n);
      }}
    />
  );
}

/** Whom a gift goes to: the chosen player where there is one, or a random rival. */
function TransferTo({ path, value }: { path: OpPath; value: unknown }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { doc, readOnly } = useEditor();
  const set = useOpField(path);
  const when = doc.rules[path.rule]?.when ?? "";
  const options: string[] = recipientsAt(scopeOf(doc), when).includes("target") ? ["target", "randomRival"] : ["randomRival"];
  const current = typeof value === "string" ? value : "randomRival";
  if (!options.includes(current)) options.push(current);
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <Chip key={o} size="sm" active={current === o} disabled={readOnly} onClick={() => set("to", o)}>
          {o === "target" ? f.target : f.randomRival}
        </Chip>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <span className="w-28 shrink-0 pt-1.5 font-display text-[11px] uppercase tracking-widest text-zinc-400">{label}</span>
      <div className="min-w-0 flex-1">
        {children}
        {hint ? <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
      </div>
    </div>
  );
}

/** The fields of one condition, typed by its primitive (spec §6.2, §6.7). */
export function ConditionFields({ op, path }: { op: OpDoc; path: OpPath }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { doc, readOnly, tags } = useEditor();
  const set = useOpField(path);
  const replace = useReplaceOp(path);
  const when = doc.rules[path.rule]?.when ?? "";

  switch (op.op) {
    case "outcome":
      return (
        <Row label={f.outcomeIs}>
          <div className="flex gap-1.5">
            {(["passed", "dropped"] as const).map((is) => (
              <Chip key={is} size="sm" active={op.is === is} disabled={readOnly} onClick={() => set("is", is)}>
                {f[is]}
              </Chip>
            ))}
          </div>
        </Row>
      );
    case "cellType": {
      const cells = Array.isArray(op.in) ? (op.in as string[]) : [];
      return (
        <Row label={f.cells}>
          <div className="flex flex-wrap gap-1.5">
            {CELL_TYPES.map((c) => (
              <Chip
                key={c}
                size="sm"
                active={cells.includes(c)}
                disabled={readOnly}
                onClick={() => set("in", cells.includes(c) ? cells.filter((x) => x !== c) : [...cells, c])}
              >
                {t.core.cellTypes[c]}
              </Chip>
            ))}
          </div>
        </Row>
      );
    }
    case "chance":
      return (
        <Row label={f.percent}>
          <ValueInput path={path} field="percent" opName="chance" allowRandom={false} suffix="%" label={f.percent} />
        </Row>
      );
    case "hasEntry": {
      const recipients = recipientsAt(scopeOf(doc), when);
      const who = typeof op.who === "string" ? op.who : "self";
      const has = { entry: op.entry !== undefined, tag: op.tag !== undefined, character: op.character !== undefined };
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.who}>
            <div className="flex gap-1.5">
              {[...new Set([...recipients, who])].map((w) => (
                <Chip key={w} size="sm" active={who === w} disabled={readOnly} onClick={() => set("who", w)}>
                  {w === "target" ? f.target : f.self}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.match}>
            <div className="flex gap-1.5">
              <Chip size="sm" active={has.entry} disabled={readOnly} onClick={() => set("entry", has.entry ? undefined : null)}>
                {f.byEntry}
              </Chip>
              <Chip size="sm" active={has.tag} disabled={readOnly} onClick={() => set("tag", has.tag ? undefined : (tags[0] ?? "movement"))}>
                {f.byTag}
              </Chip>
              <Chip
                size="sm"
                active={has.character}
                disabled={readOnly}
                onClick={() => set("character", has.character ? undefined : "penalty")}
              >
                {f.byCharacter}
              </Chip>
            </div>
          </Row>
          {has.entry && (
            <Row label={f.entry}>
              <EntryRefPicker kind={null} value={op.entry} label={f.entry} onChange={(ref) => set("entry", ref ?? null)} />
            </Row>
          )}
          {has.tag && (
            <Row label={f.tag}>
              <div className="w-56">
                <Select value={String(op.tag)} disabled={readOnly} aria-label={f.tag} onChange={(e) => set("tag", e.target.value)}>
                  {[...new Set([...tags, String(op.tag)])].map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </Select>
              </div>
            </Row>
          )}
          {has.character && (
            <Row label={f.byCharacter}>
              <div className="flex gap-1.5">
                {(["bonus", "penalty"] as const).map((c) => (
                  <Chip key={c} size="sm" active={op.character === c} disabled={readOnly} onClick={() => set("character", c)}>
                    {t.ieeEditor.character[c]}
                  </Chip>
                ))}
              </div>
            </Row>
          )}
        </div>
      );
    }
    case "diceShow":
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.of}>
            <div className="flex gap-1.5">
              {(["sum", "any"] as const).map((of) => (
                <Chip key={of} size="sm" active={op.of === of} disabled={readOnly} onClick={() => set("of", of)}>
                  {of === "sum" ? f.sum : f.anyDie}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.cmp}>
            <div className="flex gap-1.5">
              {(["eq", "lte", "gte"] as const).map((cmp) => (
                <Chip key={cmp} size="sm" active={op.cmp === cmp} disabled={readOnly} onClick={() => set("cmp", cmp)}>
                  {f[cmp]}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.value}>
            <ValueInput path={path} field="value" opName="dice" allowRandom={false} label={f.value} />
          </Row>
        </div>
      );
    case "rank": {
      // The leader, the last, or within the first few (wave A).
      const mode = typeof op.lte === "number" ? "top" : op.is === "leader" ? "leader" : "last";
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.rankIs}>
            <div className="flex gap-1.5">
              {(["leader", "last", "top"] as const).map((m) => (
                <Chip
                  key={m}
                  size="sm"
                  active={mode === m}
                  disabled={readOnly}
                  onClick={() => mode !== m && replace(m === "top" ? { op: "rank", lte: 3 } : { op: "rank", is: m })}
                >
                  {f[m]}
                </Chip>
              ))}
            </div>
          </Row>
          {mode === "top" && (
            <Row label={f.top}>
              <Input
                type="number"
                className="!w-24"
                min={1}
                max={50}
                value={typeof op.lte === "number" ? op.lte : ""}
                disabled={readOnly}
                aria-label={f.top}
                onChange={(e) => set("lte", intOf(e.target.value))}
              />
            </Row>
          )}
        </div>
      );
    }
    case "itemCount": {
      const which = typeof op.character === "string" ? op.character : "";
      const v = t.ieeEditor.entry.value;
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.itemsOf}>
            <div className="flex gap-1.5">
              {([["", v.itemsAll], ["bonus", v.itemsBonus], ["penalty", v.itemsCursed]] as const).map(([c, text]) => (
                <Chip key={c || "all"} size="sm" active={which === c} disabled={readOnly} onClick={() => set("character", c || undefined)}>
                  {text}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.cmp}>
            <div className="flex gap-1.5">
              {(["eq", "lte", "gte"] as const).map((cmp) => (
                <Chip key={cmp} size="sm" active={op.cmp === cmp} disabled={readOnly} onClick={() => set("cmp", cmp)}>
                  {f[cmp]}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.value}>
            <ValueInput path={path} field="value" opName="items" allowRandom={false} label={f.value} />
          </Row>
        </div>
      );
    }
    case "targetRelative":
      return (
        <Row label={f.standsIs}>
          <div className="flex gap-1.5">
            {(["ahead", "behind"] as const).map((is) => (
              <Chip key={is} size="sm" active={op.is === is} disabled={readOnly} onClick={() => set("is", is)}>
                {f[is]}
              </Chip>
            ))}
          </div>
        </Row>
      );
    case "compareLastRoll":
      // «Магнит»: the holder's roll against the chosen player's last one.
      return (
        <Row label={f.rollCmp}>
          <div className="flex gap-1.5">
            {([["lt", f.lower], ["gt", f.higher]] as const).map(([cmp, text]) => (
              <Chip key={cmp} size="sm" active={op.cmp === cmp} disabled={readOnly} onClick={() => set("cmp", cmp)}>
                {text}
              </Chip>
            ))}
          </div>
        </Row>
      );
    case "incoming": {
      // What arrives (wave B, spec §6.13): a rival's harmful action, an entry of a kind and character, a move back.
      const entry = op.is === "entry";
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.incomingIs}>
            <div className="flex flex-wrap gap-1.5">
              {(["harm", "entry", "moveBack"] as const).map((is) => (
                <Chip key={is} size="sm" active={op.is === is} disabled={readOnly} onClick={() => op.is !== is && replace({ op: "incoming", is })}>
                  {f.incoming[is]}
                </Chip>
              ))}
            </div>
          </Row>
          {entry && (
            <Row label={f.kind}>
              <div className="flex gap-1.5">
                <Chip size="sm" active={op.kind === undefined} disabled={readOnly} onClick={() => set("kind", undefined)}>
                  {f.anyKind}
                </Chip>
                {(["item", "effect"] as const).map((k) => (
                  <Chip key={k} size="sm" active={op.kind === k} disabled={readOnly} onClick={() => set("kind", k)}>
                    {f.kinds[k]}
                  </Chip>
                ))}
              </div>
            </Row>
          )}
          {entry && (
            <Row label={f.byCharacter}>
              <div className="flex gap-1.5">
                <Chip size="sm" active={op.character === undefined} disabled={readOnly} onClick={() => set("character", undefined)}>
                  {f.anyCharacter}
                </Chip>
                {(["bonus", "penalty"] as const).map((c) => (
                  <Chip key={c} size="sm" active={op.character === c} disabled={readOnly} onClick={() => set("character", c)}>
                    {t.ieeEditor.character[c]}
                  </Chip>
                ))}
              </div>
            </Row>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

/** Faces a die can show on a season's ordinary dice — the reroll chips. */
const FACES = [1, 2, 3, 4, 5, 6] as const;

/** The fields of one action, typed by its primitive (spec §6.3, §6.7). */
export function ActionFields({ op, path }: { op: OpDoc; path: OpPath }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { doc, readOnly, tags } = useEditor();
  const set = useOpField(path);

  switch (op.op) {
    case "steps":
      return (
        <Row label={f.delta}>
          <ValueInput path={path} field="delta" opName="steps" label={f.delta} />
        </Row>
      );
    case "dice":
      return (
        <div className="flex flex-col gap-2">
          {(["count", "sides"] as const).map((key) => {
            const on = op[key] !== undefined;
            const label = key === "count" ? f.diceCount : f.diceSides;
            return (
              <Row key={key} label={label}>
                <div className="flex flex-col gap-1.5">
                  <Switch size="sm" checked={on} disabled={readOnly} label={label} onChange={(v) => set(key, v ? 1 : undefined)} />
                  {on && <ValueInput path={path} field={key} opName="dice" label={label} />}
                </div>
              </Row>
            );
          })}
        </div>
      );
    case "balance":
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.amount}>
            <ValueInput path={path} field="amount" opName="balance" label={f.amount} />
          </Row>
          <Row label={f.to}>
            <RecipientSelect path={path} field="to" value={op.to} label={f.to} />
          </Row>
        </div>
      );
    case "grantEffect":
    case "grantItem":
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.entry}>
            <EntryRefPicker
              kind={op.op === "grantEffect" ? "effect" : "item"}
              value={op.entry}
              label={f.entry}
              onChange={(ref) => set("entry", ref)}
            />
          </Row>
          <Row label={f.to}>
            <RecipientSelect path={path} field="to" value={op.to} label={f.to} />
          </Row>
        </div>
      );
    case "rerollOn": {
      const values = Array.isArray(op.values) ? (op.values as number[]) : [];
      return (
        <Row label={f.faces}>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set<number>([...FACES, ...values])].map((face) => (
              <Chip
                key={face}
                size="sm"
                active={values.includes(face)}
                disabled={readOnly || (values.length === 1 && values[0] === face)}
                onClick={() =>
                  set("values", values.includes(face) ? values.filter((x) => x !== face) : [...values, face].sort((a, b) => a - b))
                }
              >
                {face}
              </Chip>
            ))}
          </div>
        </Row>
      );
    }
    case "resultModify":
      return (
        <div className="flex flex-col gap-2">
          {(["delta", "cap"] as const).map((key) => {
            const on = op[key] !== undefined;
            const label = key === "delta" ? f.resultDelta : f.resultCap;
            const other = key === "delta" ? "cap" : "delta";
            return (
              <Row key={key} label={label}>
                <div className="flex flex-col gap-1.5">
                  <Switch
                    size="sm"
                    checked={on}
                    // One of the two must stay: a result change of nothing is not an action.
                    disabled={readOnly || (on && op[other] === undefined)}
                    label={label}
                    onChange={(v) => set(key, v ? (key === "delta" ? -1 : 3) : undefined)}
                  />
                  {on && <ValueInput path={path} field={key} opName="result" allowRandom={key === "delta"} label={label} />}
                </div>
              </Row>
            );
          })}
        </div>
      );
    case "cleanse": {
      const chosen = Array.isArray(op.tags) ? (op.tags as string[]) : [];
      const count = op.count;
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.cleanseCharacter}>
            <div className="flex gap-1.5">
              <Chip size="sm" active={op.character === undefined} disabled={readOnly} onClick={() => set("character", undefined)}>
                {f.anyCharacter}
              </Chip>
              {(["bonus", "penalty"] as const).map((c) => (
                <Chip key={c} size="sm" active={op.character === c} disabled={readOnly} onClick={() => set("character", c)}>
                  {t.ieeEditor.character[c]}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.cleanseTags}>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...tags, ...chosen])].map((tag) => (
                <Chip
                  key={tag}
                  size="sm"
                  active={chosen.includes(tag)}
                  disabled={readOnly}
                  onClick={() => {
                    const next = chosen.includes(tag) ? chosen.filter((x) => x !== tag) : [...chosen, tag];
                    set("tags", next.length > 0 ? next : undefined);
                  }}
                >
                  {tag}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.count}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip size="sm" active={count === "all"} disabled={readOnly} onClick={() => set("count", count === "all" ? 1 : "all")}>
                {f.all}
              </Chip>
              {count !== "all" && (
                <Input
                  type="number"
                  min={1}
                  max={99}
                  className="!w-24"
                  value={typeof count === "number" ? count : ""}
                  disabled={readOnly}
                  aria-label={f.count}
                  onChange={(e) => set("count", intOf(e.target.value))}
                />
              )}
            </div>
          </Row>
        </div>
      );
    }
    // Out of turn (spec §7.3): where the move goes, and whom it moves.
    case "move":
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.moveBy}>
            <ValueInput path={path} field="by" opName="move" allowTable label={f.moveBy} suffix={f.cellsSuffix} />
          </Row>
          <Row label={f.mover}>
            <RecipientSelect path={path} field="who" value={op.who} label={f.mover} />
          </Row>
        </div>
      );
    case "moveToTarget":
      return (
        <Row label={f.moveAt}>
          <div className="flex gap-1.5">
            {(["cell", "before"] as const).map((at) => (
              <Chip key={at} size="sm" active={op.at === at} disabled={readOnly} onClick={() => set("at", at)}>
                {at === "cell" ? f.atCell : f.atBefore}
              </Chip>
            ))}
          </div>
        </Row>
      );
    case "swapPositions":
      return (
        <Row label={f.swapWith}>
          <SwapWith path={path} value={op.with} />
        </Row>
      );
    case "rollbackLastMove":
      return (
        <Row label={f.mover}>
          <RecipientSelect path={path} field="who" value={op.who} label={f.mover} />
        </Row>
      );
    // Taking instances away (spec §6.10): what, whose, and how the one taken is picked.
    case "remove": {
      const when = doc.rules[path.rule]?.when ?? "";
      // Only an item's use has someone to choose, and they choose one of their own.
      const picks = when === "onUse" ? (["choice", "newest", "random"] as const) : (["newest", "random"] as const);
      const choice = op.pick === "choice";
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.removeWhat}>
            <div className="flex gap-1.5">
              {(["any", "effect", "item"] as const).map((w) => (
                <Chip key={w} size="sm" active={op.what === w} disabled={readOnly} onClick={() => set("what", w)}>
                  {f.removeWhatOptions[w]}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.cleanseCharacter}>
            <div className="flex gap-1.5">
              <Chip size="sm" active={op.character === undefined} disabled={readOnly} onClick={() => set("character", undefined)}>
                {f.anyCharacter}
              </Chip>
              {(["bonus", "penalty"] as const).map((c) => (
                <Chip key={c} size="sm" active={op.character === c} disabled={readOnly} onClick={() => set("character", c)}>
                  {t.ieeEditor.character[c]}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.removePick}>
            <div className="flex gap-1.5">
              {picks.map((pk) => (
                <Chip
                  key={pk}
                  size="sm"
                  active={op.pick === pk}
                  disabled={readOnly}
                  onClick={() => {
                    // A choice is one of the user's own: no count, no other player.
                    if (pk === "choice") {
                      set("count", undefined);
                      set("from", undefined);
                    }
                    set("pick", pk);
                  }}
                >
                  {f.removePickOptions[pk]}
                </Chip>
              ))}
            </div>
          </Row>
          {!choice && (
            <Row label={f.count}>
              <Input
                type="number"
                min={1}
                max={8}
                className="!w-24"
                value={typeof op.count === "number" ? op.count : 1}
                disabled={readOnly}
                aria-label={f.count}
                onChange={(e) => set("count", intOf(e.target.value))}
              />
            </Row>
          )}
          {!choice && (
            <Row label={f.removeFrom}>
              <RecipientSelect path={path} field="from" value={op.from} label={f.removeFrom} />
            </Row>
          )}
          {/* One named entry has its own rarity: the filter is for the rest (wave B). */}
          {op.entry === undefined && (
            <Row label={f.rarity}>
              <RarityChips path={path} value={op.rarity} />
            </Row>
          )}
        </div>
      );
    }
    // Item operations (spec §6.12): how many, of which rarities, and — for a gift — to whom.
    case "stealItem":
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.count}>
            <ItemCountInput path={path} value={op.count} />
          </Row>
          <Row label={f.rarity}>
            <RarityChips path={path} value={op.rarity} />
          </Row>
        </div>
      );
    case "transferItem":
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.transferTo}>
            <TransferTo path={path} value={op.to} />
          </Row>
          <Row label={f.count}>
            <ItemCountInput path={path} value={op.count} />
          </Row>
          <Row label={f.rarity}>
            <RarityChips path={path} value={op.rarity} />
          </Row>
        </div>
      );
    case "swapItems":
    case "copyItem":
      return (
        <Row label={f.rarity}>
          <RarityChips path={path} value={op.rarity} />
        </Row>
      );
    case "grantChosen": {
      const activations = t.ieeEditor.entry.usage.activations;
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.rarity}>
            <RarityChips path={path} value={op.rarity} />
          </Row>
          <Row label={f.activation}>
            <div className="flex flex-wrap gap-1.5">
              <Chip size="sm" active={op.activation === undefined} disabled={readOnly} onClick={() => set("activation", undefined)}>
                {f.anyActivation}
              </Chip>
              {(["active", "passive"] as const).map((a) => (
                <Chip key={a} size="sm" active={op.activation === a} disabled={readOnly} onClick={() => set("activation", a)}>
                  {activations[a]}
                </Chip>
              ))}
            </div>
          </Row>
        </div>
      );
    }
    // What an object does to a move that enters its cell (wave D, spec §6.18).
    case "push":
      return (
        <Row label={f.moveBy}>
          <ValueInput path={path} field="delta" opName="push" label={f.moveBy} suffix={f.cellsSuffix} />
        </Row>
      );
    case "extend":
      return (
        <Row label={f.further}>
          <ValueInput path={path} field="delta" opName="extend" label={f.further} suffix={f.cellsSuffix} />
        </Row>
      );
    case "extraSpin":
    case "spinInstead":
      return (
        <Row label={f.pool}>
          <div className="flex gap-1.5">
            {(["bonus", "penalty"] as const).map((pool) => (
              <Chip key={pool} size="sm" active={op.pool === pool} disabled={readOnly} onClick={() => set("pool", pool)}>
                {f.pools[pool]}
              </Chip>
            ))}
          </div>
        </Row>
      );
    // What arrives, and protection (wave B, spec §6.13): block, reflect, out of reach and no items take nothing.
    case "amplify":
      return (
        <Row label={f.factor}>
          <div className="flex gap-1.5">
            {([2, 3] as const).map((factor) => (
              <Chip key={factor} size="sm" active={op.factor === factor} disabled={readOnly} onClick={() => set("factor", factor)}>
                ×{factor}
              </Chip>
            ))}
          </div>
        </Row>
      );
    case "replace":
      return (
        <Row label={f.forward}>
          <Input
            type="number"
            className="!w-24"
            min={0}
            max={6}
            value={typeof op.with === "number" ? op.with : ""}
            disabled={readOnly}
            aria-label={f.forward}
            onChange={(e) => set("with", intOf(e.target.value))}
          />
        </Row>
      );
    case "pierce":
      return (
        <Row label={f.pierceTier}>
          <div className="flex gap-1.5">
            {([1, 2] as const).map((value) => (
              <Chip key={value} size="sm" active={op.value === value} disabled={readOnly} onClick={() => set("value", value)}>
                {f.pierceTiers[value]}
              </Chip>
            ))}
          </div>
        </Row>
      );
    // The player's choices (wave B, spec §6.14): how many items go — or may go, to be rid of the entry.
    case "victimChoice": {
      const count = typeof op.count === "number" ? op.count : 1;
      return (
        <div className="flex flex-col gap-2">
          <Row label={f.choiceCount}>
            <div className="flex gap-1.5">
              {([1, 2, 3] as const).map((n) => (
                <Chip key={n} size="sm" active={count === n} disabled={readOnly} onClick={() => set("count", n === 1 ? undefined : n)}>
                  {n}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label={f.orKeep}>
            <Chip size="sm" active={op.orKeep === true} disabled={readOnly} onClick={() => set("orKeep", op.orKeep === true ? undefined : true)}>
              {op.orKeep === true ? t.ieeEditor.entry.scenarios.yes : t.ieeEditor.entry.scenarios.no}
            </Chip>
          </Row>
        </div>
      );
    }
    case "holdLimit":
      return (
        <Row label={f.holdMax}>
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((n) => (
              <Chip key={n} size="sm" active={op.max === n} disabled={readOnly} onClick={() => set("max", n)}>
                {n}
              </Chip>
            ))}
          </div>
        </Row>
      );
    // The next game (wave C, spec §6.16): which games are left out or required, and how much a picked one weighs.
    case "poolExclude":
    case "poolRequire":
      return <PoolMatchFields op={op} path={path} />;
    case "poolFavor":
      return (
        <Row label={f.favorFactor}>
          <div className="flex gap-1.5">
            {([2, 3, 4, 5] as const).map((factor) => (
              <Chip key={factor} size="sm" active={op.factor === factor} disabled={readOnly} onClick={() => set("factor", factor)}>
                ×{factor}
              </Chip>
            ))}
          </div>
        </Row>
      );
    // A choice of games (wave C, spec §7.12): how many the draw offers.
    case "chooseOfN":
      return (
        <Row label={f.choiceOf}>
          <div className="flex gap-1.5">
            {([2, 3, 4, 5] as const).map((n) => (
              <Chip key={n} size="sm" active={op.n === n} disabled={readOnly} onClick={() => set("n", n)}>
                {n}
              </Chip>
            ))}
          </div>
        </Row>
      );
    // A game set aside (spec §6.16): how many picks later it comes back, counting the one now.
    case "postponeGame":
      return (
        <Row label={f.afterRolls} hint={f.afterRollsHint}>
          <div className="flex gap-1.5">
            {([2, 3, 4] as const).map((n) => (
              <Chip key={n} size="sm" active={(op.afterRolls ?? 2) === n} disabled={readOnly} onClick={() => set("afterRolls", n)}>
                {n}
              </Chip>
            ))}
          </div>
        </Row>
      );
    // A completion condition (spec §6.17): its text in each language — Russian is required, the others fall back to it.
    case "addCondition": {
      const text = isRecord(op.text) ? (op.text as Record<string, string | undefined>) : {};
      const setText = (loc: (typeof LOCALES)[number], value: string) => {
        const next: Record<string, string | undefined> = { ...text, [loc]: value };
        if (loc !== "ru" && !value.trim()) delete next[loc];
        set("text", { ru: "", ...next });
      };
      return (
        <Row label={f.conditionText} hint={f.conditionTextHint}>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {LOCALES.map((loc) => (
              <Input
                key={loc}
                value={text[loc] ?? ""}
                disabled={readOnly}
                maxLength={LIMITS.conditionTextLength}
                placeholder={t.ieeEditor.locales[loc]}
                aria-label={`${f.conditionText} ${t.ieeEditor.locales[loc]}`}
                invalid={loc === "ru" && !(text.ru ?? "").trim()}
                onChange={(e) => setText(loc, e.target.value)}
              />
            ))}
          </div>
        </Row>
      );
    }
    default:
      return null;
  }
}

type GenreMode = "none" | "list" | "picked" | "lastPassed" | "passed";
type SpanMode = "none" | "span" | "picked";

/**
 * Which games an exclusion or a requirement names (wave C, spec §6.16):
 * genres — listed, or one of the holder's own sets — a span of release years
 * and a rating. What the use picked is offered in an effect only: only an
 * effect remembers a pick.
 */
function PoolMatchFields({ op, path }: { op: OpDoc; path: OpPath }) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const { doc, readOnly, genres: known } = useEditor();
  const set = useOpField(path);
  const effect = doc.kind === "effect";

  const genres = op.genres;
  const genreMode: GenreMode = genres === undefined ? "none" : Array.isArray(genres) ? "list" : (String(genres) as GenreMode);
  const listed = Array.isArray(genres) ? (genres as string[]) : [];
  const genreModes: GenreMode[] = ["none", "list", ...(effect || genreMode === "picked" ? (["picked"] as const) : []), "lastPassed", "passed"];
  const setGenreMode = (mode: GenreMode) => {
    if (mode === genreMode) return;
    if (mode === "none") set("genres", undefined);
    else if (mode === "list") set("genres", [known[0] ?? "rpg"]);
    else set("genres", mode);
  };

  const years = op.years;
  const spanMode: SpanMode = years === undefined ? "none" : years === "picked" ? "picked" : "span";
  const span = isRecord(years) ? years : {};
  const spanModes: SpanMode[] = ["none", "span", ...(effect || spanMode === "picked" ? (["picked"] as const) : [])];
  const setSpanMode = (mode: SpanMode) => {
    if (mode === spanMode) return;
    if (mode === "none") set("years", undefined);
    else if (mode === "picked") set("years", "picked");
    else set("years", { max: 2009 });
  };

  const rating = isRecord(op.rating) ? op.rating : null;

  return (
    <div className="flex flex-col gap-2">
      <Row label={f.genres}>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {genreModes.map((mode) => (
              <Chip key={mode} size="sm" active={genreMode === mode} disabled={readOnly} onClick={() => setGenreMode(mode)}>
                {f.genreSets[mode]}
              </Chip>
            ))}
          </div>
          {genreMode === "list" && (
            <GenreList
              listed={listed}
              known={known}
              readOnly={readOnly}
              onChange={(next) => set("genres", next.length > 0 ? next : undefined)}
            />
          )}
        </div>
      </Row>
      <Row label={f.years}>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {spanModes.map((mode) => (
              <Chip key={mode} size="sm" active={spanMode === mode} disabled={readOnly} onClick={() => setSpanMode(mode)}>
                {f.yearsModes[mode]}
              </Chip>
            ))}
          </div>
          {spanMode === "span" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(["min", "max"] as const).map((bound) => (
                <YearBoundInput
                  key={bound}
                  label={bound === "min" ? f.yearFrom : f.yearTo}
                  value={span[bound]}
                  readOnly={readOnly}
                  onChange={(next) => {
                    const { [bound]: _drop, ...rest } = span;
                    set("years", next === undefined ? rest : { ...rest, [bound]: next });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Row>
      <Row label={f.rating}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip size="sm" active={rating === null} disabled={readOnly} onClick={() => set("rating", undefined)}>
            {f.ratingModes.none}
          </Chip>
          <Chip size="sm" active={rating !== null} disabled={readOnly} onClick={() => rating === null && set("rating", { min: 4 })}>
            {f.ratingModes.span}
          </Chip>
          {rating !== null &&
            (["min", "max"] as const).map((bound) => (
              <label key={bound} className="flex items-center gap-1.5 text-xs text-dim">
                {bound === "min" ? f.yearFrom : f.yearTo}
                <Input
                  type="number"
                  className="!w-20"
                  min={0}
                  max={5}
                  step={0.5}
                  value={typeof rating[bound] === "number" ? (rating[bound] as number) : ""}
                  disabled={readOnly}
                  aria-label={`${f.rating} ${bound === "min" ? f.yearFrom : f.yearTo}`}
                  onChange={(e) => {
                    const n = e.target.value.trim() === "" ? undefined : Number(e.target.value);
                    const { [bound]: _drop, ...rest } = rating;
                    set("rating", n === undefined || !Number.isFinite(n) ? rest : { ...rest, [bound]: n });
                  }}
                />
              </label>
            ))}
        </div>
      </Row>
    </div>
  );
}

/** Genres listed by name — lowercase, as the catalog has them; the catalog's own are offered. */
function GenreList({
  listed,
  known,
  readOnly,
  onChange,
}: {
  listed: readonly string[];
  known: readonly string[];
  readOnly: boolean;
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const f = t.ieeEditor.vocab.fields;
  const listId = useId();
  const add = (raw: string) => {
    const genre = raw.trim().toLowerCase();
    if (genre === "" || listed.includes(genre) || listed.length >= 8) return;
    onChange([...listed, genre]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {listed.map((genre) => (
          <Chip key={genre} size="sm" active disabled={readOnly} onClick={() => onChange(listed.filter((g) => g !== genre))}>
            {genre}
          </Chip>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("genre") as HTMLInputElement | null;
          if (input) {
            add(input.value);
            input.value = "";
          }
        }}
      >
        <Input name="genre" list={listId} className="!w-48" disabled={readOnly || listed.length >= 8} aria-label={f.genres} />
        <datalist id={listId}>
          {known.map((genre) => (
            <option key={genre} value={genre} />
          ))}
        </datalist>
        <button type="submit" className="hud-btn !px-2 !py-1 text-xs" disabled={readOnly || listed.length >= 8}>
          <PlusIcon className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {f.addGenre}
        </button>
        <span className="text-xs text-dim">{f.genresHint}</span>
      </form>
    </div>
  );
}

/** A year a span starts or ends at: a number, or a parameter the season may tune. */
function YearBoundInput({
  label,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  value: unknown;
  readOnly: boolean;
  onChange: (next: number | { param: string } | undefined) => void;
}) {
  const { t } = useI18n();
  const v = t.ieeEditor.entry.value;
  const { doc } = useEditor();
  const intParams = Object.entries(doc.params ?? {}).filter(([, d]) => d.type === "int");
  const param = isRecord(value) && typeof value.param === "string" ? value.param : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-dim">{label}</span>
      {intParams.length > 0 && (
        <>
          <Chip size="sm" active={param === null} disabled={readOnly} onClick={() => param !== null && onChange(undefined)}>
            {v.number}
          </Chip>
          <Chip size="sm" active={param !== null} disabled={readOnly} onClick={() => param === null && onChange({ param: intParams[0]![0] })}>
            {v.param}
          </Chip>
        </>
      )}
      {param === null ? (
        <Input
          type="number"
          className="!w-24"
          min={1970}
          max={2100}
          value={typeof value === "number" ? value : ""}
          disabled={readOnly}
          aria-label={label}
          onChange={(e) => onChange(intOf(e.target.value))}
        />
      ) : (
        <div className="w-40">
          <Select value={param} disabled={readOnly} aria-label={label} onChange={(e) => onChange({ param: e.target.value })}>
            {!intParams.some(([name]) => name === param) && <option value={param}>{param}</option>}
            {intParams.map(([name, decl]) => (
              <option key={name} value={name}>
                {name} = {decl.default as number}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
