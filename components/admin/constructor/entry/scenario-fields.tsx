"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import {
  CELL_TYPES,
  DECIDE_OPTIONS,
  DRAW_REFUSALS,
  LIMITS,
  SCENARIO_GAMES,
  USE_REFUSALS,
  type CellType,
  type ScenarioGame,
  type ScenarioPick,
  type ScenarioDoc,
  type ScenarioEntry,
  type ScenarioGiven,
  type ScenarioHolding,
  type ScenarioStep,
  type StepObservation,
} from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import {
  addObservedCheck,
  checksOf,
  removeCheck,
  setCheck,
  STEP_CHECKS,
  type CheckField,
} from "@/lib/modules/iee/library/scenario-draft";

import { useEditor } from "./editor-context";

type Side = "holder" | "rival";

/** A whole number, or nothing: an empty box leaves the scenario season's default. */
export function NumberBox({
  value,
  onChange,
  label,
  placeholder,
  min,
  max,
  required = false,
  invalid = false,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label: string;
  placeholder?: string;
  min?: number;
  max?: number;
  required?: boolean;
  invalid?: boolean;
}) {
  const { readOnly } = useEditor();
  return (
    <Input
      type="number"
      inputMode="numeric"
      step={1}
      min={min}
      max={max}
      value={value === undefined ? "" : String(value)}
      placeholder={placeholder}
      aria-label={label}
      disabled={readOnly}
      invalid={invalid || (required && value === undefined)}
      className="!py-1.5 font-mono"
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") return onChange(required ? value : undefined);
        const n = Number(raw);
        if (Number.isInteger(n)) onChange(n);
      }}
    />
  );
}

/**
 * Picks an entry a scenario names: this entry itself, or any other in the
 * library — grouped by pack, the way the rules' picker does it.
 */
