import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import {
  ACTIONS,
  actionsAt,
  checkEntry,
  compileEntry,
  conditionsAt,
  scopeOf,
  sourcesAt,
  triggerShape,
  triggersFor,
  type ActionOp,
  type EntryDoc,
  type EntryFacts,
  type RuleScope,
} from "@/lib/engine/iee/dsl";

import {
  analyzeDraft,
  boundsFor,
  cleanDraft,
  declareParam,
  defaultAction,
  defaultCondition,
  defaultSource,
  editableDraft,
  freeParamName,
  issueSpot,
  issuesAt,
  move,
  namesOf,
  newRule,
  paramUses,
  removeParam,
  renameParam,
  skeletonDraft,
  withKind,
} from "./draft";

const SELF = "11111111-1111-4111-8111-111111111111";

/** A core document as a fixture — without its scenarios, which name core's own entries. */
const docOf = (key: CoreKey): EntryDoc => {
  const { scenarios: _scenarios, ...doc } = structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);
  return doc;
};

const factsOf = (key: CoreKey): EntryFacts => {
  const doc = docOf(key);
  return { entryId: CORE_ENTRY_IDS[key], slug: doc.slug, kind: doc.kind, character: doc.character, tags: doc.tags, name: doc.name };
};

const CORE_FACTS = new Map<string, EntryFacts>((Object.keys(CORE_ENTRY_IDS) as CoreKey[]).map((k) => [CORE_ENTRY_IDS[k], factsOf(k)]));
const published = (id: string) => CORE_FACTS.get(id) ?? null;

describe("skeletonDraft and editableDraft", () => {
  it("a new entry starts in shape, without rules", () => {
    expect(skeletonDraft("gust", "effect")).toEqual({
      dslVersion: 1,
      kind: "effect",
      slug: "gust",
      name: { ru: "gust" },
      character: "bonus",
      rarity: "common",
      tags: [],
      duration: { unit: "rolls", count: 1 },
      stacking: { mode: "refresh" },
      rules: [],
    });
    expect(skeletonDraft("boots", "item").usage).toEqual({
      activation: "active",
      window: "anytime",
      target: { who: "self" },
      charges: 1,
    });
  });

  it("keeps a stored document as it is", () => {
    const swamp = docOf("swamp");
    expect(editableDraft(swamp, { slug: "swamp", kind: "effect" })).toEqual(swamp);
    const boots = docOf("speed_boots");
    expect(editableDraft(boots, { slug: "speed_boots", kind: "item" })).toEqual(boots);
  });

  it("fills what a broken draft lacks instead of refusing it", () => {
    expect(editableDraft(null, { slug: "gust", kind: "effect" })).toEqual({
      dslVersion: 1,
      kind: "effect",
      slug: "gust",
      name: { ru: "gust" },
      character: "bonus",
      rarity: "common",
      tags: [],
      rules: [],
    });
    const messy = editableDraft(
      {
        kind: "teapot",
        name: { en: "Gust", uk: 3 },
        character: "chaotic",
        tags: ["movement", 7],
        rules: [{ when: 4, do: [{ op: "steps", delta: 1 }, "junk", { nope: 1 }], if: "x", priority: "soon" }, "junk"],
      },
      { slug: "gust", kind: "item" },
    );
    expect(messy.kind).toBe("item");
    expect(messy.name).toEqual({ ru: "", en: "Gust" });
    expect(messy.character).toBe("bonus");
    expect(messy.tags).toEqual(["movement"]);
    expect(messy.rules).toEqual([{ when: "", do: [{ op: "steps", delta: 1 }] }]);
  });
});

describe("cleanDraft — what is saved", () => {
  it("trims, drops empty translations and flavor, dedupes tags, leaves defaults out", () => {
    const doc: EntryDoc = {
      ...docOf("swamp"),
      slug: " swamp ",
      name: { ru: " Болото ", en: "  ", uk: "Болото" },
      flavor: { ru: " ", en: "" },
      glyph: "",
      tags: ["movement", " movement", ""],
      params: {},
      usage: { activation: "active", charges: 1 },
      rules: [{ when: "afterMovement", if: [], priority: "normal", do: [{ op: "steps", delta: -1 }] }],
    };
    expect(cleanDraft(doc)).toEqual({
      dslVersion: 1,
      kind: "effect",
      slug: "swamp",
      name: { ru: "Болото", uk: "Болото" },
      character: "penalty",
      rarity: "common",
      tags: ["movement"],
      duration: { unit: "moves", count: 2 },
      stacking: { mode: "refresh" },
      rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }],
    });
  });

  it("keeps a flavor with any text, and a non-default priority", () => {
    const doc = cleanDraft({
      ...skeletonDraft("boots", "item"),
      flavor: { ru: "", en: "Fast" },
      rules: [{ when: "onUse", priority: "late", do: [{ op: "balance", amount: 1 }] }],
    });
    expect(doc.flavor).toEqual({ ru: "", en: "Fast" });
    expect(doc.rules[0]!.priority).toBe("late");
    expect(doc.duration).toBeUndefined();
  });

  it("a core document survives the round trip unchanged", () => {
    for (const { doc } of CORE_DOCS) expect(cleanDraft(editableDraft(doc, doc))).toEqual(doc);
  });
});

