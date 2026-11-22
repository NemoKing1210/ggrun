"use client";

import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { COUNTED_UNITS, type EntryDoc } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";

import { issueText } from "../issue-text";
import { Block, GroupLabel } from "../parts";
import { fieldError, issuesWhere, useEditor } from "./editor-context";
import { intOf } from "./UsageBlock";

/** Units this build carries (spec §6.4). */
const UNITS = ["instant", "rolls", "moves", "passed_games", "triggers", "next_game", "permanent"] as const;
const MODES = ["unique", "refresh", "stack"] as const;

type Duration = NonNullable<EntryDoc["duration"]>;
type Stacking = NonNullable<EntryDoc["stacking"]>;

/** Duration and stacking (plan §6 task 3.2): how long an effect lasts and what a second one does — effects only. */
export function DurationBlock() {
  const { t } = useI18n();
  const d = t.ieeEditor.entry.duration;
  const { doc, update, readOnly, analysis } = useEditor();
  const duration: Duration = doc.duration ?? { unit: "rolls", count: 1 };
  const stacking: Stacking = doc.stacking ?? { mode: "refresh" };
  const issues = issuesWhere(analysis, (s) => s.block === "duration");
  const err = (field: string) => {
    const issue = fieldError(analysis, "duration", field);
    return issue ? issueText(issue, t) : undefined;
  };
  const unit = (UNITS as readonly string[]).includes(duration.unit) ? (duration.unit as (typeof UNITS)[number]) : "rolls";
  const counted = COUNTED_UNITS.has(duration.unit);

  const setUnit = (next: (typeof UNITS)[number]) =>
    update((doc) => {
      // A counted unit keeps the count it had (or starts at one); `next_game` and `permanent` take none.
      const out = { ...doc, duration: COUNTED_UNITS.has(next) ? { unit: next, count: duration.count ?? 1 } : { unit: next } };
      // An instant effect keeps nothing, so it has nothing to stack.
      if (next === "instant") delete out.stacking;
      return out;
    });
  const setStacking = (patch: Partial<Stacking>) => update((doc) => ({ ...doc, stacking: { ...stacking, ...patch } }));

  return (
    <Block id="block-duration" title={t.ieeEditor.entry.blocks.duration} errors={issues.errors.length} warnings={issues.warnings.length}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={d.unit} hint={d.unitHints[unit]} error={err("duration.unit")}>
          <Select value={unit} disabled={readOnly} onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {d.units[u]}
              </option>
            ))}
          </Select>
        </Field>

        {counted && (
          <Field label={d.count} hint={d.countHint} error={err("duration.count")}>
            <Input
              type="number"
              min={1}
              max={99}
              value={duration.count ?? ""}
              disabled={readOnly}
              invalid={err("duration.count") !== undefined}
              onChange={(e) => update((doc) => ({ ...doc, duration: { ...duration, count: intOf(e.target.value) } }))}
            />
          </Field>
        )}

        {unit === "instant" ? (
          // An instant effect keeps nothing: there is no second one to stack or refresh.
          <p className="text-sm text-zinc-400 md:col-span-2">{d.instantStacking}</p>
        ) : (
          <div className="md:col-span-2">
            <GroupLabel hint={d.stackingHints[stacking.mode]}>{d.stacking}</GroupLabel>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <Chip
                  key={m}
                  active={stacking.mode === m}
                  disabled={readOnly}
                  onClick={() =>
                    update((doc) => ({
                      ...doc,
                      // `maxStacks` belongs to `stack` only (§14).
                      stacking: m === "stack" ? { ...stacking, mode: m } : { mode: m },
                    }))
                  }
                >
                  {d.stackingModes[m]}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {unit !== "instant" && stacking.mode === "stack" && (
          <Field label={d.maxStacks} hint={d.maxStacksHint} error={err("stacking.maxStacks")}>
            <Input
              type="number"
              min={1}
              max={99}
              value={stacking.maxStacks ?? ""}
              disabled={readOnly}
              onChange={(e) => {
                const n = intOf(e.target.value);
                setStacking({ maxStacks: n });
              }}
            />
          </Field>
        )}
      </div>
    </Block>
  );
}