export function ScenarioEntryPicker({
  value,
  onChange,
  onClear,
  label,
  kind = null,
  allowSelf = true,
}: {
  value: ScenarioEntry | { entry: string } | undefined;
  onChange: (entry: ScenarioEntry) => void;
  /** An optional pick: "—" clears it. */
  onClear?: () => void;
  label: string;
  kind?: "item" | "effect" | null;
  allowSelf?: boolean;
}) {
  const { t, locale } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { refs, readOnly, doc, entryId } = useEditor();
  const selected = value === undefined ? "" : value === "self" ? "self" : value.entry;
  const options = refs.filter(
    (r) => r.entryId !== entryId && (kind === null || r.kind === kind) && (r.available || r.entryId === selected),
  );
  const packs = [...new Map(options.map((r) => [r.packId, r.packName[locale]])).entries()];
  const selfAllowed = allowSelf && (kind === null || doc.kind === kind);
  return (
    <Select
      value={selected}
      disabled={readOnly}
      aria-label={label}
      invalid={selected === "" && !onClear}
      className="!py-1.5"
      onChange={(e) => {
        const id = e.target.value;
        if (id === "" && onClear) return onClear();
        if (id === "self") return onChange("self");
        const ref = refs.find((r) => r.entryId === id);
        if (ref) onChange({ entry: ref.entryId, slug: ref.slug });
      }}
    >
      {onClear ? <option value="">—</option> : selected === "" && <option value="">{t.ieeEditor.entry.picker.choose}</option>}
      {selfAllowed && <option value="self">{sc.self}</option>}
      {packs.map(([packId, packName]) => (
        <optgroup key={packId} label={packName}>
          {options
            .filter((r) => r.packId === packId)
            .map((r) => (
              <option key={r.entryId} value={r.entryId}>
                {(r.name[locale] ?? r.name.ru) || r.slug} ({r.slug})
                {!r.published ? ` · ${t.ieeEditor.entry.picker.notPublished}` : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

function SmallButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
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

/** Entries with how many copies: what someone carries, or holds after a step. */
function EntryCountList({
  rows,
  onChange,
  label,
  min,
  max,
  addLabel,
}: {
  rows: readonly { entry: ScenarioEntry; count?: number }[];
  onChange: (rows: { entry: ScenarioEntry; count?: number }[]) => void;
  label: string;
  min: number;
  max: number;
  addLabel: string;
}) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly } = useEditor();
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <ScenarioEntryPicker
              value={row.entry}
              label={label}
              onChange={(entry) => onChange(rows.map((r, n) => (n === i ? { ...r, entry } : r)))}
            />
          </div>
          <div className="w-20 shrink-0" title={sc.count}>
            <NumberBox
              value={row.count ?? (min > 0 ? 1 : undefined)}
              label={sc.count}
              min={min}
              max={max}
              required
              onChange={(count) => onChange(rows.map((r, n) => (n === i ? { ...r, count: count ?? r.count } : r)))}
            />
          </div>
          {!readOnly && (
            <SmallButton label={t.ieeEditor.remove} onClick={() => onChange(rows.filter((_, n) => n !== i))}>
              <TrashIcon className="size-3" aria-hidden />
            </SmallButton>
          )}
        </div>
      ))}
      {!readOnly && rows.length < LIMITS.scenarioCarries && (
        <button
          type="button"
          className="hud-btn inline-flex w-fit items-center gap-1 !px-2 !py-1 text-[11px]"
          onClick={() => onChange([...rows, { entry: "self", count: 1 }])}
        >
          <PlusIcon className="size-3.5" aria-hidden />
          {addLabel}
        </button>
      )}
    </div>
  );
}

/** The items a choice picks — the newest held of each, in order (wave B, spec §7.6). */
function PickList({ picks, onChange, label }: { picks: readonly ScenarioEntry[]; onChange: (picks: ScenarioEntry[]) => void; label: string }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly } = useEditor();
  return (
    <div className="flex flex-col gap-1.5">
      {picks.map((pick, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <ScenarioEntryPicker
              value={pick}
              kind="item"
              label={label}
              onChange={(entry) => onChange(picks.map((p, n) => (n === i ? entry : p)))}
            />
          </div>
          {!readOnly && (
            <SmallButton label={t.ieeEditor.remove} onClick={() => onChange(picks.filter((_, n) => n !== i))}>
              <TrashIcon className="size-3" aria-hidden />
            </SmallButton>
          )}
        </div>
      ))}
      {!readOnly && picks.length < 3 && (
        <button
          type="button"
          className="hud-btn inline-flex w-fit items-center gap-1 !px-2 !py-1 text-[11px]"
          onClick={() => onChange([...picks, "self"])}
        >
          <PlusIcon className="size-3.5" aria-hidden />
          {sc.addPick}
        </button>
      )}
    </div>
  );
}

/** Faces after the first throw — "1, 4" — as a list; an empty box clears it. */
export function parseFaces(text: string): number[] | undefined {
  const faces = text
    .split(/[\s,;]+/)
    .filter((part) => part.length > 0)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 20)
    .slice(0, 8);
  return faces.length > 0 ? faces : undefined;
}

function FacesBox({ value, onChange, label }: { value: number[] | undefined; onChange: (faces: number[] | undefined) => void; label: string }) {
  const { readOnly } = useEditor();
  const shown = (value ?? []).join(", ");
  const [draft, setDraft] = useState(shown);
  // A run or an undo replaces the step: show what it holds now.
  useEffect(() => setDraft(shown), [shown]);
  return (
    <Input
      value={draft}
      disabled={readOnly}
      aria-label={label}
      placeholder="—"
      inputMode="numeric"
      className="!py-1.5"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onChange(parseFaces(draft))}
    />
  );
}

function Labeled({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-display text-[10px] uppercase tracking-widest text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

/** A game of the scenario pool (wave C, spec §5.5) — or, with `none`, no game; with `onClear`, an optional one. */
function GameSelect({
  value,
  onChange,
  label,
  none,
  onClear,
}: {
  value: string | undefined;
  onChange: (game: ScenarioGame | "none") => void;
  label: string;
  /** "No game" is a value of its own (a check that nothing is in flight). */
  none?: string;
  onClear?: () => void;
}) {
  const { readOnly } = useEditor();
  return (
    <Select
      value={value ?? ""}
      disabled={readOnly}
      aria-label={label}
      className="!py-1.5"
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" && onClear) return onClear();
        if (v !== "") onChange(v as ScenarioGame | "none");
      }}
    >
      {onClear ? <option value="">—</option> : null}
      {none !== undefined ? <option value="none">{none}</option> : null}
      {SCENARIO_GAMES.map((g) => (
        <option key={g.key} value={g.key}>
          {g.title} · {g.genres.join(", ")} · {g.year}
        </option>
      ))}
    </Select>
  );
}