describe("withKind", () => {
  it("swaps usage for duration and back, keeping the rules", () => {
    const item = skeletonDraft("thing", "item");
    const effect = withKind({ ...item, rules: [{ when: "onUse", do: [] }] }, "effect");
    expect(effect.usage).toBeUndefined();
    expect(effect.duration).toEqual({ unit: "rolls", count: 1 });
    expect(effect.stacking).toEqual({ mode: "refresh" });
    expect(effect.rules).toHaveLength(1);
    const back = withKind(effect, "item");
    expect(back.duration).toBeUndefined();
    expect(back.stacking).toBeUndefined();
    expect(back.usage).toEqual(item.usage);
    expect(withKind(back, "item")).toBe(back);
  });
});

describe("rules", () => {
  it("a new rule starts at the kind's usual trigger", () => {
    expect(newRule("item")).toEqual({ when: "onUse", do: [] });
    expect(newRule("effect")).toEqual({ when: "afterMovement", do: [] });
  });

  it("moves within bounds", () => {
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 2, -2)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });

  /**
   * The constructor's promise: nothing it offers is refused for its place. For
   * every kind and aim, every trigger, every condition and action offered
   * there, in its default shape, passes the placement checks.
   */
  it("everything offered at a trigger is accepted there", () => {
    const boots = CORE_ENTRY_IDS.speed_boots;
    const tailwind = CORE_ENTRY_IDS.tailwind;
    const item = (usage: NonNullable<EntryDoc["usage"]>): EntryDoc => ({ ...skeletonDraft("probe", "item"), usage });
    // A penalty item is cursed, so each shape is probed with the characters it may have.
    const scopes: { scope: RuleScope; base: EntryDoc; characters: readonly ("bonus" | "penalty")[] }[] = [
      { scope: { kind: "effect", aimed: false, reaction: false, openRoll: false, places: false }, base: skeletonDraft("probe", "effect"), characters: ["bonus", "penalty"] },
      { scope: { kind: "item", aimed: false, reaction: false, openRoll: false, places: false }, base: skeletonDraft("probe", "item"), characters: ["bonus"] },
      {
        scope: { kind: "item", aimed: true, reaction: false, openRoll: false, places: false },
        base: item({ activation: "active", window: "anytime", target: { who: "other" }, charges: 1 }),
        characters: ["bonus"],
      },
      { scope: { kind: "item", aimed: false, reaction: false, openRoll: false, places: false }, base: item({ activation: "passive" }), characters: ["bonus"] },
      { scope: { kind: "item", aimed: false, reaction: false, openRoll: false, places: false }, base: item({ activation: "cursed", charges: 1 }), characters: ["penalty"] },
      // A reaction item (wave B, §6.15): its use acts on the throw.
      { scope: { kind: "item", aimed: false, reaction: true, openRoll: false, places: false }, base: item({ activation: "active", window: "after_dice", charges: 1 }), characters: ["bonus"] },
      // An item used on the game in flight (wave C, §6.16): it may replace the game or set it aside.
      {
        scope: { kind: "item", aimed: false, reaction: false, openRoll: true, places: false },
        base: item({ activation: "active", window: "on_open_roll", target: { who: "self" }, charges: 1 }),
        characters: ["bonus"],
      },
      // An item that places itself on the board (wave D, §6.18): its use asks for the cell.
      {
        scope: { kind: "item", aimed: false, reaction: false, openRoll: false, places: true },
        base: item({ activation: "active", window: "anytime", target: { who: "self" }, charges: 1, pick: "cell" }),
        characters: ["bonus"],
      },
    ];
    for (const { scope, base, characters } of scopes) {
      expect(scopeOf(base)).toEqual(scope);
      const shape = triggerShape(base);
      for (const when of triggersFor(scope.kind, shape)) {
        for (const character of characters) {
          const ctx = { scope, when, character };
          const actions = actionsAt(when, scope).map((op: ActionOp) => {
            const action = defaultAction(op, ctx);
            if (op === "grantEffect") return { ...action, entry: { entry: tailwind } };
            if (op === "grantItem") return { ...action, entry: { entry: boots } };
            return action;
          });
          // Every number that may read the moment, reading each source offered here (wave A).
          for (const op of actionsAt(when, scope)) {
            for (const field of ACTIONS[op].sourceFields ?? []) {
              for (const source of sourcesAt(scope, when)) actions.push({ ...defaultAction(op, ctx), [field]: defaultSource(source, character) });
            }
          }
          const conditions = conditionsAt(when, scope).map(defaultCondition);
          // A reaction throws the dice again one way (§6.15): each action is probed in an item of its own.
          if (scope.reaction && when === "onUse") {
            for (const action of actions) {
              const doc: EntryDoc = { ...base, character, rules: [{ when, if: conditions.slice(0, 8), do: [action] }] };
              const result = checkEntry(doc, { entryId: SELF, resolve: published });
              expect({ scope, when, action: action.op, errors: result.errors }).toEqual({ scope, when, action: action.op, errors: [] });
            }
            continue;
          }
          // A rule holds at most eight conditions and eight actions: what a trigger offers fills as many rules as it needs.
          // One answers what arrives one way (wave B, §6.13): each answer gets a rule of its own, with what narrows it.
          const answers = when === "onIncoming";
          const per = answers ? 1 : 8;
          const rules: EntryDoc["rules"] = [];
          if (when === "onObjectEntered") {
            // An object stops a move — and then pushes or spins in place of the cell — or carries it further (§6.18): two rules.
            expect(actions.map((a) => a.op).sort()).toEqual(["extend", "push", "spinInstead", "stopMove"]);
            rules.push({ when, if: conditions, do: actions.filter((a) => a.op !== "extend") });
            rules.push({ when, do: actions.filter((a) => a.op === "extend") });
            rules.push({ when: "onUse", do: [{ op: "placeObject" }] });
          } else {
            for (let i = 0; i * per < Math.max(actions.length, answers ? 0 : conditions.length); i++) {
              const part = actions.slice(i * per, i * per + per);
              rules.push({ when, if: answers ? conditions : conditions.slice(i * 8, i * 8 + 8), do: part.length > 0 ? part : actions.slice(0, 1) });
            }
          }
          // An item that works while held needs a rule at a turn hook besides its pickup.
          if (when === "onPickup" && shape.activation !== "active") rules.push({ when: "afterMovement", do: [{ op: "steps", delta: 1 }] });
          if (when === "onPickup" && shape.activation === "active") {
            rules.push({ when: "onUse", do: [scope.reaction ? { op: "reroll" } : scope.places ? { op: "placeObject" } : { op: "balance", amount: 1 }] });
          }
          // A condition comes with the tag a season switches conditions off by (§6.17).
          const doc: EntryDoc = { ...base, character, rules, ...(when === "onRollCreated" ? { tags: ["game_condition"] } : {}) };
          const result = checkEntry(doc, { entryId: SELF, resolve: published });
          expect({ scope, when, character, errors: result.errors }).toEqual({ scope, when, character, errors: [] });
        }
      }
    }
  });

  it("default numbers lean the entry's way", () => {
    const effect = { scope: { kind: "effect" as const, aimed: false }, when: "afterMovement" };
    expect(defaultAction("steps", { ...effect, character: "penalty" })).toEqual({ op: "steps", delta: -1 });
    expect(defaultAction("steps", { ...effect, character: "bonus" })).toEqual({ op: "steps", delta: 1 });
    expect(defaultAction("dice", { ...effect, when: "beforeMovement", character: "penalty" })).toEqual({ op: "dice", sides: -2 });
    const aimed = { scope: { kind: "item" as const, aimed: true }, when: "onUse", character: "bonus" as const };
    expect(defaultAction("balance", aimed)).toEqual({ op: "balance", amount: -2, to: "target" });
    expect(defaultAction("grantEffect", aimed)).toEqual({ op: "grantEffect", to: "target" });
  });
});

