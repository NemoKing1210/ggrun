import { describe, expect, it } from "vitest";

import { ACTIONS, AVAILABLE_STAGES, CONDITIONS, TRIGGERS } from "@/lib/engine/iee/dsl";
import { LOCALES } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import { issueText, primitiveLabel } from "./issue-text";

const t = getDictionary("en");
const ru = getDictionary("ru");
const i = t.ieeEditor.issues;

describe("the vocabulary in the reader's language", () => {
  it("every primitive the editor offers has a label and a hint in every language", () => {
    for (const locale of LOCALES) {
      const vocab = getDictionary(locale).ieeEditor.vocab as unknown as Record<string, Record<string, { label: string; hint: string } | undefined>>;
      const tables = { triggers: TRIGGERS, conditions: CONDITIONS, actions: ACTIONS } as const;
      for (const [table, defs] of Object.entries(tables)) {
        for (const [name, def] of Object.entries(defs)) {
          if (!AVAILABLE_STAGES.has(def.stage)) continue;
          const entry = vocab[table]![name];
          expect({ locale, table, name, label: Boolean(entry?.label), hint: Boolean(entry?.hint) }).toEqual({
            locale,
            table,
            name,
            label: true,
            hint: true,
          });
        }
      }
    }
  });
});

describe("issueText — the checks in the reader's language", () => {
  it("names primitives the way the forms do", () => {
    expect(primitiveLabel("afterMovement", t)).toBe(t.ieeEditor.vocab.triggers.afterMovement.label);
    expect(primitiveLabel("cellType", t)).toBe(t.ieeEditor.vocab.conditions.cellType.label);
    expect(primitiveLabel("grantEffect", t)).toBe(t.ieeEditor.vocab.actions.grantEffect.label);
    expect(primitiveLabel("teleport", t)).toBe("teleport");
  });

  it("fills a code's sentence from its params", () => {
    expect(issueText({ code: "action_trigger", path: ["rules", 0, "do", 0], message: "", params: { op: "steps", trigger: "onUse" } }, t)).toBe(
      format(i.action_trigger, { op: t.ieeEditor.vocab.actions.steps.label, trigger: t.ieeEditor.vocab.triggers.onUse.label }),
    );
    expect(issueText({ code: "missing_ref", path: [], message: "", params: { entry: "gust" } }, ru)).toBe(
      format(ru.ieeEditor.issues.missing_ref, { entry: "gust" }),
    );
    expect(issueText({ code: "name_fallback", path: ["name", "en"], message: "", params: { locale: "en" } }, t)).toBe(
      format(i.name_fallback, { locale: "EN" }),
    );
    expect(issueText({ code: "not_available", path: [], message: "", params: { what: "passive", stage: "A" } }, t)).toBe(
      format(i.not_available, { what: "passive", stage: "A" }),
    );
  });

  it("says a shape error in terms of the field", () => {
    const schema = (path: (string | number)[]) => issueText({ code: "schema", path, message: "Invalid input" }, t);
    expect(schema(["name", "ru"])).toBe(i.fields.nameRu);
    expect(schema(["rules", 0, "when"])).toBe(i.fields.ruleWhen);
    expect(schema(["rules", 0, "do"])).toBe(i.fields.ruleDo);
    expect(schema(["rules", 1, "do", 0, "entry"])).toBe(i.fields.entry);
    expect(schema(["rules", 1, "do", 0, "delta"])).toBe(i.fields.value);
    expect(schema(["usage", "charges"])).toBe(format(i.schema, { field: "usage.charges" }));
    expect(schema([])).toBe(format(i.schema, { field: "—" }));
  });

  it("says a scenario's verdict in the forms' words", () => {
    const sc = t.ieeEditor.entry.scenarios;
    const failed = (params: Record<string, string>) =>
      issueText({ code: "scenario_failed", path: ["scenarios", 0, "steps", 1], message: "", params: { scenario: "1", title: "Т", step: "2", ...params } }, t);
    const said = (field: string, expected: string, actual: string) => format(i.scenario_failed, { scenario: "1", title: "Т", step: "2", field, expected, actual });
    expect(failed({ field: "wheel", expected: "bonus", actual: "none" })).toBe(said(sc.checks.wheel, sc.wheel.bonus, sc.wheel.none));
    expect(failed({ field: "cellFires", expected: "true", actual: "false" })).toBe(said(sc.checks.cellFires, sc.yes, sc.no));
    expect(failed({ field: "result", expected: "refreshed", actual: "granted" })).toBe(said(sc.checks.result, sc.results.refreshed, sc.results.granted));
    expect(failed({ field: "reason", expected: "ieeTargetProtected", actual: "nothing" })).toBe(
      said(sc.checks.reason, t.core.errors.ieeTargetProtected, sc.nothing),
    );
    expect(failed({ field: "holder", entry: "swamp", expected: "1", actual: "0" })).toBe(said(`${sc.checks.holder} (swamp)`, "1", "0"));
    expect(failed({ field: "moved", expected: "4", actual: "3" })).toBe(said(sc.checks.moved, "4", "3"));

    const broken = issueText(
      {
        code: "scenario_broken",
        path: ["scenarios", 0, "steps", 0],
        message: "",
        params: { scenario: "1", title: "Т", step: "1", reason: "dice_impossible", total: "9", count: "1", sides: "6" },
      },
      t,
    );
    expect(broken).toBe(
      format(i.scenario_broken, { scenario: "1", step: "1", reason: format(sc.broken.dice_impossible, { total: "9", count: "1", sides: "6" }) }),
    );
  });

  it("says a scenario's shape error in terms of its field", () => {
    const schema = (path: (string | number)[]) => issueText({ code: "schema", path, message: "Invalid input" }, t);
    expect(schema(["scenarios", 0, "title", "ru"])).toBe(i.fields.scenarioTitle);
    expect(schema(["scenarios", 0, "note", "ru"])).toBe(i.fields.scenarioNote);
    expect(schema(["scenarios", 0, "id"])).toBe(i.fields.scenarioId);
    expect(schema(["scenarios", 0, "steps"])).toBe(i.fields.scenarioSteps);
    expect(schema(["scenarios", 0, "steps", 0, "item", "entry"])).toBe(i.fields.entry);
    expect(schema(["scenarios", 0, "given", "holder", "carries", 0, "count"])).toBe(i.fields.value);
    expect(schema(["scenarios", 0, "steps", 0, "dice"])).toBe(i.fields.value);
    expect(schema(["scenarios", 0, "given", "draws"])).toBe(format(i.schema, { field: "scenarios.0.given.draws" }));
  });

  it("names the rarities in a power warning", () => {
    expect(
      issueText({ code: "power_above_rarity", path: ["rarity"], message: "", params: { power: "4.0", rarity: "common", suggested: "rare" } }, ru),
    ).toBe(format(ru.ieeEditor.issues.power_above_rarity, { power: "4.0", rarity: ru.iee.rarity.common, suggested: ru.iee.rarity.rare }));
  });

  it("falls back to the engine's English for a code it has no sentence for", () => {
    expect(issueText({ code: "something_new", path: [], message: "raw message" }, t)).toBe("raw message");
  });
});
