import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { SANDBOX_GAMES, botId, runSandbox, sandboxSeasonConfig, seededRng, type SandboxOptions, type SandboxRun, type SandboxSubject } from "./sandbox";

const CORE = new Map(CORE_DOCS.map((d) => [d.entryId, d.doc]));
const docOf = (key: CoreKey): EntryDoc => structuredClone(CORE.get(CORE_ENTRY_IDS[key])!);
const DRAFT_ID = "77777777-7777-4777-8777-777777777777";

/** A draft of a core entry under a new id, with core as the library around it. */
function subject(key: CoreKey, over: Partial<SandboxSubject> = {}): SandboxSubject {
  const { scenarios: _scenarios, ...doc } = docOf(key);
  return { entryId: DRAFT_ID, doc: { ...doc, slug: `${doc.slug}_draft` }, docOf: (id) => CORE.get(id) ?? null, ...over };
}

const options = (over: Partial<SandboxOptions> = {}): SandboxOptions => ({ bots: 3, rounds: 10, seed: 42, startWith: true, ...over });

async function run(s: SandboxSubject, o: SandboxOptions): Promise<SandboxRun> {
  const outcome = await runSandbox(s, o);
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.run;
}

/** What the run did, without the ids the executor makes up. */
const shape = (r: SandboxRun) =>
  r.turns.map((t) => [t.bot, t.outcome, t.dice.join("+"), t.from, t.to, t.cell, t.wheel?.key ?? null, t.balance, t.uses.map((u) => [u.key, u.target, u.ok])]);

