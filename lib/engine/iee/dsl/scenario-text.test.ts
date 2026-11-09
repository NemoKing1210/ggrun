import { describe, expect, it } from "vitest";

import type { ScenarioDoc, ScenarioEntry } from "./doc";
import { scenarioText } from "./scenario-text";

const NAMES: Record<string, Record<"ru" | "en" | "uk", string>> = {
  self: { ru: "Болото", en: "Swamp", uk: "Болото" },
  ward: { ru: "Оберег", en: "Ward", uk: "Оберіг" },
};
const env = (locale: "ru" | "en" | "uk") => ({
  locale,
  name: (e: ScenarioEntry) => NAMES[e === "self" ? "self" : (e.slug ?? "")]![locale],
});
const WARD = { entry: "11111111-1111-4111-8111-111111111111", slug: "ward" };

const swamp: ScenarioDoc = {
  title: { ru: "Короче на клетку" },
  given: { holder: { carries: [{ entry: "self" }] } },
  steps: [
    { do: "roll", outcome: "passed", dice: 5, expect: { moved: 4 } },
    { do: "roll", outcome: "dropped", dice: 7, cell: "penalty", expect: { moved: -8, cellFires: true, wheel: "penalty", holder: [{ entry: "self", count: 0 }] } },
  ],
};

describe("scenarioText", () => {
  it("says a scenario in English", () => {
    expect(scenarioText(swamp, env("en"))).toEqual({
      given: "The holder carries “Swamp”.",
      steps: [
        { when: "The holder passes a game, the dice show 5.", then: "The move goes 4 cells forward." },
        {
          when: "The holder drops a game, the dice show 7, the move ends on a penalty cell.",
          then: "The move goes 8 cells back; the cell fires; the penalty wheel spins; the holder does not carry “Swamp”.",
        },
      ],
    });
  });

  it("and in Russian and Ukrainian, with their plurals", () => {
    const ru = scenarioText(swamp, env("ru"));
    expect(ru.given).toBe("У игрока «Болото».");
    expect(ru.steps[0]).toEqual({ when: "Игрок проходит игру, на кубиках 5.", then: "Ход на 4 клетки вперёд." });
    expect(ru.steps[1]!.then).toBe("Ход на 8 клеток назад; клетка срабатывает; крутится штрафное колесо; у игрока нет: «Болото».");
    // With the kind known, the generic noun carries the case.
    const kinded = scenarioText(swamp, { ...env("ru"), kind: () => "effect" });
    expect(kinded.given).toBe("У игрока эффект «Болото».");
    expect(kinded.steps[1]!.then).toMatch(/у игрока нет эффекта «Болото»\.$/);
    const ukKinded = scenarioText(swamp, { ...env("uk"), kind: () => "effect" });
    expect(ukKinded.steps[1]!.then).toMatch(/у гравця немає ефекту «Болото»\.$/);
    const uk = scenarioText(swamp, env("uk"));
    expect(uk.steps[0]).toEqual({ when: "Гравець проходить гру, на кубиках 5.", then: "Хід на 4 клітинки вперед." });
  });

  it("leaves the season's defaults unsaid and names everything else", () => {
    const s: ScenarioDoc = {
      title: { ru: "x" },
      given: {
        holder: { position: 10, balance: 0, inFlight: true, carries: [{ entry: WARD, count: 2 }] },
        rival: { position: 3, left: true },
        sides: 3,
        loop: true,
        draws: "high",
      },
      steps: [{ do: "grant", entry: "self", to: "rival", expect: { result: "refreshed", rival: [{ entry: "self", count: 1 }] } }],
    };
    const t = scenarioText(s, env("en"));
    expect(t.given).toBe(
      "The holder has 0 points, the holder has a game in flight, the holder carries “Ward” ×2, the rival is on cell 3, the rival has left the run, the season rolls d3, the board loops and random draws come out high.",
    );
    expect(t.steps[0]).toEqual({
      when: "“Swamp” is handed to the rival.",
      then: "It refreshes the one already there; the rival carries “Swamp”.",
    });
    expect(scenarioText({ title: { ru: "x" }, steps: [{ do: "roll", outcome: "passed", dice: 3 }] }, env("ru"))).toEqual({
      given: "",
      steps: [{ when: "Игрок проходит игру, на кубиках 3.", then: "Ничего не проверяется." }],
    });
  });

  it("uses, refusals in words, dice and balances", () => {
    const s: ScenarioDoc = {
      title: { ru: "x" },
      steps: [
        { do: "use", item: WARD, on: "nobody", expect: { result: "refused", reason: "ieeTargetRequired" } },
        { do: "use", on: "rival", expect: { result: "used", balance: 0, rivalBalance: -2 } },
        { do: "roll", by: "rival", outcome: "passed", dice: 4, expect: { diceSides: 8, diceCount: 1 } },
        { do: "roll", outcome: "passed", dice: 4, expect: { diceSides: 4, wheel: "none", cellFires: false } },
      ],
    };
    const en = scenarioText(s, { ...env("en"), refusal: (code) => `(${code})` });
    expect(en.steps.map((x) => x.then)).toEqual([
      "The use is refused: (ieeTargetRequired).",
      "The item is used; the holder's points do not change; the rival's points change by −2.",
      "The dice are 1d8.",
      "The dice have 4 sides; the cell does not fire; no wheel spins.",
    ]);
    expect(en.steps[0]!.when).toBe("The holder uses “Ward” with no target.");
    expect(en.steps[2]!.when).toBe("The rival passes a game, the dice show 4.");
    const ru = scenarioText(s, env("ru"));
    expect(ru.steps[0]!.then).toBe("В использовании отказано: ieeTargetRequired.");
    expect(ru.steps[3]!.then).toBe("У кубиков 4 грани; клетка не срабатывает; колесо не крутится.");
    expect(scenarioText({ title: { ru: "x" }, steps: [{ do: "roll", outcome: "passed", dice: 3, expect: { diceCount: 2 } }] }, env("uk")).steps[0]!.then).toBe(
      "Кубиків: 2.",
    );
  });
});