/** What a use picks for the next game in a scenario (wave C, spec §6.16): a genre, a span of years, a game of the pool. */
function PickFields({ pick, onChange }: { pick: ScenarioPick | undefined; onChange: (pick: ScenarioPick | undefined) => void }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly } = useEditor();
  const kind = pick === undefined ? "none" : "genre" in pick ? "genre" : "years" in pick ? "years" : "cell" in pick ? "cell" : "game";
  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={kind}
        disabled={readOnly}
        aria-label={sc.pick}
        className="!py-1.5"
        onChange={(e) => {
          const next = e.target.value;
          onChange(
            next === "genre"
              ? { genre: SCENARIO_GAMES[0]!.genres[0]! }
              : next === "years"
                ? { years: [1990, 1999] }
                : next === "game"
                  ? { game: SCENARIO_GAMES[0]!.key }
                  : next === "cell"
                    ? { cell: 14 }
                    : undefined,
          );
        }}
      >
        {(["none", "genre", "years", "game", "cell"] as const).map((k) => (
          <option key={k} value={k}>
            {sc.pickKinds[k]}
          </option>
        ))}
      </Select>
      {pick && "genre" in pick ? (
        <Select value={pick.genre} disabled={readOnly} aria-label={sc.pickGenre} className="!py-1.5" onChange={(e) => onChange({ genre: e.target.value })}>
          {[...new Set(SCENARIO_GAMES.flatMap((g) => g.genres))].sort().map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </Select>
      ) : null}
      {pick && "years" in pick ? (
        <div className="grid grid-cols-2 gap-1.5">
          <NumberBox
            value={pick.years[0]}
            label={`${sc.pick} · ${sc.pickFrom}`}
            min={1970}
            max={2100}
            required
            onChange={(from) => onChange({ years: [from ?? pick.years[0], Math.max(from ?? pick.years[0], pick.years[1])] })}
          />
          <NumberBox
            value={pick.years[1]}
            label={`${sc.pick} · ${sc.pickTo}`}
            min={1970}
            max={2100}
            required
            onChange={(to) => onChange({ years: [Math.min(pick.years[0], to ?? pick.years[1]), to ?? pick.years[1]] })}
          />
        </div>
      ) : null}
      {pick && "game" in pick ? <GameSelect value={pick.game} label={`${sc.pick} · ${sc.pickKinds.game}`} onChange={(game) => game !== "none" && onChange({ game })} /> : null}
      {/* The cell an item places itself on (wave D, spec §6.18). */}
      {pick && "cell" in pick ? (
        <NumberBox value={pick.cell} label={`${sc.pick} · ${sc.pickKinds.cell}`} min={0} max={39} required onChange={(cell) => onChange({ cell: cell ?? pick.cell })} />
      ) : null}
    </div>
  );
}

/** Objects standing on the board before the first step (wave D, spec §6.18): the item, its cell, whose it is. */
function ObjectList({ rows, onChange }: { rows: NonNullable<ScenarioGiven["objects"]>; onChange: (rows: NonNullable<ScenarioGiven["objects"]>) => void }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly } = useEditor();
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <ScenarioEntryPicker value={row.entry} label={sc.objectItem} onChange={(entry) => onChange(rows.map((r, n) => (n === i ? { ...r, entry } : r)))} />
          </div>
          <div className="w-20 shrink-0" title={sc.objectCell}>
            <NumberBox value={row.cell} label={sc.objectCell} min={0} max={39} required onChange={(cell) => onChange(rows.map((r, n) => (n === i ? { ...r, cell: cell ?? r.cell } : r)))} />
          </div>
          <Select
            value={row.owner ?? "holder"}
            disabled={readOnly}
            aria-label={sc.objectOwner}
            className="!w-auto !py-1.5"
            onChange={(e) => onChange(rows.map((r, n) => (n === i ? { ...r, owner: e.target.value as Side } : r)))}
          >
            <option value="holder">{sc.holder}</option>
            <option value="rival">{sc.rival}</option>
          </Select>
          {!readOnly && (
            <SmallButton label={t.ieeEditor.remove} onClick={() => onChange(rows.filter((_, n) => n !== i))}>
              <TrashIcon className="size-3" aria-hidden />
            </SmallButton>
          )}
        </div>
      ))}
      {!readOnly && rows.length < 4 && (
        <button
          type="button"
          className="hud-btn inline-flex w-fit items-center gap-1 !px-2 !py-1 text-[11px]"
          onClick={() => onChange([...rows, { entry: "self", cell: 14 }])}
        >
          <PlusIcon className="size-3.5" aria-hidden />
          {sc.addObject}
        </button>
      )}
    </div>
  );
}