describe("parameters", () => {
  const swamp = docOf("swamp");

  it("counts the values that name each parameter", () => {
    expect(paramUses(swamp)).toEqual({ steps: 1 });
    expect(paramUses(skeletonDraft("x", "effect"))).toEqual({});
  });

  it("finds a free name and sensible bounds", () => {
    expect(freeParamName(swamp, "steps")).toBe("steps2");
    expect(freeParamName(swamp, "chance")).toBe("chance");
    expect(boundsFor("steps.delta", -2)).toEqual({ min: -6, max: -1 });
    expect(boundsFor("steps.delta", 8)).toEqual({ min: 1, max: 8 });
    expect(boundsFor("balance.amount", 0)).toEqual({ min: -6, max: 6 });
    expect(boundsFor("chance.percent", 30)).toEqual({ min: 1, max: 99 });
  });

  it("declares a parameter from a literal", () => {
    const literal: EntryDoc = { ...swamp, params: undefined, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -2 }] }] };
    const { doc, name } = declareParam(literal, "steps.delta", -2);
    expect(name).toBe("steps");
    expect(doc.params).toEqual({ steps: { type: "int", default: -2, min: -6, max: -1 } });
  });

  it("renames a parameter everywhere, and refuses a bad or taken name", () => {
    const renamed = renameParam(swamp, "steps", "slow");
    expect(renamed.params).toEqual({ slow: swamp.params!.steps });
    expect(renamed.rules[0]!.do[0]).toEqual({ op: "steps", delta: { param: "slow" } });
    expect(renameParam(swamp, "steps", "Bad name")).toBe(swamp);
    expect(renameParam(swamp, "nope", "slow")).toBe(swamp);
    const two = { ...swamp, params: { ...swamp.params!, slow: swamp.params!.steps! } };
    expect(renameParam(two, "steps", "slow")).toBe(two);
  });

  it("removing a parameter leaves its default in the rules", () => {
    const removed = removeParam(swamp, "steps");
    expect(removed.params).toBeUndefined();
    expect(removed.rules[0]!.do[0]).toEqual({ op: "steps", delta: -1 });
    const chance: EntryDoc = {
      ...swamp,
      params: { ...swamp.params!, odds: { type: "int", default: 30, min: 1, max: 99 } },
      rules: [{ when: "afterMovement", if: [{ op: "chance", percent: { param: "odds" } }], do: [{ op: "steps", delta: { param: "steps" } }] }],
    };
    const left = removeParam(chance, "odds");
    expect(left.params).toEqual({ steps: swamp.params!.steps });
    expect(left.rules[0]!.if![0]).toEqual({ op: "chance", percent: 30 });
  });
});