describe("scenarioText — picks from the catalog and wheels once more (wave B, spec §6.12)", () => {
  it("says what a use picks from the catalog, and the wheel a rule spins again", () => {
    const s: ScenarioDoc = {
      title: { ru: "x" },
      steps: [
        { do: "use", chooseEntry: WARD, expect: { result: "used" } },
        { do: "roll", outcome: "passed", dice: 4, cell: "bonus", expect: { wheel: "bonus", wheelAgain: "bonus" } },
        { do: "roll", outcome: "passed", dice: 4, expect: { wheelAgain: "none" } },
      ],
    };
    const en = scenarioText(s, env("en"));
    expect(en.steps[0]!.when).toBe("The holder uses “Swamp”, picking “Ward” from the catalog.");
    expect(en.steps[1]!.then).toBe("The bonus wheel spins; the bonus wheel spins once more.");
    expect(en.steps[2]!.then).toBe("No wheel spins once more.");
    const ru = scenarioText(s, env("ru"));
    expect(ru.steps[0]!.when).toMatch(/, выбрав из каталога «Оберег»\.$/);
    expect(ru.steps[1]!.then).toBe("Крутится бонусное колесо; бонусное колесо крутится ещё раз.");
    expect(scenarioText(s, env("uk")).steps[2]!.then).toBe("Колесо ще раз не крутиться.");
  });
});

describe("scenarioText — a rival's use, a drop (wave B, spec §6.13)", () => {
  const doc: ScenarioDoc = {
    title: { ru: "Щит" },
    steps: [
      { do: "use", by: "rival", item: WARD, on: "holder", expect: { result: "used" } },
      { do: "use", by: "rival", item: WARD, on: "rival", expect: { result: "used" } },
      { do: "use", item: WARD, on: "holder", expect: { result: "used" } },
      { do: "grant", entry: WARD, via: "wheel", expect: { result: "refused" } },
    ],
  };

  it("says who uses it, on whom, and that the wheel dropped it", () => {
    expect(scenarioText(doc, env("en")).steps.map((s) => s.when)).toEqual([
      "The rival uses “Ward” on the holder.",
      "The rival uses “Ward” on themselves.",
      "The holder uses “Ward” on themselves.",
      "The wheel drops “Ward” to the holder.",
    ]);
    expect(scenarioText(doc, env("ru")).steps.map((s) => s.when)).toEqual([
      "Соперник использует «Оберег» на игроке.",
      "Соперник использует «Оберег» на себе.",
      "Игрок использует «Оберег» на себе.",
      "Игрок получает «Оберег» с колеса.",
    ]);
    expect(scenarioText(doc, env("uk")).steps.map((s) => s.when)).toEqual([
      "Суперник використовує «Оберіг» на гравцеві.",
      "Суперник використовує «Оберіг» на собі.",
      "Гравець використовує «Оберіг» на собі.",
      "Гравець отримує «Оберіг» з колеса.",
    ]);
  });
});