/** Given: who stands where with what, and the season's few settings. */
export function GivenFields({ scenario, onChange }: { scenario: ScenarioDoc; onChange: (given: ScenarioGiven) => void }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly } = useEditor();
  const given = scenario.given ?? {};
  const setSide = (side: Side, patch: Record<string, unknown>) =>
    onChange({ ...given, [side]: { ...(given[side] ?? {}), ...patch } });

  const player = (side: Side) => {
    const g = given[side] ?? {};
    return (
      <div className="flex flex-col gap-2 border border-[#2a2a22] bg-black/20 p-2">
        <p className="font-display text-[11px] uppercase tracking-widest text-zinc-300">{sc[side]}</p>
        <div className="grid grid-cols-2 gap-2">
          <Labeled label={sc.position}>
            <NumberBox
              value={g.position}
              label={`${sc[side]} · ${sc.position}`}
              placeholder={side === "holder" ? "10" : "12"}
              min={0}
              max={39}
              onChange={(position) => setSide(side, { position })}
            />
          </Labeled>
          <Labeled label={sc.points}>
            <NumberBox
              value={g.balance}
              label={`${sc[side]} · ${sc.points}`}
              placeholder="5"
              min={0}
              max={99}
              onChange={(balance) => setSide(side, { balance })}
            />
          </Labeled>
          {/* What «Магнит» compares against: the dice sum of their last move — none unless set. */}
          <Labeled label={sc.lastRoll}>
            <NumberBox
              value={g.lastRoll}
              label={`${sc[side]} · ${sc.lastRoll}`}
              placeholder="—"
              min={1}
              max={60}
              onChange={(lastRoll) => setSide(side, { lastRoll })}
            />
          </Labeled>
        </div>
        <Switch size="sm" checked={g.inFlight === true || g.game !== undefined} disabled={readOnly || g.game !== undefined} label={sc.inFlight} onChange={(inFlight) => setSide(side, { inFlight })} />
        {/* The scenario pool (wave C, spec §5.5): the game in flight, and the games passed so far. */}
        <Labeled label={sc.playing}>
          <GameSelect
            value={g.game}
            label={`${sc[side]} · ${sc.playing}`}
            onChange={(game) => game !== "none" && setSide(side, { game })}
            onClear={() => setSide(side, { game: undefined })}
          />
        </Labeled>
        <div role="group" aria-label={`${sc[side]} · ${sc.passedGames}`}>
          <p className="mb-1 font-display text-[10px] uppercase tracking-widest text-zinc-400">{sc.passedGames}</p>
          <div className="flex flex-wrap gap-1">
            {SCENARIO_GAMES.map((game) => {
              const on = (g.passed ?? []).includes(game.key);
              return (
                <Chip
                  key={game.key}
                  size="sm"
                  active={on}
                  disabled={readOnly}
                  onClick={() =>
                    setSide(side, {
                      passed: SCENARIO_GAMES.map((x) => x.key).filter((k) => (k === game.key ? !on : (g.passed ?? []).includes(k))),
                    })
                  }
                >
                  {game.title}
                </Chip>
              );
            })}
          </div>
        </div>
        {side === "rival" && (
          <Switch
            size="sm"
            variant="danger"
            checked={given.rival?.left === true}
            disabled={readOnly}
            label={sc.left}
            onChange={(left) => setSide("rival", { left })}
          />
        )}
        <div>
          <p className="mb-1 font-display text-[10px] uppercase tracking-widest text-zinc-400">{sc.carries}</p>
          <EntryCountList
            rows={g.carries ?? []}
            label={`${sc[side]} · ${sc.carries}`}
            min={1}
            max={4}
            addLabel={sc.addCarry}
            onChange={(carries) => setSide(side, { carries })}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-2">
        {player("holder")}
        {player("rival")}
      </div>
      <p className="font-display text-[11px] uppercase tracking-widest text-zinc-300">{sc.season}</p>
      <p className="text-xs leading-relaxed text-zinc-500">{sc.poolHint}</p>
      <div className="grid gap-2 sm:grid-cols-[8rem_auto_minmax(0,14rem)] sm:items-end">
        <Labeled label={sc.sides}>
          <NumberBox value={given.sides} label={sc.sides} placeholder="6" min={2} max={20} onChange={(sides) => onChange({ ...given, sides })} />
        </Labeled>
        <div className="pb-1.5">
          <Switch size="sm" checked={given.loop === true} disabled={readOnly} label={sc.loop} onChange={(loop) => onChange({ ...given, loop })} />
        </div>
        <Labeled label={sc.draws}>
          <Select
            value={given.draws ?? "low"}
            disabled={readOnly}
            aria-label={sc.draws}
            className="!py-1.5"
            onChange={(e) => onChange({ ...given, draws: e.target.value as "low" | "high" })}
          >
            <option value="low">{sc.drawsLow}</option>
            <option value="high">{sc.drawsHigh}</option>
          </Select>
        </Labeled>
      </div>
      <div>
        <p className="mb-1 font-display text-[10px] uppercase tracking-widest text-zinc-400">{sc.objects}</p>
        <ObjectList
          rows={given.objects ?? []}
          onChange={(objects) => {
            const { objects: _old, ...rest } = given;
            onChange(objects.length === 0 ? rest : { ...rest, objects });
          }}
        />
      </div>
    </div>
  );
}