describe("seededRng", () => {
  it("repeats for a seed and differs across seeds", () => {
    const a = seededRng(7);
    const b = seededRng(7);
    const c = seededRng(8);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const v of first) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe("runSandbox — an entry played by bots in a season in memory (spec §10.5)", () => {
  it("plays a new season's defaults with items and effects on and nobody protected", () => {
    const config = sandboxSeasonConfig();
    expect(config.board.size).toBe(40);
    expect(config.iee).toMatchObject({ enabled: true, allowTargetingOthers: true, pvpProtectionMoves: 0 });
  });

  it("the same seed plays the same run; another seed another", async () => {
    const one = await run(subject("swamp"), options());
    const two = await run(subject("swamp"), options());
    expect(shape(two)).toEqual(shape(one));
    expect(two.board).toEqual(one.board);
    const other = await run(subject("swamp"), options({ seed: 43 }));
    expect(shape(other)).not.toEqual(shape(one));
  });

  it("an effect in force from the start: it fires, shortens moves and runs out", async () => {
    const r = await run(subject("swamp"), options());
    expect(r.setup.filter((e) => e.op === "grant")).toHaveLength(3);
    expect(r.setup.every((e) => e.entryId === DRAFT_ID && e.intent.source === "sandbox")).toBe(true);
    const mine = r.summary.entries[0]!;
    expect(mine).toMatchObject({ entryId: DRAFT_ID, key: "swamp_draft", granted: 3 });
    expect(mine.fired).toBeGreaterThanOrEqual(3);
    // One cell off each move it fires on.
    expect(mine.moved).toBe(-mine.fired);
    // Two moves each, so it runs out on every bot.
    expect(mine.expired).toBeGreaterThanOrEqual(3);
    expect(r.turns.filter((t) => t.round === 1).map((t) => t.bot)).toEqual([botId(1), botId(2), botId(3)]);
  });

  it("an item in hand: the bots use it on the leader, and what it hands out plays", async () => {
    const r = await run(subject("hex_scroll"), options({ rounds: 6 }));
    const uses = r.turns.flatMap((t) => t.uses);
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.filter((u) => u.ok).every((u) => u.target !== null && u.key === "hex_scroll_draft")).toBe(true);
    const mine = r.summary.entries.find((e) => e.entryId === DRAFT_ID)!;
    expect(mine.used).toBe(uses.filter((u) => u.ok).length);
    // The scroll's swamp is in the season, off the wheels: it lands on the targets.
    const swamp = r.summary.entries.find((e) => e.entryId === CORE_ENTRY_IDS.swamp)!;
    expect(swamp.granted).toBeGreaterThan(0);
    expect(swamp.dropped).toBe(0);
  });

  it("only the entry under test drops — unless core is on the wheels too", async () => {
    const alone = await run(subject("tailwind", { docOf: () => null }), options({ rounds: 30, startWith: false }));
    const keys = new Set(alone.turns.flatMap((t) => (t.wheel?.key ? [t.wheel.key] : [])));
    expect([...keys].every((k) => k === "tailwind_draft")).toBe(true);
    expect(alone.setup).toEqual([]);

    const extras = CORE_DOCS.map(({ entryId, doc }) => ({ entryId, doc }));
    const mixed = await run(subject("tailwind", { extras }), options({ rounds: 30, startWith: false }));
    const dropped = mixed.summary.entries.filter((e) => e.dropped > 0).map((e) => e.key);
    expect(dropped.some((k) => k !== "tailwind_draft")).toBe(true);
    // A core entry with the draft's slug would be a second key: the draft wins.
    const clash = await run(subject("tailwind", { extras, doc: { ...docOf("tailwind"), scenarios: undefined } }), options({ rounds: 3 }));
    expect(clash.summary.entries.filter((e) => e.key === "tailwind")).toHaveLength(1);
  });

  it("a bot an item of its own takes to the finish does not roll: its turn shows the move and no result", async () => {
    const { scenarios: _scenarios, params: _params, ...teleport } = docOf("teleport");
    const doc: EntryDoc = { ...teleport, slug: "far_teleport", rules: [{ when: "onUse", do: [{ op: "move", by: 40 }] }] };
    const r = await run({ entryId: DRAFT_ID, doc, docOf: (id) => CORE.get(id) ?? null }, options({ bots: 4, rounds: 10 }));
    const gone = r.turns.filter((t) => t.outcome === null);
    expect(gone.length).toBeGreaterThan(0);
    for (const t of gone) {
      expect(t).toMatchObject({ dice: [], cell: null, wheel: null, finished: true });
      expect(t.uses.some((u) => u.ok && u.key === "far_teleport")).toBe(true);
      expect(t.to).toBeGreaterThan(t.from);
    }
    // Nobody who finished rolls again.
    for (const t of gone) expect(r.turns.filter((x) => x.bot === t.bot && x.round > t.round)).toEqual([]);
  });

  it("keeps to 2–4 bots and 50 rounds, and stops when everyone is done", async () => {
    const few = await run(subject("swamp"), options({ bots: 1, rounds: 2 }));
    expect(few.bots).toBe(2);
    expect(few.summary.bots.map((b) => b.id)).toEqual([botId(1), botId(2)]);
    const many = await run(subject("swamp"), options({ bots: 9, rounds: 500 }));
    expect(many.bots).toBe(4);
    expect(many.rounds).toBe(50);
    if (many.played < 50) expect(many.summary.bots.every((b) => b.status === "finished")).toBe(true);
    for (const t of many.turns) expect(t.round).toBeLessThanOrEqual(many.played);
  });

  it("an entry that does not play with what it names runs nothing", async () => {
    const doc = docOf("hex_scroll");
    const missing = "99999999-9999-4999-8999-999999999999";
    doc.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: missing, slug: "ghost" }, to: "target" }] }];
    const outcome = await runSandbox({ entryId: DRAFT_ID, doc, docOf: () => null }, options());
    expect(outcome).toMatchObject({ ok: false, reason: "compile" });
  });
});