describe("scenarioText — the player's choices (wave B, spec §7.6)", () => {
  const doc: ScenarioDoc = {
    title: { ru: "Налог" },
    steps: [
      { do: "grant", entry: "self", expect: { decision: "pending" } },
      { do: "decide", option: "discard", picks: [WARD], expect: { result: "decided", decision: "none" } },
      { do: "decide", by: "rival", option: "endure", expect: { result: "refused" } },
      { do: "decide", option: "retain", picks: [WARD, "self"] },
      { do: "decide" },
    ],
  };

  it("says who answers, which way, and what waits after", () => {
    const en = scenarioText(doc, env("en")).steps;
    expect(en.map((s) => s.when)).toEqual([
      "“Swamp” is handed to the holder.",
      "The holder discards “Ward”.",
      "The rival gives nothing up.",
      "The holder keeps “Ward” and “Swamp”.",
      "The holder takes the default of their choice.",
    ]);
    expect(en[0]!.then).toBe("A choice waits for the holder.");
    expect(en[1]!.then).toBe("The choice is made; no choice waits for the holder.");
    expect(en[2]!.then).toBe("The choice is refused.");
    expect(scenarioText(doc, env("ru")).steps.map((s) => s.when)).toEqual([
      "Игрок получает «Болото».",
      "Игрок сбрасывает «Оберег».",
      "Соперник ничего не отдаёт.",
      "Игрок оставляет «Оберег» и «Болото».",
      "Игрок соглашается на вариант по умолчанию.",
    ]);
    expect(scenarioText(doc, env("uk")).steps[1]).toEqual({ when: "Гравець скидає «Оберіг».", then: "Вибір зроблено; у гравця немає вибору, що чекає." });
  });
});

describe("scenarioText — the reaction window (wave B, spec §7.4)", () => {
  const doc: ScenarioDoc = {
    title: { ru: "Монета" },
    steps: [
      { do: "roll", outcome: "passed", dice: 2, then: [6], react: "self", expect: { window: "used", moved: 6 } },
      { do: "roll", outcome: "passed", dice: 2, expect: { window: "accepted" } },
      { do: "roll", outcome: "dropped", dice: 4, expect: { window: "none" } },
    ],
  };

  it("says what the roller answers the dice with, and whether a window opened", () => {
    const en = scenarioText(doc, env("en")).steps;
    expect(en[0]).toEqual({
      when: "The holder passes a game, the dice show 2, then 6, the holder answers the dice with “Swamp”.",
      then: "The move goes 6 cells forward; the reaction window opens and the item is used.",
    });
    expect(en[1]!.then).toBe("The reaction window opens and the dice are accepted.");
    expect(en[2]!.then).toBe("No reaction window opens.");
    expect(scenarioText(doc, env("ru")).steps[0]!.when).toContain("игрок отвечает на бросок предметом «Болото»");
    expect(scenarioText(doc, env("uk")).steps[2]!.then).toBe("Вікно реакції не відкривається.");
  });
});

