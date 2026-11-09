import { describe, expect, it } from "vitest";

import { compileEntry } from "../dsl/compile";
import type { EntryDoc } from "../dsl/doc";
import { IDS, effectDoc, itemDoc, player, resolve } from "../dsl/fixtures.test-helpers";
import type { CompiledEntry } from "../dsl/runtime";
import { answerApplies, answerOf, standingOf, type AnsweringSource } from "./incoming";

const compiled = (doc: EntryDoc): CompiledEntry => compileEntry({ entryId: IDS.self, revisionId: `rev-${doc.slug}`, doc, resolve });
const source = (id: string, doc: EntryDoc): AnsweringSource => ({ instanceId: id, entry: compiled(doc), params: {} });
const held = (slug: string, rules: EntryDoc["rules"], over: Partial<EntryDoc> = {}) =>
  itemDoc({ slug, usage: { activation: "passive", charges: 1 }, rules, ...over });
const base = (rng: () => number = () => 0) => ({ self: player("sp-me", { rank: 1 }), selfEntries: [], rng });
const harm = { is: "harm" as const, entry: null };
const terms = { pierce: 0, reflected: false, amplifiable: true };

describe("answerApplies — what decides whether an answer stands (spec §6.13)", () => {
  const ordinary = compiled(held("shield", [{ when: "onIncoming", do: [{ op: "block" }] }]));
  const reinforced = compiled(held("steel", [{ when: "onIncoming", do: [{ op: "block" }] }], { protection: { tier: 2 } }));

  it("a block of a harmful action holds while the tier is above the pierce; anything else is blocked outright", () => {
    expect(answerApplies({ kind: "block" }, ordinary, harm, terms)).toBe(true);
    expect(answerApplies({ kind: "block" }, ordinary, harm, { ...terms, pierce: 1 })).toBe(false);
    expect(answerApplies({ kind: "block" }, reinforced, harm, { ...terms, pierce: 1 })).toBe(true);
    expect(answerApplies({ kind: "block" }, reinforced, harm, { ...terms, pierce: 2 })).toBe(false);
    expect(answerApplies({ kind: "block" }, ordinary, { is: "moveBack", entry: null }, { ...terms, pierce: 5 })).toBe(true);
  });

  it("a reflection needs a rival's harmful action not reflected yet, and the tier", () => {
    expect(answerApplies({ kind: "reflect" }, ordinary, harm, terms)).toBe(true);
    expect(answerApplies({ kind: "reflect" }, ordinary, harm, { ...terms, reflected: true })).toBe(false);
    expect(answerApplies({ kind: "reflect" }, ordinary, harm, { ...terms, pierce: 1 })).toBe(false);
    expect(answerApplies({ kind: "reflect" }, ordinary, { is: "entry", entry: null }, terms)).toBe(false);
  });

  it("an amplification needs what can come stronger; a replacement always stands", () => {
    expect(answerApplies({ kind: "amplify", factor: 2 }, ordinary, harm, terms)).toBe(true);
    expect(answerApplies({ kind: "amplify", factor: 2 }, ordinary, harm, { ...terms, amplifiable: false })).toBe(false);
    expect(answerApplies({ kind: "replace", with: 1 }, ordinary, harm, { ...terms, pierce: 2, reflected: true, amplifiable: false })).toBe(true);
  });
});

describe("answerOf — who answers (spec §6.13)", () => {
  it("the first instance, then the first rule, whose conditions hold and whose answer applies", () => {
    const mirror = source("i-mirror", held("mirror", [{ when: "onIncoming", if: [{ op: "incoming", is: "harm" }], do: [{ op: "reflect" }] }]));
    const shield = source("i-shield", held("shield", [{ when: "onIncoming", if: [{ op: "incoming", is: "harm" }], do: [{ op: "block" }] }]));
    expect(answerOf([mirror, shield], harm, base(), terms)).toMatchObject({ source: { instanceId: "i-mirror" }, ruleIndex: 0, answer: { kind: "reflect" } });
    // Reflected already: the mirror lets the shield answer.
    expect(answerOf([mirror, shield], harm, base(), { ...terms, reflected: true })).toMatchObject({ source: { instanceId: "i-shield" }, answer: { kind: "block" } });
    // Neither answers a move back.
    expect(answerOf([mirror, shield], { is: "moveBack", entry: null }, base(), terms)).toBeNull();
  });

  it("keeps the draws its conditions made, for the journal", () => {
    const coin = source("i-coin", effectDoc({ slug: "coin", rules: [{ when: "onIncoming", if: [{ op: "chance", percent: 50 }], do: [{ op: "block" }] }] }));
    expect(answerOf([coin], harm, base(() => 0.25), terms)).toMatchObject({ draws: [0.25] });
    expect(answerOf([coin], harm, base(() => 0.75), terms)).toBeNull();
  });

  it("an entry with no answering rules answers nothing", () => {
    expect(answerOf([source("i-fx", effectDoc())], harm, base(), terms)).toBeNull();
  });
});

describe("standingOf — what holds (spec §6.13)", () => {
  it("immunity to completion conditions holds while any rule says so (wave C, spec §6.17)", () => {
    const free = source("i-free", effectDoc({ slug: "free", rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] }));
    const veil = source("i-veil", effectDoc({ slug: "veil", rules: [{ when: "whileActive", do: [{ op: "untargetable" }] }] }));
    expect(standingOf([veil], base()).conditionImmunity).toBe(false);
    expect(standingOf([veil, free], base())).toMatchObject({ untargetable: true, conditionImmunity: true });
  });

  it("every standing rule whose conditions hold counts: out of reach, kept from items, pierce added up", () => {
    const veil = source("i-veil", effectDoc({ slug: "veil", rules: [{ when: "whileActive", do: [{ op: "untargetable" }] }] }));
    const mark = source("i-mark", effectDoc({ slug: "mark", rules: [{ when: "whileActive", do: [{ op: "pierce", value: 1 }] }] }));
    const lead = source(
      "i-lead",
      effectDoc({ slug: "lead", rules: [{ when: "whileActive", if: [{ op: "rank", is: "leader" }], do: [{ op: "forbidItems" }, { op: "pierce", value: 1 }] }] }),
    );
    const none = { holdLimit: null, holdLimitBy: null, conditionImmunity: false };
    expect(standingOf([veil, mark, lead], base())).toEqual({ untargetable: true, forbidItems: true, pierce: 2, ...none });
    expect(standingOf([veil, mark, lead], { ...base(), self: player("sp-me", { rank: 2 }) })).toEqual({
      untargetable: true,
      forbidItems: false,
      pierce: 1,
      ...none,
    });
    expect(standingOf([], base())).toEqual({ untargetable: false, forbidItems: false, pierce: 0, ...none });
  });

  it("the strictest hold limit stands, the oldest instance's on a tie — it is the one that asks (spec §6.14)", () => {
    const greed = (id: string, max: number) =>
      source(id, effectDoc({ slug: `greed_${id}`, rules: [{ when: "whileActive", do: [{ op: "holdLimit", max }] }] }));
    expect(standingOf([greed("i-a", 2), greed("i-b", 1), greed("i-c", 1)], base())).toMatchObject({ holdLimit: 1, holdLimitBy: "i-b" });
    expect(standingOf([greed("i-a", 3)], base())).toMatchObject({ holdLimit: 3, holdLimitBy: "i-a" });
  });
});