describe("runSandbox — the next game (wave C, spec §6.16, §7.12)", () => {
  const draft = (doc: Omit<EntryDoc, "dslVersion" | "name" | "rarity" | "tags" | "character">): SandboxSubject => ({
    entryId: DRAFT_ID,
    doc: { dslVersion: 1, name: { ru: doc.slug }, character: "bonus", rarity: "rare", tags: [], ...doc } as EntryDoc,
    docOf: (id) => CORE.get(id) ?? null,
  });

  it("each bot plays a game of the sandbox's pool, a new one each round, and the draws leave the dice alone", async () => {
    const r = await run(subject("swamp"), options({ rounds: 5 }));
    expect(SANDBOX_GAMES).toHaveLength(64);
    expect(new Set(SANDBOX_GAMES.map((g) => g.id)).size).toBe(64);
    for (const bot of [botId(1), botId(2), botId(3)]) {
      const games = r.turns.filter((t) => t.bot === bot).map((t) => t.game);
      expect(games.every((g) => typeof g === "string")).toBe(true);
      expect(new Set(games).size).toBe(games.length);
    }
    const titles = new Set(SANDBOX_GAMES.map((g) => g.title));
    expect(r.turns.every((t) => titles.has(t.game!))).toBe(true);
  });

  it("a choice of three is taken at once: its rule shaped the draw, and the bot plays a game it was offered", async () => {
    const r = await run(
      draft({ kind: "effect", slug: "doors_draft", duration: { unit: "next_game" }, stacking: { mode: "refresh" }, rules: [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 3 }] }] }),
      options({ rounds: 2 }),
    );
    const first = r.turns.filter((t) => t.round === 1);
    for (const t of first) {
      const opened = t.events.find((e) => e.op === "decision_open");
      const pool = t.events.find((e) => e.op === "pool");
      const taken = t.events.find((e) => e.op === "decision_resolve");
      expect(opened?.intent).toMatchObject({ kind: "game_choice", origin: "roll" });
      expect(pool).toMatchObject({ entryId: DRAFT_ID, key: "doors_draft" });
      const offered = (pool!.outcome.offered as string[]).map((id) => SANDBOX_GAMES.find((g) => g.id === id)!.title);
      expect(offered).toHaveLength(3);
      expect(offered).toContain(t.game);
      expect(taken?.outcome).toMatchObject({ option: "take" });
    }
    // Its rule spoke once per bot; the game after it runs out.
    expect(r.summary.entries[0]).toMatchObject({ key: "doors_draft", fired: 3, expired: 3 });
    expect(r.turns.filter((t) => t.round === 2).every((t) => !t.events.some((e) => e.op === "pool"))).toBe(true);
  });

  it("a reroll in hand: used with the game in flight, the bot plays the next game drawn", async () => {
    const r = await run(
      draft({
        kind: "item",
        slug: "reroll_draft",
        usage: { activation: "active", window: "on_open_roll", charges: 1, target: { who: "self" } },
        rules: [{ when: "onUse", do: [{ op: "rerollGame" }] }],
      }),
      options({ rounds: 6 }),
    );
    const used = r.turns.filter((t) => t.uses.some((u) => u.ok && u.key === "reroll_draft"));
    expect(used.length).toBeGreaterThan(0);
    for (const t of used) expect(t.uses.find((u) => u.ok)!.phase).toBe("in_flight");
    // Before the roll there is no game to replace: never tried then.
    expect(r.turns.flatMap((t) => t.uses).filter((u) => u.phase === "before_roll" && u.key === "reroll_draft")).toEqual([]);
  });

  it("a pick for the next game: the bot picks what the pool offers, and the effect it leaves shapes its next draw", async () => {
    const FAVOUR = "88888888-8888-4888-8888-888888888888";
    const favour = draft({
      kind: "effect",
      slug: "favour_draft",
      duration: { unit: "next_game" },
      stacking: { mode: "refresh" },
      rules: [{ when: "beforeGameRoll", do: [{ op: "poolFavor", factor: 5 }] }],
    }).doc;
    const ticket = draft({
      kind: "item",
      slug: "ticket_draft",
      usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "game" },
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: FAVOUR }, to: "self" }] }],
    });
    const r = await run({ ...ticket, docOf: (id) => (id === FAVOUR ? favour : (CORE.get(id) ?? null)) }, options({ rounds: 4 }));
    const uses = r.turns.flatMap((t) => t.uses).filter((u) => u.key === "ticket_draft");
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((u) => u.ok)).toBe(true);
    // What the use handed its user remembers the game picked …
    for (const u of uses) expect(u.events.find((e) => e.op === "grant")).toMatchObject({ entryId: FAVOUR });
    // … and speaks at the draw after it.
    const pools = r.turns.flatMap((t) => t.events).filter((e) => e.op === "pool");
    expect(pools.length).toBeGreaterThan(0);
    expect(pools.every((e) => e.entryId === FAVOUR)).toBe(true);
  });
});
