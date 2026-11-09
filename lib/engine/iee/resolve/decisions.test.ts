import { describe, expect, it } from "vitest";

import {
  checkChoice,
  defaultChoiceOf,
  holdQuestion,
  orderedFor,
  victimQuestion,
  type Candidate,
  type DecisionOption,
} from "./decisions";

const c = (instanceId: string, rarity: Candidate["rarity"], grantedAt: number): Candidate => ({ instanceId, rarity, grantedAt });
const HELD = [c("old-common", "common", 1), c("rare", "rare", 2), c("new-common", "common", 3), c("epic", "epic", 4)];

describe("the order a default takes items in (spec §7.6)", () => {
  it("the commonest first, the newest on a tie", () => {
    expect(orderedFor("commonest", HELD).map((x) => x.instanceId)).toEqual(["new-common", "old-common", "rare", "epic"]);
  });
  it("the rarest first, the newest on a tie", () => {
    expect(orderedFor("rarest", [...HELD, c("epic-2", "epic", 5)]).map((x) => x.instanceId)).toEqual([
      "epic-2",
      "epic",
      "rare",
      "new-common",
      "old-common",
    ]);
  });
  it("defaults by rule: what a discard gives, what a limit keeps, enduring, accepting", () => {
    expect(defaultChoiceOf("commonest", 2, HELD)).toEqual({ option: "discard", picks: ["new-common", "old-common"] });
    expect(defaultChoiceOf("rarest", 1, HELD)).toEqual({ option: "retain", picks: ["epic"] });
    expect(defaultChoiceOf("endure", 2, HELD)).toEqual({ option: "endure" });
    expect(defaultChoiceOf("accept", 1, HELD)).toEqual({ option: "accept" });
  });
});

describe("victimQuestion (spec §6.14)", () => {
  it("asks only when there is a choice", () => {
    expect(victimQuestion({ count: 1, orKeep: false, candidates: [] })).toEqual({ ask: false, discard: [] });
    expect(victimQuestion({ count: 1, orKeep: false, candidates: HELD.slice(0, 1) })).toEqual({ ask: false, discard: ["old-common"] });
    expect(victimQuestion({ count: 2, orKeep: false, candidates: HELD.slice(0, 2) })).toEqual({ ask: false, discard: ["old-common", "rare"] });
    expect(victimQuestion({ count: 2, orKeep: true, candidates: HELD.slice(0, 1) })).toEqual({ ask: false, discard: [] });
  });

  it("offers a discard of `count`, and with `orKeep` enduring — the default then", () => {
    const plain = victimQuestion({ count: 1, orKeep: false, candidates: HELD });
    expect(plain).toMatchObject({
      ask: true,
      question: {
        options: [{ id: "discard", kind: "discard", params: { count: 1, among: HELD.map((x) => x.instanceId) } }],
        defaultChoice: { option: "discard", picks: ["new-common"] },
        rule: "commonest",
      },
    });
    const keep = victimQuestion({ count: 2, orKeep: true, candidates: HELD.slice(0, 2) });
    expect(keep).toMatchObject({
      ask: true,
      question: { options: [{ kind: "discard" }, { id: "endure", kind: "endure" }], defaultChoice: { option: "endure" }, rule: "endure" },
    });
  });
});

describe("holdQuestion (spec §6.14)", () => {
  it("asks only over the limit, keeping the rarest by default", () => {
    expect(holdQuestion(1, HELD.slice(0, 1))).toBeNull();
    expect(holdQuestion(2, HELD)).toMatchObject({
      options: [{ id: "retain", kind: "retain", params: { count: 2 } }],
      defaultChoice: { option: "retain", picks: ["epic", "rare"] },
      rule: "rarest",
    });
  });
});

describe("checkChoice — whether an answer fits what the player holds now", () => {
  const discard: DecisionOption[] = [{ id: "discard", kind: "discard", params: { count: 1, among: ["rare"] } }];
  const pay: DecisionOption[] = [
    { id: "discard", kind: "discard", params: { count: 2 } },
    { id: "endure", kind: "endure", params: {} },
  ];
  const retain: DecisionOption[] = [{ id: "retain", kind: "retain", params: { count: 1 } }];
  const react: DecisionOption[] = [{ id: "react", kind: "react", params: { count: 1, among: ["coin"] } }, { id: "accept", kind: "accept", params: {} }];

  it("takes an item held now, even one that came after the question", () => {
    expect(checkChoice(discard, { option: "discard", picks: ["epic"] }, HELD)).toEqual({ ok: true, choice: { option: "discard", picks: ["epic"] } });
  });

  it("refuses an option not offered, an item not held, a repeat, the wrong number", () => {
    expect(checkChoice(discard, { option: "endure" }, HELD).ok).toBe(false);
    expect(checkChoice(discard, { option: "discard", picks: ["gone"] }, HELD).ok).toBe(false);
    expect(checkChoice(retain, { option: "retain", picks: ["rare", "rare"] }, HELD).ok).toBe(false);
    expect(checkChoice(discard, { option: "discard", picks: ["rare", "epic"] }, HELD).ok).toBe(false);
    expect(checkChoice(discard, { option: "discard" }, HELD).ok).toBe(false);
  });

  it("with fewer items left than asked, all of them answer — but a discard beside enduring is paid in full", () => {
    expect(checkChoice(discard, { option: "discard", picks: [] }, [])).toEqual({ ok: true, choice: { option: "discard", picks: [] } });
    expect(checkChoice(pay, { option: "discard", picks: ["rare"] }, HELD.slice(1, 2)).ok).toBe(false);
    expect(checkChoice(pay, { option: "endure", picks: ["rare"] }, HELD)).toEqual({ ok: true, choice: { option: "endure" } });
    expect(checkChoice(pay, { option: "discard", picks: ["rare", "epic"] }, HELD).ok).toBe(true);
  });

  it("a reaction takes one of the items it offered, or none to accept", () => {
    const coin = [c("coin", "rare", 1)];
    expect(checkChoice(react, { option: "react", picks: ["coin"] }, coin).ok).toBe(true);
    expect(checkChoice(react, { option: "react", picks: ["other"] }, [...coin, c("other", "common", 2)]).ok).toBe(false);
    expect(checkChoice(react, { option: "accept" }, coin)).toEqual({ ok: true, choice: { option: "accept" } });
  });
});