describe("scenarioText — lists", () => {
  const SALVE = { entry: "22222222-2222-4222-8222-222222222222", slug: "salve" };
  const names: Record<string, Record<"ru" | "en" | "uk", string>> = {
    self: { ru: "Болото", en: "Swamp", uk: "Болото" },
    ward: { ru: "Оберег", en: "Ward", uk: "Оберіг" },
    salve: { ru: "Мазь", en: "Salve", uk: "Мазь" },
  };
  const kinds: Record<string, "item" | "effect"> = { self: "effect", ward: "effect", salve: "item" };
  const key = (e: ScenarioEntry) => (e === "self" ? "self" : (e.slug ?? ""));
  const at = (locale: "ru" | "en" | "uk", withKinds: boolean) => ({
    locale,
    name: (e: ScenarioEntry) => names[key(e)]![locale],
    ...(withKinds ? { kind: (e: ScenarioEntry) => kinds[key(e)]! } : {}),
  });
  const s: ScenarioDoc = {
    title: { ru: "x" },
    given: { holder: { carries: [{ entry: "self" }, { entry: WARD, count: 2 }, { entry: SALVE }] } },
    steps: [
      {
        do: "use",
        item: SALVE,
        expect: { result: "used", holder: [{ entry: WARD, count: 2 }, { entry: "self", count: 0 }, { entry: SALVE, count: 0 }] },
      },
    ],
  };

  it("one clause per player for what they hold, and one for what they do not", () => {
    const en = scenarioText(s, at("en", false));
    expect(en.given).toBe("The holder carries “Swamp”, “Ward” ×2 and “Salve”.");
    expect(en.steps[0]!.then).toBe("The item is used; the holder carries “Ward” ×2; the holder does not carry “Swamp” or “Salve”.");
  });

  it("Russian and Ukrainian carry the case on the noun when the kind is known, and on a colon when not", () => {
    expect(scenarioText(s, at("ru", true)).given).toBe("У игрока эффект «Болото», эффект «Оберег» ×2 и предмет «Мазь».");
    expect(scenarioText(s, at("ru", true)).steps[0]!.then).toBe(
      "Предмет использован; у игрока эффект «Оберег» ×2; у игрока нет эффекта «Болото» и предмета «Мазь».",
    );
    expect(scenarioText(s, at("ru", false)).steps[0]!.then).toBe("Предмет использован; у игрока «Оберег» ×2; у игрока нет: «Болото» и «Мазь».");
    expect(scenarioText(s, at("uk", true)).steps[0]!.then).toBe(
      "Предмет використано; у гравця ефект «Оберіг» ×2; у гравця немає ефекту «Болото» і предмета «Мазь».",
    );
  });
});

describe("scenarioText — the next game (wave C, spec §5.5, §7.12)", () => {
  const doc: ScenarioDoc = {
    title: { ru: "Три двери" },
    given: { holder: { game: "starfall", passed: ["old_keep", "night_shift"], carries: [{ entry: "self" }] }, rival: { passed: ["sky_garden"] } },
    steps: [
      { do: "draw", expect: { result: "choosing", offered: 3, game: "none" } },
      { do: "draw", take: "quiet_house", expect: { result: "drawn", game: "quiet_house", offered: 0 } },
      { do: "draw", by: "rival", expect: { result: "refused", reason: "gameAlreadyHaveRoll" } },
      { do: "use", pick: { genre: "horror" }, expect: { result: "used" } },
      { do: "use", pick: { years: [1990, 1999] } },
      { do: "use", pick: { game: "tiny_planet" }, take: "gear_run", expect: { result: "refused", reason: "catalogAllPlayed", game: "sky_garden" } },
    ],
  };

  it("says the games given by their titles, the draw, what a use picks and the game it takes", () => {
    const en = scenarioText(doc, { ...env("en"), refusal: (code) => `(${code})` });
    expect(en.given).toBe(
      "The holder is playing “Starfall”, the holder has passed “Old Keep” and “Night Shift”, the holder carries “Swamp” and the rival has passed “Sky Garden”.",
    );
    expect(en.steps).toEqual([
      { when: "The holder's next game is picked.", then: "A choice of games opens; the holder has no game in flight; a choice of 3 games waits." },
      {
        when: "The holder's next game is picked; if a choice opens, the holder takes “Quiet House”.",
        then: "A game comes up; the holder is playing “Quiet House”; no choice of games waits.",
      },
      { when: "The rival's next game is picked.", then: "The pick is refused: (gameAlreadyHaveRoll)." },
      { when: "The holder uses “Swamp”, picking the genre “horror”.", then: "The item is used." },
      { when: "The holder uses “Swamp”, picking the years 1990–1999.", then: "Nothing is checked." },
      {
        when: "The holder uses “Swamp”, picking “Tiny Planet”; if a choice opens, the holder takes “Gear Run”.",
        then: "The use is refused: (catalogAllPlayed); the holder is playing “Sky Garden”.",
      },
    ]);
    const ru = scenarioText(doc, env("ru"));
    expect(ru.given).toBe("Игрок играет в «Starfall», игрок уже прошёл «Old Keep» и «Night Shift», у игрока «Болото» и соперник уже прошёл «Sky Garden».");
    expect(ru.steps[0]).toEqual({ when: "Игроку выбирается следующая игра.", then: "Открывается выбор игры; у игрока нет игры в процессе; ждёт выбор из 3 игр." });
    expect(ru.steps[1]!.when).toBe("Игроку выбирается следующая игра; если откроется выбор, игрок берёт «Quiet House».");
    expect(ru.steps[5]!.when).toBe("Игрок использует «Болото», выбрав игру «Tiny Planet»; если откроется выбор, игрок берёт «Gear Run».");
    const uk = scenarioText(doc, env("uk"));
    expect(uk.steps[2]).toEqual({ when: "Супернику обирається наступна гра.", then: "У виборі гри відмовлено: gameAlreadyHaveRoll." });
    expect(uk.steps[1]!.then).toBe("Гра випадає; гравець грає в «Quiet House»; вибір гри не чекає.");
    expect(uk.steps[4]!.when).toBe("Гравець використовує «Болото», обравши роки 1990–1999.");
  });

  it("says how many completion conditions the holder's game holds (spec §6.17)", () => {
    const doc: ScenarioDoc = {
      title: { ru: "x" },
      steps: [
        { do: "draw", expect: { conditions: 1 } },
        { do: "draw", expect: { conditions: 3 } },
        { do: "roll", outcome: "passed", dice: 3, expect: { conditions: 0 } },
        { do: "draw", expect: { conditions: 5 } },
      ],
    };
    expect(scenarioText(doc, env("en")).steps.map((s) => s.then)).toEqual([
      "The holder's game has 1 completion condition.",
      "The holder's game has 3 completion conditions.",
      "The holder's game has no completion conditions.",
      "The holder's game has 5 completion conditions.",
    ]);
    expect(scenarioText(doc, env("ru")).steps.map((s) => s.then)).toEqual([
      "У игры игрока 1 условие прохождения.",
      "У игры игрока 3 условия прохождения.",
      "У игры игрока нет условий прохождения.",
      "У игры игрока 5 условий прохождения.",
    ]);
    expect(scenarioText(doc, env("uk")).steps.map((s) => s.then)).toEqual([
      "У гри гравця 1 умова проходження.",
      "У гри гравця 3 умови проходження.",
      "У гри гравця немає умов проходження.",
      "У гри гравця 5 умов проходження.",
    ]);
  });
});

