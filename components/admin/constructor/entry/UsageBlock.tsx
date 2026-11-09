"use client";

import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { EntryDoc } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";

import { issueText } from "../issue-text";
import { Block, GroupLabel } from "../parts";
import { fieldError, issuesWhere, useEditor } from "./editor-context";

/** Windows this build carries (spec §6.7); the after-dice window arrives with wave B. */
const WINDOWS = ["anytime", "before_roll", "on_open_roll"] as const;
const TARGETS = ["self", "other", "any", "none"] as const;
const ACTIVATIONS = ["active", "passive", "cursed"] as const;
const FILTERS = ["ahead", "behind", "nearest_ahead", "nearest_behind", "leader"] as const;
/** What a use may ask its user to pick for their next game (wave C, spec §6.16). */
const PICKS = ["none", "genre", "years", "game", "cell"] as const;

type Usage = NonNullable<EntryDoc["usage"]>;
type Activation = Usage["activation"];

/** A whole number from an input, or undefined when it is empty. */
export function intOf(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/**
 * The usage an item starts with when its activation changes (spec §6.10): an
 * active item is used — when, on whom, how many times; a passive one works
 * while held; a cursed one works by itself and fires once by default.
 */
function usageFor(next: Activation, current: Usage): Usage {
  const unique = current.unique !== undefined ? { unique: current.unique } : {};
  if (next === "active") return { activation: "active", charges: current.charges ?? 1, ...unique };
  if (next === "passive") return { activation: "passive", ...unique };
  return { activation: "cursed", charges: current.charges ?? 1 };
}

/** Usage (plan §6 task 3.2): how a player uses an item, or how it works without being used — items only. */
export function UsageBlock() {
  const { t } = useI18n();
  const u = t.ieeEditor.entry.usage;
  const { doc, update, readOnly, analysis } = useEditor();
  const usage: Usage = doc.usage ?? { activation: "active", charges: 1 };
  const issues = issuesWhere(analysis, (s) => s.block === "usage");
  const err = (field: string) => {
    const issue = fieldError(analysis, "usage", field);
    return issue ? issueText(issue, t) : undefined;
  };
  const set = (patch: Partial<Usage>) => update((d) => ({ ...d, usage: { ...usage, ...patch } }));
  const activation = usage.activation;
  const active = activation === "active";
  const who = usage.target?.who ?? "self";
  const aimed = who === "other" || who === "any";

  // A cursed item is a penalty, and a penalty item is cursed (D3): the character follows.
  const setActivation = (next: Activation) =>
    update((d) => ({
      ...d,
      character: next === "cursed" ? "penalty" : d.character === "penalty" ? "bonus" : d.character,
      usage: usageFor(next, usage),
    }));

  return (
    <Block id="block-usage" title={t.ieeEditor.entry.blocks.usage} errors={issues.errors.length} warnings={issues.warnings.length}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <GroupLabel hint={u.activationHints[activation]}>{u.activation}</GroupLabel>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVATIONS.map((a) => (
              <Chip key={a} active={activation === a} disabled={readOnly} onClick={() => activation !== a && setActivation(a)}>
                {u.activations[a]}
              </Chip>
            ))}
          </div>
        </div>

        {active && (
          <Field label={u.window} error={err("window")}>
            <Select
              value={usage.window ?? "anytime"}
              disabled={readOnly}
              onChange={(e) => set({ window: e.target.value as Usage["window"] })}
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {t.iee.admin.window[w]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {active && (
          <div>
            <GroupLabel hint={u.targetHints[who]}>{u.target}</GroupLabel>
            <div className="flex flex-wrap gap-1.5">
              {TARGETS.map((w) => (
                <Chip
                  key={w}
                  active={who === w}
                  disabled={readOnly}
                  onClick={() =>
                    // A filter belongs to an item aimed at a player.
                    set({ target: w === "other" || w === "any" ? { ...usage.target, who: w } : { who: w } })
                  }
                >
                  {t.iee.admin.target[w]}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {active && aimed && (
          <Field label={u.filter} hint={u.filterHint} error={err("target.filter")}>
            <Select
              value={usage.target?.filter ?? ""}
              disabled={readOnly}
              onChange={(e) => {
                const filter = e.target.value as (typeof FILTERS)[number] | "";
                set({ target: filter ? { who, filter } : { who } });
              }}
            >
              <option value="">{u.filterNone}</option>
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {t.iee.panel.filter[f]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {active && (
          <div className="md:col-span-2">
            <GroupLabel hint={u.pickHint}>{u.pick}</GroupLabel>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={u.pick}>
              {PICKS.map((p) => (
                <Chip
                  key={p}
                  active={(usage.pick ?? "none") === p}
                  disabled={readOnly}
                  // A pick shapes the user's own next game: the item is used on them (§6.16).
                  onClick={() => set(p === "none" ? { pick: undefined } : { pick: p, target: { who: "self" } })}
                >
                  {u.picks[p]}
                </Chip>
              ))}
            </div>
            {err("pick") && <p className="mt-1 text-xs text-danger">{err("pick")}</p>}
          </div>
        )}

        <Field
          label={active ? u.charges : u.fires}
          hint={active ? u.chargesHint : activation === "passive" ? u.firesHintPassive : u.firesHintCursed}
          error={err("charges")}
        >
          <Input
            type="number"
            min={1}
            max={99}
            value={usage.charges ?? ""}
            disabled={readOnly}
            invalid={err("charges") !== undefined}
            onChange={(e) => set({ charges: intOf(e.target.value) })}
          />
        </Field>

        <div className="flex flex-col justify-end gap-2">
          {/* Cursed items are always unique (spec §6.10): the switch shows it, it does not offer it. One in the season is one per player too. */}
          <Switch
            checked={activation === "cursed" || usage.unique === true || usage.unique === "season"}
            disabled={readOnly || activation === "cursed" || usage.unique === "season"}
            onChange={(on) => set({ unique: on ? true : undefined })}
            label={u.unique}
            description={u.uniqueHint}
          />
          {/* One in the season (wave D, spec §6.19): handed out once, it changes hands. */}
          <Switch
            checked={usage.unique === "season"}
            disabled={readOnly}
            onChange={(on) => set({ unique: on ? "season" : undefined })}
            label={u.seasonUnique}
            description={u.seasonUniqueHint}
          />
        </div>
      </div>
    </Block>
  );
}