/** When: what the step does, by kind. */
export function StepWhenFields({ step, onChange }: { step: ScenarioStep; onChange: (step: ScenarioStep) => void }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly, doc } = useEditor();

  if (step.do === "roll") {
    return (
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Labeled label={sc.rolls}>
          <Select
            value={step.by ?? "holder"}
            disabled={readOnly}
            aria-label={sc.rolls}
            className="!py-1.5"
            onChange={(e) => onChange({ ...step, by: e.target.value as Side })}
          >
            <option value="holder">{sc.who.holder}</option>
            <option value="rival">{sc.who.rival}</option>
          </Select>
        </Labeled>
        <Labeled label={sc.game}>
          <Select
            value={step.outcome}
            disabled={readOnly}
            aria-label={sc.game}
            className="!py-1.5"
            onChange={(e) => onChange({ ...step, outcome: e.target.value as "passed" | "dropped" })}
          >
            <option value="passed">{sc.outcome.passed}</option>
            <option value="dropped">{sc.outcome.dropped}</option>
          </Select>
        </Labeled>
        <Labeled label={sc.dice}>
          <NumberBox value={step.dice} label={sc.dice} min={0} max={60} required onChange={(dice) => onChange({ ...step, dice: dice ?? step.dice })} />
        </Labeled>
        <Labeled label={sc.thenFaces}>
          <FacesBox
            value={step.then}
            label={sc.thenFaces}
            onChange={(then) => {
              const { then: _then, ...rest } = step;
              onChange(then ? { ...rest, then } : rest);
            }}
          />
        </Labeled>
        <Labeled label={sc.cell}>
          <Select
            value={step.cell ?? "normal"}
            disabled={readOnly}
            aria-label={sc.cell}
            className="!py-1.5"
            onChange={(e) => onChange({ ...step, cell: e.target.value as CellType })}
          >
            {CELL_TYPES.filter((c) => c !== "custom").map((c) => (
              <option key={c} value={c}>
                {t.core.cellTypes[c]}
              </option>
            ))}
          </Select>
        </Labeled>
        {/* In the reaction window (wave B, spec §7.4): the reaction item the roller uses, or none — they accept. */}
        <Labeled label={sc.react}>
          <ScenarioEntryPicker
            value={step.react}
            label={sc.react}
            onChange={(entry) => onChange({ ...step, react: entry })}
            onClear={() => {
              const { react: _react, ...rest } = step;
              onChange(rest);
            }}
          />
        </Labeled>
      </div>
    );
  }

  if (step.do === "use") {
    const itemValue = step.item === undefined ? (doc.kind === "item" ? "self" : undefined) : step.item;
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Labeled label={sc.item}>
          <ScenarioEntryPicker
            value={itemValue}
            kind="item"
            label={sc.item}
            onChange={(entry) => {
              const { item: _item, ...rest } = step;
              onChange(entry === "self" ? rest : { ...rest, item: entry });
            }}
          />
        </Labeled>
        {/* Who uses it — the rival too, aiming at the holder (wave B, spec §6.13). */}
        <Labeled label={sc.usedBy}>
          <Select
            value={step.by ?? "holder"}
            disabled={readOnly}
            aria-label={sc.usedBy}
            className="!py-1.5"
            onChange={(e) => {
              const { by: _by, ...rest } = step;
              onChange(e.target.value === "rival" ? { ...rest, by: "rival" } : rest);
            }}
          >
            <option value="holder">{sc.who.holder}</option>
            <option value="rival">{sc.who.rival}</option>
          </Select>
        </Labeled>
        <Labeled label={sc.aimed}>
          <Select
            value={step.on ?? ""}
            disabled={readOnly}
            aria-label={sc.aimed}
            className="!py-1.5"
            onChange={(e) => {
              const { on: _on, ...rest } = step;
              onChange(e.target.value ? { ...rest, on: e.target.value as "rival" | "holder" | "nobody" } : rest);
            }}
          >
            <option value="">—</option>
            <option value="rival">{sc.on.rival}</option>
            <option value="holder">{sc.on.holder}</option>
            <option value="nobody">{sc.on.nobody}</option>
          </Select>
        </Labeled>
        {/* What an item that asks for a pick takes: the holder's newest of this entry (spec §6.10). */}
        <Labeled label={sc.choose}>
          <ScenarioEntryPicker
            value={step.choose}
            label={sc.choose}
            onChange={(entry) => onChange({ ...step, choose: entry })}
            onClear={() => {
              const { choose: _choose, ...rest } = step;
              onChange(rest);
            }}
          />
        </Labeled>
        {/* What an item that asks for a pick from the season's catalog takes (spec §6.12). */}
        <Labeled label={sc.chooseEntry}>
          <ScenarioEntryPicker
            value={step.chooseEntry}
            label={sc.chooseEntry}
            onChange={(entry) => onChange({ ...step, chooseEntry: entry })}
            onClear={() => {
              const { chooseEntry: _chooseEntry, ...rest } = step;
              onChange(rest);
            }}
          />
        </Labeled>
        {/* What an item that asks for a pick for the next game takes (wave C, spec §6.16). */}
        <div role="group" aria-label={sc.pick} className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-[10px] uppercase tracking-widest text-zinc-400">{sc.pick}</span>
          <PickFields
            pick={step.pick}
            onChange={(pick) => {
              const { pick: _pick, ...rest } = step;
              onChange(pick ? { ...rest, pick } : rest);
            }}
          />
        </div>
        {/* A choice of games the use opens — a game rerolled (spec §7.12): the game it takes. */}
        <Labeled label={sc.take}>
          <GameSelect
            value={step.take}
            label={sc.take}
            onChange={(take) => take !== "none" && onChange({ ...step, take })}
            onClear={() => {
              const { take: _take, ...rest } = step;
              onChange(rest);
            }}
          />
        </Labeled>
      </div>
    );
  }

  if (step.do === "draw") {
    // The next game picked, as rolling picks it (wave C, spec §7.12): whose, and the game a choice takes.
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Labeled label={sc.drawnBy}>
          <Select
            value={step.by ?? "holder"}
            disabled={readOnly}
            aria-label={sc.drawnBy}
            className="!py-1.5"
            onChange={(e) => {
              const { by: _by, ...rest } = step;
              onChange(e.target.value === "rival" ? { ...rest, by: "rival" } : rest);
            }}
          >
            <option value="holder">{sc.who.holder}</option>
            <option value="rival">{sc.who.rival}</option>
          </Select>
        </Labeled>
        <Labeled label={sc.take}>
          <GameSelect
            value={step.take}
            label={sc.take}
            onChange={(take) => take !== "none" && onChange({ ...step, take })}
            onClear={() => {
              const { take: _take, ...rest } = step;
              onChange(rest);
            }}
          />
        </Labeled>
      </div>
    );
  }

  if (step.do === "decide") {
    // Who answers their pending choice, which way, and what it picks (wave B, spec §7.6).
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Labeled label={sc.decidedBy}>
          <Select
            value={step.by ?? "holder"}
            disabled={readOnly}
            aria-label={sc.decidedBy}
            className="!py-1.5"
            onChange={(e) => {
              const { by: _by, ...rest } = step;
              onChange(e.target.value === "rival" ? { ...rest, by: "rival" } : rest);
            }}
          >
            <option value="holder">{sc.who.holder}</option>
            <option value="rival">{sc.who.rival}</option>
          </Select>
        </Labeled>
        <Labeled label={sc.option}>
          <Select
            value={step.option ?? ""}
            disabled={readOnly}
            aria-label={sc.option}
            className="!py-1.5"
            onChange={(e) => {
              const { option: _option, picks: _picks, ...rest } = step;
              const option = e.target.value as (typeof DECIDE_OPTIONS)[number] | "";
              // The default needs no picks, and enduring gives nothing.
              onChange(option === "" ? rest : option === "endure" ? { ...rest, option } : { ...rest, option, ...(step.picks ? { picks: step.picks } : {}) });
            }}
          >
            <option value="">{sc.options.default}</option>
            {DECIDE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {sc.options[o]}
              </option>
            ))}
          </Select>
        </Labeled>
        {step.option === "discard" || step.option === "retain" ? (
          // A group, not a label: a label would name the list's first control after itself.
          <div role="group" aria-label={sc.picks} className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <span className="font-display text-[10px] uppercase tracking-widest text-zinc-400">{sc.picks}</span>
            <PickList
              picks={step.picks ?? []}
              label={sc.picks}
              onChange={(picks) => {
                const { picks: _picks, ...rest } = step;
                onChange(picks.length > 0 ? { ...rest, picks } : rest);
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Labeled label={sc.entry}>
        <ScenarioEntryPicker value={step.entry} label={sc.entry} onChange={(entry) => onChange({ ...step, entry })} />
      </Labeled>
      <Labeled label={sc.to}>
        <Select
          value={step.to ?? "holder"}
          disabled={readOnly}
          aria-label={sc.to}
          className="!py-1.5"
          onChange={(e) => onChange({ ...step, to: e.target.value as Side })}
        >
          <option value="holder">{sc.who.holder}</option>
          <option value="rival">{sc.who.rival}</option>
        </Select>
      </Labeled>
      {/* As staff hand out, past every answer — or as a drop the recipient's entries may answer (spec §6.13). */}
      <Labeled label={sc.via}>
        <Select
          value={step.via ?? "staff"}
          disabled={readOnly}
          aria-label={sc.via}
          className="!py-1.5"
          onChange={(e) => {
            const { via: _via, ...rest } = step;
            onChange(e.target.value === "wheel" ? { ...rest, via: "wheel" } : rest);
          }}
        >
          <option value="staff">{sc.vias.staff}</option>
          <option value="wheel">{sc.vias.wheel}</option>
        </Select>
      </Labeled>
    </div>
  );
}

/** One expectation's control, typed by what it checks. */
function CheckControl({ step, field, onChange }: { step: ScenarioStep; field: CheckField; onChange: (step: ScenarioStep) => void }) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly } = useEditor();
  const value = (step.expect as Record<string, unknown> | undefined)?.[field];
  const label = sc.checks[field];
  const set = (v: unknown) => onChange(setCheck(step, field, v));

  switch (field) {
    case "cellFires":
      return (
        <div role="group" aria-label={label}>
          <Switch size="sm" checked={value === true} disabled={readOnly} label={value === true ? sc.yes : sc.no} onChange={set} />
        </div>
      );
    case "wheel":
    case "wheelAgain":
      return (
        <Select value={String(value ?? "none")} disabled={readOnly} aria-label={label} className="!py-1.5" onChange={(e) => set(e.target.value)}>
          {(["none", "bonus", "penalty"] as const).map((w) => (
            <option key={w} value={w}>
              {sc.wheel[w]}
            </option>
          ))}
        </Select>
      );
    case "window":
      return (
        <Select value={String(value ?? "none")} disabled={readOnly} aria-label={label} className="!py-1.5" onChange={(e) => set(e.target.value)}>
          {(["none", "accepted", "used"] as const).map((w) => (
            <option key={w} value={w}>
              {sc.windowStates[w]}
            </option>
          ))}
        </Select>
      );
    case "decision":
      return (
        <Select value={String(value ?? "pending")} disabled={readOnly} aria-label={label} className="!py-1.5" onChange={(e) => set(e.target.value)}>
          {(["pending", "none"] as const).map((d) => (
            <option key={d} value={d}>
              {sc.decisionStates[d]}
            </option>
          ))}
        </Select>
      );
    case "game":
      return <GameSelect value={String(value ?? "none")} label={label} none={sc.gameNone} onChange={set} />;
    case "result": {
      const options =
        step.do === "grant"
          ? (["granted", "refreshed", "refused"] as const)
          : step.do === "decide"
            ? (["decided", "refused"] as const)
            : step.do === "draw"
              ? (["drawn", "choosing", "refused"] as const)
              : (["used", "refused"] as const);
      return (
        <Select value={String(value ?? options[0])} disabled={readOnly} aria-label={label} className="!py-1.5" onChange={(e) => set(e.target.value)}>
          {options.map((r) => (
            <option key={r} value={r}>
              {sc.results[r]}
            </option>
          ))}
        </Select>
      );
    }
    case "reason": {
      // A draw is refused in its own words (wave C, spec §7.12); a use in the item path's.
      const codes: readonly string[] = step.do === "draw" ? DRAW_REFUSALS : USE_REFUSALS;
      return (
        <Select value={String(value ?? codes[0])} disabled={readOnly} aria-label={label} className="!py-1.5" onChange={(e) => set(e.target.value)}>
          {codes.map((code) => (
            <option key={code} value={code}>
              {(t.core.errors as Record<string, string>)[code] ?? code}
            </option>
          ))}
        </Select>
      );
    }
    case "holder":
    case "rival":
      return (
        <EntryCountList
          rows={(value as ScenarioHolding[] | undefined) ?? []}
          label={label}
          min={0}
          max={8}
          addLabel={sc.addCarry}
          onChange={(rows) => {
            const holdings = rows.map((r) => ({ entry: r.entry, count: r.count ?? 1 }));
            onChange(holdings.length > 0 ? setCheck(step, field, holdings) : removeCheck(step, field));
          }}
        />
      );
    default:
      return (
        <div className="w-32">
          <NumberBox
            value={typeof value === "number" ? value : undefined}
            label={label}
            required
            min={
              field === "diceSides"
                ? 2
                : field === "diceCount" || field === "position" || field === "rivalPosition" || field === "offered" || field === "conditions" || field === "objects"
                  ? 0
                  : -99
            }
            max={field === "moved" ? 60 : field === "position" || field === "rivalPosition" ? 39 : field === "offered" ? 5 : field === "conditions" || field === "objects" ? 8 : 99}
            onChange={(n) => set(n ?? value)}
          />
        </div>
      );
  }
}