describe("issueSpot — which field a check points at", () => {
  it("maps paths to blocks", () => {
    expect(issueSpot(["name", "en"])).toEqual({ block: "basics", field: "name.en" });
    expect(issueSpot(["usage", "charges"])).toEqual({ block: "usage", field: "charges" });
    expect(issueSpot(["usage"])).toEqual({ block: "usage", field: undefined });
    expect(issueSpot(["stacking", "maxStacks"])).toEqual({ block: "duration", field: "stacking.maxStacks" });
    expect(issueSpot(["params", "steps"])).toEqual({ block: "limits", field: "steps" });
    expect(issueSpot(["tags", 2])).toEqual({ block: "interaction", field: "tags" });
    expect(issueSpot(["rules"])).toEqual({ block: "rules" });
    expect(issueSpot(["rules", 1, "when"])).toEqual({ block: "rules", rule: 1, part: "when" });
    expect(issueSpot(["rules", 1, "do"])).toEqual({ block: "rules", rule: 1, part: "do" });
    expect(issueSpot(["rules", 1, "do", 0, "entry"])).toEqual({ block: "rules", rule: 1, part: "do", item: 0, field: "entry" });
    expect(issueSpot(["rules", 0, "if", 2])).toEqual({ block: "rules", rule: 0, part: "if", item: 2, field: undefined });
    expect(issueSpot(["rules", 0])).toEqual({ block: "rules", rule: 0 });
    expect(issueSpot(["swamp"])).toEqual({ block: "general" });
  });

  it("collects the issues of one condition or action", () => {
    const issues = [
      { code: "schema" as const, path: ["rules", 0, "do", 1, "entry"], message: "" },
      { code: "schema" as const, path: ["rules", 0, "do", 0], message: "" },
      { code: "schema" as const, path: ["rules", 1, "do", 1], message: "" },
    ];
    expect(issuesAt(issues, 0, "do", 1)).toEqual([issues[0]]);
  });
});