describe("scenarioText — objects on the board (wave D, spec §6.18)", () => {
  const SPRING = { entry: "22222222-2222-4222-8222-222222222222", slug: "ward" };
  const doc: ScenarioDoc = {
    title: { ru: "Мина" },
    given: { holder: { carries: [{ entry: "self" }] }, objects: [{ entry: "self", cell: 12, owner: "rival" }, { entry: SPRING, cell: 20 }] },
    steps: [
      { do: "use", pick: { cell: 14 }, expect: { result: "used", objects: 3 } },
      { do: "roll", outcome: "passed", dice: 4, expect: { moved: 2, cellFires: false, objects: 1 } },
      { do: "roll", outcome: "passed", dice: 4, expect: { objects: 0 } },
    ],
  };

  it("says what stands where and whose, the cell a use picks and how many objects are left", () => {
    const en = scenarioText(doc, env("en"));
    expect(en.given).toBe("The holder carries “Swamp”, the rival's “Swamp” stands on cell 12 and the holder's “Ward” stands on cell 20.");
    expect(en.steps).toEqual([
      { when: "The holder uses “Swamp”, picking cell 14.", then: "The item is used; 3 objects on the board." },
      { when: "The holder passes a game, the dice show 4.", then: "The move goes 2 cells forward; the cell does not fire; 1 object on the board." },
      { when: "The holder passes a game, the dice show 4.", then: "No object stands on the board." },
    ]);
    const ru = scenarioText(doc, env("ru"));
    expect(ru.given).toBe("У игрока «Болото», на клетке 12 стоит «Болото» соперника и на клетке 20 стоит «Оберег» игрока.");
    expect(ru.steps.map((s) => s.then)).toEqual(["Предмет использован; на поле 3 объекта.", "Ход на 2 клетки вперёд; клетка не срабатывает; на поле 1 объект.", "На поле нет объектов."]);
    expect(ru.steps[0]!.when).toBe("Игрок использует «Болото», выбрав клетку 14.");
    const uk = scenarioText(doc, env("uk"));
    expect(uk.given).toBe("У гравця «Болото», на клітинці 12 стоїть «Болото» суперника і на клітинці 20 стоїть «Оберіг» гравця.");
    expect(uk.steps.map((s) => s.then)).toEqual(["Предмет використано; на полі 3 об'єкти.", "Хід на 2 клітинки вперед; клітинка не спрацьовує; на полі 1 об'єкт.", "На полі немає об'єктів."]);
  });
});