/** Then: the step's checks, each with its control and what the last run saw. */
export function StepThenFields({
  step,
  onChange,
  verdict,
  observed = null,
}: {
  step: ScenarioStep;
  onChange: (step: ScenarioStep) => void;
  /** For each checked field, the last run's word on it. */
  verdict: (field: CheckField) => React.ReactNode;
  /** What the step did in the last run: a new check starts from it. */
  observed?: StepObservation | null;
}) {
  const { t } = useI18n();
  const sc = t.ieeEditor.entry.scenarios;
  const { readOnly } = useEditor();
  const present = checksOf(step);
  const addable = (STEP_CHECKS[step.do] as readonly CheckField[]).filter(
    (f) => !present.includes(f) || f === "holder" || f === "rival",
  );
  return (
    <div className="flex flex-col gap-2">
      {present.map((field) => (
        <div key={field} className="grid gap-1.5 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start">
          <span className="pt-1.5 font-display text-[11px] uppercase tracking-widest text-zinc-400">{sc.checks[field]}</span>
          <div className="min-w-0">
            <CheckControl step={step} field={field} onChange={onChange} />
            {verdict(field)}
          </div>
          {!readOnly && (
            <SmallButton label={t.ieeEditor.remove} onClick={() => onChange(removeCheck(step, field))}>
              <TrashIcon className="size-3" aria-hidden />
            </SmallButton>
          )}
        </div>
      ))}
      {!readOnly && addable.length > 0 && (
        <div className="max-w-xs">
          <Select
            value=""
            aria-label={sc.addCheck}
            className="!py-1.5"
            onChange={(e) => {
              if (e.target.value) onChange(addObservedCheck(step, e.target.value as CheckField, observed));
            }}
          >
            <option value="">{sc.addCheck}</option>
            {addable.map((f) => (
              <option key={f} value={f}>
                {sc.checks[f]}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