describe("analyzeDraft — the right-hand panel", () => {
  const ctx = { entryId: SELF, published, named: published };

  it("a finished entry reads exactly as it plays", () => {
    const swamp = docOf("swamp");
    const analysis = analyzeDraft(swamp, ctx);
    expect(analysis.errors).toEqual([]);
    expect(analysis.brokenRules).toEqual([]);
    const compiled = compileEntry({ entryId: SELF, revisionId: SELF, doc: swamp, resolve: published });
    expect(analysis.preview.ruleText).toEqual(compiled.ruleText);
    expect(analysis.power).toBe(2);
    expect(analysis.preview).toMatchObject({
      kind: "effect",
      name: { ru: "Болото", en: "Swamp", uk: "Болото" },
      polarity: "negative",
      duration: { unit: "moves", count: 2 },
      usage: null,
    });
  });

  it("leaves out a rule that does not check, and says which", () => {
    const doc: EntryDoc = {
      ...docOf("swamp"),
      rules: [
        { when: "afterMovement", do: [{ op: "steps", delta: { param: "steps" } }] },
        { when: "afterMovement", do: [{ op: "skipCellEffect" }] },
        { when: "onTick", do: [] },
      ],
    };
    const analysis = analyzeDraft(doc, ctx);
    expect(analysis.brokenRules).toEqual([1, 2]);
    // The empty rule is a shape error; the misplaced action is reported with it, at its own rule.
    expect(analysis.errors.map((e) => [e.code, e.path.join(".")])).toEqual([
      ["schema", "rules.2.do"],
      ["action_trigger", "rules.1.do.0"],
    ]);
    expect(analysis.preview.ruleText.en).toBe("Your move is 1 cell shorter. Lasts 2 moves.");
    expect(analysis.power).toBe(2);
    expect(analysis.ruleSentences.map((s) => s?.en ?? null)).toEqual(["Your move is 1 cell shorter.", null, null]);
    expect(analysis.harmsTarget).toBe(false);
  });

  it("knows when an action harms the chosen player", () => {
    expect(analyzeDraft(docOf("hex_scroll"), ctx).harmsTarget).toBe(true);
    expect(analyzeDraft(docOf("speed_boots"), ctx).harmsTarget).toBe(false);
  });

  it("names an unpublished packmate in the text, while the check still asks to publish it first", () => {
    const mate = "22222222-2222-4222-8222-222222222222";
    const mateFacts: EntryFacts = { entryId: mate, slug: "gust", kind: "effect", character: "bonus", tags: [], name: { ru: "Порыв", en: "Gust" } };
    const doc: EntryDoc = {
      ...docOf("speed_boots"),
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: mate, slug: "gust" }, to: "self" }] }],
    };
    const analysis = analyzeDraft(doc, { ...ctx, named: (id) => (id === mate ? mateFacts : published(id)) });
    expect(analysis.errors.map((e) => e.code)).toEqual(["missing_ref"]);
    expect(analysis.errors[0]!.params).toEqual({ entry: "gust" });
    expect(analysis.brokenRules).toEqual([]);
    expect(analysis.preview.ruleText.en).toBe("Use before your roll. Single use. You get “Gust”.");
  });

  it("still draws a card for a draft that is far from done", () => {
    const doc: EntryDoc = { ...skeletonDraft("gust", "item"), name: { ru: "" }, usage: { activation: "active", charges: 0 } };
    const analysis = analyzeDraft(doc, ctx);
    expect(analysis.errors.length).toBeGreaterThan(0);
    expect(analysis.power).toBeNull();
    expect(analysis.preview.name).toEqual({ ru: "gust", en: "gust", uk: "gust" });
    expect(analysis.preview.usage).toBeNull();
    expect(analysis.preview.ruleText).toEqual({ ru: "", en: "", uk: "" });
  });

  it("an item shows how it is used", () => {
    const analysis = analyzeDraft(docOf("speed_boots"), ctx);
    expect(analysis.preview.usage).toEqual({ activation: "active", window: "before_roll", target: "self", charges: 1 });
    expect(analysis.preview.ruleText.ru).toBe("Применяется до броска. Одно использование. Вы получаете «Попутный ветер».");
  });
});

describe("namesOf", () => {
  it("fills every locale, the slug standing in for a missing name", () => {
    expect(namesOf({ ...skeletonDraft("gust", "effect"), name: { ru: "" } })).toEqual({ ru: "gust", en: "gust", uk: "gust" });
    expect(namesOf(docOf("swamp"))).toEqual({ ru: "Болото", en: "Swamp", uk: "Болото" });
  });
});
