/**
 * Entry scenarios in words (spec §5.5): Given / When / Then as sentences in
 * ru, en and uk, from the scenario's data.
 *
 * The scenario reference (`pnpm scenarios:doc`) prints them, and the editor
 * reads each step back under its forms. Like rule text, they are generated so
 * they cannot say something the scenario does not check. The scenario
 * season's defaults (the holder on cell 10 with 5 points, the rival on cell
 * 12 with 5 points, d6, no loop, low draws) go unsaid.
 */
import type { CellType, DrawRefusal, Locale, RollStep, ScenarioDoc, ScenarioEntry, ScenarioHolding, ScenarioPick, ScenarioStep, UseRefusal } from "./doc";
import { scenarioGame } from "./scenario-games";
import { NOUNS, counted, joinAnd, joinOr, quote, sentence, type Noun } from "./text-kit";
import { CELL_NAMES } from "./vocabulary";

export interface ScenarioTextEnv {
  locale: Locale;
  /** The name of an entry the scenario names; `"self"` is the entry itself. */
  name: (entry: ScenarioEntry) => string;
  /**
   * Its kind, when known: Russian and Ukrainian put the generic noun before a
   * quoted name to carry the case — «нет эффекта «Болото»».
   */
  kind?: (entry: ScenarioEntry) => "item" | "effect" | null;
  /** A refusal in words; the code by default. */
  refusal?: (code: UseRefusal | DrawRefusal) => string;
}

export interface ScenarioText {
  /** One sentence; empty when the scenario starts from the defaults. */
  given: string;
  steps: { when: string; then: string }[];
}

type Who = "holder" | "rival";
type Kind = "item" | "effect" | null;

/** The generic noun in the case a phrase needs, before a quoted name. */
const NOUN: Record<"ru" | "uk", Record<"nom" | "gen", Record<"item" | "effect", string>>> = {
  ru: { nom: { item: "предмет ", effect: "эффект " }, gen: { item: "предмета ", effect: "эффекта " } },
  uk: { nom: { item: "предмет ", effect: "ефект " }, gen: { item: "предмета ", effect: "ефекту " } },
};
const noun = (locale: "ru" | "uk", kase: "nom" | "gen", kind: Kind) => (kind ? NOUN[locale][kase][kind] : "");

interface Words {
  who: Record<Who, string>;
  /** "the holder carries {things}" — things already quoted and joined. */
  carries: (who: Who, things: string) => string;
  carriesNot: (who: Who, things: string) => string;
  onCell: (who: Who, n: number) => string;
  points: (who: Who, n: number) => string;
  inFlight: (who: Who) => string;
  /** The dice sum of their last move — what «Магнит» compares against. */
  lastRoll: (who: Who, n: number) => string;
  left: string;
  sides: (n: number) => string;
  loop: string;
  high: string;
  pass: (who: Who) => string;
  drop: (who: Who) => string;
  diceShow: (n: number, then: readonly number[]) => string;
  endsOn: (cell: string) => string;
  /** Who uses it — the rival too, wave B — and on whom: the other player, themselves, nobody. */
  use: (by: Who, what: string, on: "rival" | "holder" | "nobody" | null) => string;
  /** What the use picks among the holder's own (spec §6.10). */
  choosing: (what: string) => string;
  /** A pick from the season's catalog (spec §6.12). */
  choosingEntry: (what: string) => string;
  /** Handed out as staff do, or dropped by the wheel (wave B). */
  grant: (what: string, to: Who, wheel: boolean) => string;
  moved: (n: number) => string;
  dice: (count: number | undefined, sides: number | undefined) => string;
  cell: (fires: boolean) => string;
  wheel: (w: "none" | "bonus" | "penalty") => string;
  /** The wheel a rule spins once more (spec §6.12). */
  wheelAgain: (w: "none" | "bonus" | "penalty") => string;
  /** In the reaction window the roller answers the dice with an item (wave B, §7.4). */
  reacting: (by: Who, what: string) => string;
  /** Whether a reaction window opens, and how it is answered. */
  window: (answer: "none" | "accepted" | "used") => string;
  used: string;
  refused: (reason: string | null) => string;
  granted: Record<"granted" | "refreshed" | "refused", string>;
  balance: (who: Who, n: number) => string;
  /** Answers a victim choice (wave B, §7.6): the default, or an option and what it picks. */
  decide: (by: Who, option: "discard" | "endure" | "retain" | null, picks: string) => string;
  decided: string;
  decideRefused: string;
  /** Whether a victim choice waits for the holder after the step. */
  decision: (pending: boolean) => string;
  /** The game in flight, of the scenario pool (wave C) — given, or checked after a step. */
  playing: (who: Who, title: string | null) => string;
  /** The games passed this season so far — what the next game's rules read. */
  passedGames: (who: Who, titles: string) => string;
  /** The next game is picked, as rolling picks it (§7.12). */
  draw: (by: Who) => string;
  /** A choice of games the step opens: the game whoever stepped takes. */
  taking: (who: Who, title: string) => string;
  /** What a use picks for the next game (§6.16). */
  picking: (pick: { genre: string } | { years: [number, number] } | { game: string } | { cell: number }) => string;
  /** An object standing on the board before the first step (wave D, §6.18): the item, its cell, whose. */
  objectOn: (what: string, cell: number, owner: Who) => string;
  /** How many objects stand on the board after a step. */
  objects: (n: number) => string;
  drawn: Record<"drawn" | "choosing", string>;
  drawRefused: (reason: string | null) => string;
  /** How many games the holder's pending choice offers. */
  offered: (n: number) => string;
  /** How many completion conditions the holder's game holds (wave C, §6.17). */
  conditions: (n: number) => string;
  nothing: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** "у игры игрока 2 условия прохождения" — a subject: the nominative, where `NOUNS` holds the accusative. */
const RU_CONDITIONS: Noun = NOUNS.condition;
const UK_CONDITIONS: Noun = { ...NOUNS.condition, uk: ["умова проходження", "умови проходження", "умов проходження"] };

const EN: Words = {
  who: { holder: "the holder", rival: "the rival" },
  carries: (who, things) => `${EN.who[who]} carries ${things}`,
  carriesNot: (who, things) => `${EN.who[who]} does not carry ${things}`,
  onCell: (who, n) => `${EN.who[who]} is on cell ${n}`,
  points: (who, n) => `${EN.who[who]} has ${counted("en", n, n, NOUNS.point)}`,
  inFlight: (who) => `${EN.who[who]} has a game in flight`,
  lastRoll: (who, n) => `${EN.who[who]}'s last roll was ${n}`,
  left: "the rival has left the run",
  sides: (n) => `the season rolls d${n}`,
  loop: "the board loops",
  high: "random draws come out high",
  pass: (who) => `${EN.who[who]} passes a game`,
  drop: (who) => `${EN.who[who]} drops a game`,
  diceShow: (n, then) => [`the dice show ${n}`, ...then].join(", then "),
  endsOn: (cell) => `the move ends on ${cell}`,
  use: (by, what, on) =>
    `${EN.who[by]} uses ${what}${on === null ? "" : on === "nobody" ? " with no target" : on === by ? " on themselves" : ` on ${EN.who[on]}`}`,
  choosing: (what) => `, picking ${what}`,
  choosingEntry: (what) => `, picking ${what} from the catalog`,
  grant: (what, to, wheel) => (wheel ? `the wheel drops ${what} to ${EN.who[to]}` : `${what} is handed to ${EN.who[to]}`),
  moved: (n) =>
    n === 0 ? "the move goes nowhere" : `the move goes ${counted("en", n, n, NOUNS.cell)} ${n > 0 ? "forward" : "back"}`,
  dice: (count, sides) =>
    count !== undefined && sides !== undefined
      ? `the dice are ${count}d${sides}`
      : sides !== undefined
        ? `the dice have ${counted("en", sides, sides, NOUNS.side)}`
        : `${counted("en", count!, count!, NOUNS.die)} are thrown`,
  cell: (fires) => (fires ? "the cell fires" : "the cell does not fire"),
  wheel: (w) => (w === "none" ? "no wheel spins" : `the ${w} wheel spins`),
  wheelAgain: (w) => (w === "none" ? "no wheel spins once more" : `the ${w} wheel spins once more`),
  reacting: (by, what) => `${EN.who[by]} answers the dice with ${what}`,
  window: (answer) =>
    answer === "none"
      ? "no reaction window opens"
      : answer === "accepted"
        ? "the reaction window opens and the dice are accepted"
        : "the reaction window opens and the item is used",
  used: "the item is used",
  refused: (reason) => (reason ? `the use is refused: ${reason}` : "the use is refused"),
  granted: { granted: "it is granted", refreshed: "it refreshes the one already there", refused: "it is refused" },
  balance: (who, n) => (n === 0 ? `${EN.who[who]}'s points do not change` : `${EN.who[who]}'s points change by ${signed(n)}`),
  decide: (by, option, picks) =>
    option === null
      ? `${EN.who[by]} takes the default of their choice`
      : option === "endure"
        ? `${EN.who[by]} gives nothing up`
        : option === "discard"
          ? picks
            ? `${EN.who[by]} discards ${picks}`
            : `${EN.who[by]} chooses to discard`
          : picks
            ? `${EN.who[by]} keeps ${picks}`
            : `${EN.who[by]} chooses what to keep`,
  decided: "the choice is made",
  decideRefused: "the choice is refused",
  decision: (pending) => (pending ? "a choice waits for the holder" : "no choice waits for the holder"),
  playing: (who, title) => (title === null ? `${EN.who[who]} has no game in flight` : `${EN.who[who]} is playing ${title}`),
  passedGames: (who, titles) => `${EN.who[who]} has passed ${titles}`,
  draw: (by) => `${EN.who[by]}'s next game is picked`,
  taking: (who, title) => `; if a choice opens, ${EN.who[who]} takes ${title}`,
  picking: (pick) =>
    "genre" in pick
      ? `, picking the genre “${pick.genre}”`
      : "years" in pick
        ? `, picking the years ${pick.years[0]}–${pick.years[1]}`
        : "cell" in pick
          ? `, picking cell ${pick.cell}`
          : `, picking ${pick.game}`,
  objectOn: (what, cell, owner) => `${EN.who[owner]}'s ${what} stands on cell ${cell}`,
  objects: (n) => (n === 0 ? "no object stands on the board" : `${counted("en", n, n, NOUNS.object)} on the board`),
  drawn: { drawn: "a game comes up", choosing: "a choice of games opens" },
  drawRefused: (reason) => (reason ? `the pick is refused: ${reason}` : "the pick is refused"),
  offered: (n) => (n === 0 ? "no choice of games waits" : `a choice of ${n} games waits`),
  conditions: (n) => (n === 0 ? "the holder's game has no completion conditions" : `the holder's game has ${counted("en", n, n, NOUNS.condition)}`),
  nothing: "nothing is checked",
};

const RU: Words = {
  who: { holder: "игрок", rival: "соперник" },
  carries: (who, things) => `у ${who === "holder" ? "игрока" : "соперника"} ${things}`,
  carriesNot: (who, things) => `у ${who === "holder" ? "игрока" : "соперника"} нет${things.startsWith(":") ? "" : " "}${things}`,
  onCell: (who, n) => `${RU.who[who]} на клетке ${n}`,
  points: (who, n) => `у ${who === "holder" ? "игрока" : "соперника"} ${counted("ru", n, n, NOUNS.point)}`,
  inFlight: (who) => `у ${who === "holder" ? "игрока" : "соперника"} игра в процессе`,
  lastRoll: (who, n) => `в последнем броске ${who === "holder" ? "игрока" : "соперника"} выпало ${n}`,
  left: "соперник выбыл из забега",
  sides: (n) => `в сезоне кубик d${n}`,
  loop: "поле закольцовано",
  high: "случайные значения — наибольшие",
  pass: (who) => `${RU.who[who]} проходит игру`,
  drop: (who) => `${RU.who[who]} дропает игру`,
  diceShow: (n, then) => [`на кубиках ${n}`, ...then].join(", затем "),
  endsOn: (cell) => `ход заканчивается на ${cell}`,
  use: (by, what, on) =>
    `${RU.who[by]} использует ${what}${on === null ? "" : on === "nobody" ? " без цели" : on === by ? " на себе" : on === "rival" ? " на сопернике" : " на игроке"}`,
  choosing: (what) => `, выбрав ${what}`,
  choosingEntry: (what) => `, выбрав из каталога ${what}`,
  grant: (what, to, wheel) => `${RU.who[to]} получает ${what}${wheel ? " с колеса" : ""}`,
  moved: (n) => (n === 0 ? "ход никуда не ведёт" : `ход на ${counted("ru", n, n, NOUNS.cell)} ${n > 0 ? "вперёд" : "назад"}`),
  dice: (count, sides) =>
    count !== undefined && sides !== undefined
      ? `кубики ${count}d${sides}`
      : sides !== undefined
        ? `у кубиков ${counted("ru", sides, sides, NOUNS.side)}`
        : `кубиков: ${count}`,
  cell: (fires) => (fires ? "клетка срабатывает" : "клетка не срабатывает"),
  wheel: (w) => (w === "none" ? "колесо не крутится" : w === "bonus" ? "крутится бонусное колесо" : "крутится штрафное колесо"),
  wheelAgain: (w) =>
    w === "none" ? "колесо ещё раз не крутится" : w === "bonus" ? "бонусное колесо крутится ещё раз" : "штрафное колесо крутится ещё раз",
  reacting: (by, what) => `${RU.who[by]} отвечает на бросок предметом ${what}`,
  window: (answer) =>
    answer === "none"
      ? "окно реакции не открывается"
      : answer === "accepted"
        ? "окно реакции открывается, бросок принят"
        : "окно реакции открывается, предмет применён",
  used: "предмет использован",
  refused: (reason) => (reason ? `в использовании отказано: ${reason}` : "в использовании отказано"),
  granted: { granted: "выдано", refreshed: "обновляет уже действующий", refused: "в выдаче отказано" },
  balance: (who, n) =>
    n === 0
      ? `очки ${who === "holder" ? "игрока" : "соперника"} не меняются`
      : `очки ${who === "holder" ? "игрока" : "соперника"} меняются на ${signed(n)}`,
  decide: (by, option, picks) =>
    option === null
      ? `${RU.who[by]} соглашается на вариант по умолчанию`
      : option === "endure"
        ? `${RU.who[by]} ничего не отдаёт`
        : option === "discard"
          ? picks
            ? `${RU.who[by]} сбрасывает ${picks}`
            : `${RU.who[by]} выбирает сбросить`
          : picks
            ? `${RU.who[by]} оставляет ${picks}`
            : `${RU.who[by]} выбирает, что оставить`,
  decided: "выбор сделан",
  decideRefused: "выбор отклонён",
  decision: (pending) => (pending ? "игрока ждёт выбор" : "у игрока нет ожидающего выбора"),
  playing: (who, title) =>
    title === null ? `у ${who === "holder" ? "игрока" : "соперника"} нет игры в процессе` : `${RU.who[who]} играет в ${title}`,
  passedGames: (who, titles) => `${RU.who[who]} уже прошёл ${titles}`,
  draw: (by) => `${by === "holder" ? "игроку" : "сопернику"} выбирается следующая игра`,
  taking: (who, title) => `; если откроется выбор, ${RU.who[who]} берёт ${title}`,
  picking: (pick) =>
    "genre" in pick
      ? `, выбрав жанр «${pick.genre}»`
      : "years" in pick
        ? `, выбрав годы ${pick.years[0]}–${pick.years[1]}`
        : "cell" in pick
          ? `, выбрав клетку ${pick.cell}`
          : `, выбрав игру ${pick.game}`,
  objectOn: (what, cell, owner) => `на клетке ${cell} стоит ${what} ${owner === "holder" ? "игрока" : "соперника"}`,
  objects: (n) => (n === 0 ? "на поле нет объектов" : `на поле ${counted("ru", n, n, NOUNS.object)}`),
  drawn: { drawn: "игра выпадает", choosing: "открывается выбор игры" },
  drawRefused: (reason) => (reason ? `в выборе игры отказано: ${reason}` : "в выборе игры отказано"),
  offered: (n) => (n === 0 ? "выбор игры не ждёт" : `ждёт выбор из ${n} игр`),
  conditions: (n) => (n === 0 ? "у игры игрока нет условий прохождения" : `у игры игрока ${counted("ru", n, n, RU_CONDITIONS)}`),
  nothing: "ничего не проверяется",
};

const UK: Words = {
  who: { holder: "гравець", rival: "суперник" },
  carries: (who, things) => `у ${who === "holder" ? "гравця" : "суперника"} ${things}`,
  carriesNot: (who, things) => `у ${who === "holder" ? "гравця" : "суперника"} немає${things.startsWith(":") ? "" : " "}${things}`,
  onCell: (who, n) => `${UK.who[who]} на клітинці ${n}`,
  points: (who, n) => `у ${who === "holder" ? "гравця" : "суперника"} ${counted("uk", n, n, NOUNS.point)}`,
  inFlight: (who) => `у ${who === "holder" ? "гравця" : "суперника"} гра в процесі`,
  lastRoll: (who, n) => `в останньому кидку ${who === "holder" ? "гравця" : "суперника"} випало ${n}`,
  left: "суперник вибув із забігу",
  sides: (n) => `у сезоні кубик d${n}`,
  loop: "поле закільцьоване",
  high: "випадкові значення — найбільші",
  pass: (who) => `${UK.who[who]} проходить гру`,
  drop: (who) => `${UK.who[who]} дропає гру`,
  diceShow: (n, then) => [`на кубиках ${n}`, ...then].join(", потім "),
  endsOn: (cell) => `хід закінчується на ${cell}`,
  use: (by, what, on) =>
    `${UK.who[by]} використовує ${what}${on === null ? "" : on === "nobody" ? " без цілі" : on === by ? " на собі" : on === "rival" ? " на супернику" : " на гравцеві"}`,
  choosing: (what) => `, обравши ${what}`,
  choosingEntry: (what) => `, обравши з каталогу ${what}`,
  grant: (what, to, wheel) => `${UK.who[to]} отримує ${what}${wheel ? " з колеса" : ""}`,
  moved: (n) => (n === 0 ? "хід нікуди не веде" : `хід на ${counted("uk", n, n, NOUNS.cell)} ${n > 0 ? "вперед" : "назад"}`),
  dice: (count, sides) =>
    count !== undefined && sides !== undefined
      ? `кубики ${count}d${sides}`
      : sides !== undefined
        ? `у кубиків ${counted("uk", sides, sides, NOUNS.side)}`
        : `кубиків: ${count}`,
  cell: (fires) => (fires ? "клітинка спрацьовує" : "клітинка не спрацьовує"),
  wheel: (w) => (w === "none" ? "колесо не крутиться" : w === "bonus" ? "крутиться бонусне колесо" : "крутиться штрафне колесо"),
  wheelAgain: (w) =>
    w === "none" ? "колесо ще раз не крутиться" : w === "bonus" ? "бонусне колесо крутиться ще раз" : "штрафне колесо крутиться ще раз",
  reacting: (by, what) => `${UK.who[by]} відповідає на кидок предметом ${what}`,
  window: (answer) =>
    answer === "none"
      ? "вікно реакції не відкривається"
      : answer === "accepted"
        ? "вікно реакції відкривається, кидок прийнято"
        : "вікно реакції відкривається, предмет застосовано",
  used: "предмет використано",
  refused: (reason) => (reason ? `у використанні відмовлено: ${reason}` : "у використанні відмовлено"),
  granted: { granted: "видано", refreshed: "оновлює вже чинний", refused: "у видачі відмовлено" },
  balance: (who, n) =>
    n === 0
      ? `очки ${who === "holder" ? "гравця" : "суперника"} не змінюються`
      : `очки ${who === "holder" ? "гравця" : "суперника"} змінюються на ${signed(n)}`,
  decide: (by, option, picks) =>
    option === null
      ? `${UK.who[by]} погоджується на варіант за замовчуванням`
      : option === "endure"
        ? `${UK.who[by]} нічого не віддає`
        : option === "discard"
          ? picks
            ? `${UK.who[by]} скидає ${picks}`
            : `${UK.who[by]} обирає скинути`
          : picks
            ? `${UK.who[by]} залишає ${picks}`
            : `${UK.who[by]} обирає, що залишити`,
  decided: "вибір зроблено",
  decideRefused: "вибір відхилено",
  decision: (pending) => (pending ? "на гравця чекає вибір" : "у гравця немає вибору, що чекає"),
  playing: (who, title) =>
    title === null ? `у ${who === "holder" ? "гравця" : "суперника"} немає гри в процесі` : `${UK.who[who]} грає в ${title}`,
  passedGames: (who, titles) => `${UK.who[who]} уже пройшов ${titles}`,
  draw: (by) => `${by === "holder" ? "гравцеві" : "супернику"} обирається наступна гра`,
  taking: (who, title) => `; якщо відкриється вибір, ${UK.who[who]} бере ${title}`,
  picking: (pick) =>
    "genre" in pick
      ? `, обравши жанр «${pick.genre}»`
      : "years" in pick
        ? `, обравши роки ${pick.years[0]}–${pick.years[1]}`
        : "cell" in pick
          ? `, обравши клітинку ${pick.cell}`
          : `, обравши гру ${pick.game}`,
  objectOn: (what, cell, owner) => `на клітинці ${cell} стоїть ${what} ${owner === "holder" ? "гравця" : "суперника"}`,
  objects: (n) => (n === 0 ? "на полі немає об'єктів" : `на полі ${counted("uk", n, n, NOUNS.object)}`),
  drawn: { drawn: "гра випадає", choosing: "відкривається вибір гри" },
  drawRefused: (reason) => (reason ? `у виборі гри відмовлено: ${reason}` : "у виборі гри відмовлено"),
  offered: (n) => (n === 0 ? "вибір гри не чекає" : `чекає вибір із ${n} ігор`),
  conditions: (n) => (n === 0 ? "у гри гравця немає умов проходження" : `у гри гравця ${counted("uk", n, n, UK_CONDITIONS)}`),
  nothing: "нічого не перевіряється",
};

const WORDS: Record<Locale, Words> = { en: EN, ru: RU, uk: UK };

/** The scenario season's defaults: what a sentence leaves out. */
const DEFAULT_POSITION: Record<Who, number> = { holder: 10, rival: 12 };
const DEFAULT_BALANCE = 5;

const cellName = (locale: Locale, cell: CellType) => CELL_NAMES[locale][cell].at;

/** A game of the scenario pool, quoted by its title (wave C). */
function gameTitle(locale: Locale, key: string): string {
  return quote(locale, scenarioGame(key)?.title ?? key);
}

/** A pick for the next game, the game quoted by its title. */
function pickText(w: Words, locale: Locale, pick: ScenarioPick): string {
  return w.picking("game" in pick ? { game: gameTitle(locale, pick.game) } : pick);
}

/** A quoted name, with the generic noun Russian and Ukrainian need for the case. */
function thing(env: ScenarioTextEnv, entry: ScenarioEntry, kase: "nom" | "gen", count = 1): string {
  const name = quote(env.locale, env.name(entry));
  const kind = env.kind?.(entry) ?? null;
  const prefix = env.locale === "en" ? "" : noun(env.locale, kase, kind);
  return `${prefix}${name}${count > 1 ? ` ×${count}` : ""}`;
}

/** Who holds what after a step, grouped per player: what they hold, then what they do not. */
function holdingsText(w: Words, env: ScenarioTextEnv, who: Who, list: readonly ScenarioHolding[]): string[] {
  const out: string[] = [];
  const held = list.filter((h) => h.count > 0);
  const none = list.filter((h) => h.count === 0);
  if (held.length > 0) out.push(w.carries(who, joinAnd(env.locale, held.map((h) => thing(env, h.entry, "nom", h.count)))));
  if (none.length > 0) {
    const things = none.map((h) => thing(env, h.entry, "gen"));
    // Without the noun, Russian and Ukrainian list what is missing after a colon.
    const bare = env.locale !== "en" && none.some((h) => (env.kind?.(h.entry) ?? null) === null);
    const list = env.locale === "en" ? joinOr("en", things) : joinAnd(env.locale, things);
    out.push(w.carriesNot(who, bare ? `: ${list}` : list));
  }
  return out;
}

function givenText(scenario: ScenarioDoc, env: ScenarioTextEnv): string {
  const w = WORDS[env.locale];
  const given = scenario.given ?? {};
  const parts: string[] = [];
  for (const who of ["holder", "rival"] as const) {
    const g = given[who];
    if (!g) continue;
    if (g.position !== undefined && g.position !== DEFAULT_POSITION[who]) parts.push(w.onCell(who, g.position));
    if (g.balance !== undefined && g.balance !== DEFAULT_BALANCE) parts.push(w.points(who, g.balance));
    if (g.game !== undefined) parts.push(w.playing(who, gameTitle(env.locale, g.game)));
    else if (g.inFlight) parts.push(w.inFlight(who));
    if (g.passed !== undefined && g.passed.length > 0) {
      parts.push(w.passedGames(who, joinAnd(env.locale, g.passed.map((key) => gameTitle(env.locale, key)))));
    }
    if (g.lastRoll !== undefined) parts.push(w.lastRoll(who, g.lastRoll));
    const carried = (g.carries ?? []).map((c) => thing(env, c.entry, "nom", c.count ?? 1));
    if (carried.length > 0) parts.push(w.carries(who, joinAnd(env.locale, carried)));
  }
  for (const o of given.objects ?? []) parts.push(w.objectOn(thing(env, o.entry, "nom"), o.cell, o.owner ?? "holder"));
  if (given.rival?.left) parts.push(w.left);
  if (given.sides !== undefined && given.sides !== 6) parts.push(w.sides(given.sides));
  if (given.loop) parts.push(w.loop);
  if (given.draws === "high") parts.push(w.high);
  return parts.length === 0 ? "" : sentence(joinAnd(env.locale, parts));
}

function rollWhen(w: Words, env: ScenarioTextEnv, step: RollStep): string {
  const { locale } = env;
  const who = step.by ?? "holder";
  const parts = [step.outcome === "passed" ? w.pass(who) : w.drop(who), w.diceShow(step.dice, step.then ?? [])];
  if (step.react) parts.push(w.reacting(who, quote(locale, env.name(step.react))));
  if (step.cell && step.cell !== "normal") parts.push(w.endsOn(cellName(locale, step.cell)));
  return sentence(parts.join(", "));
}

function stepText(step: ScenarioStep, env: ScenarioTextEnv): { when: string; then: string } {
  const { locale } = env;
  const w = WORDS[locale];
  let when: string;
  const then: string[] = [];
  switch (step.do) {
    case "roll": {
      when = rollWhen(w, env, step);
      const e = step.expect;
      if (e?.moved !== undefined) then.push(w.moved(e.moved));
      if (e?.diceCount !== undefined || e?.diceSides !== undefined) then.push(w.dice(e?.diceCount, e?.diceSides));
      if (e?.cellFires !== undefined) then.push(w.cell(e.cellFires));
      if (e?.wheel !== undefined) then.push(w.wheel(e.wheel));
      if (e?.wheelAgain !== undefined) then.push(w.wheelAgain(e.wheelAgain));
      if (e?.window !== undefined) then.push(w.window(e.window));
      break;
    }
    case "use": {
      const item = step.item ? env.name(step.item) : env.name("self");
      const choosing = step.choose ? w.choosing(quote(locale, env.name(step.choose))) : "";
      const choosingEntry = step.chooseEntry ? w.choosingEntry(quote(locale, env.name(step.chooseEntry))) : "";
      const picking = step.pick ? pickText(w, locale, step.pick) : "";
      const taking = step.take ? w.taking(step.by ?? "holder", gameTitle(locale, step.take)) : "";
      when = sentence(w.use(step.by ?? "holder", quote(locale, item), step.on ?? null) + choosing + choosingEntry + picking + taking);
      const e = step.expect;
      if (e?.result === "used") then.push(w.used);
      else if (e?.result === "refused" || e?.reason !== undefined) {
        then.push(w.refused(e?.reason ? (env.refusal?.(e.reason) ?? e.reason) : null));
      }
      break;
    }
    case "grant": {
      when = sentence(w.grant(thing(env, step.entry, "nom"), step.to ?? "holder", step.via === "wheel"));
      if (step.expect?.result) then.push(w.granted[step.expect.result]);
      break;
    }
    case "decide": {
      const picks = joinAnd(locale, (step.picks ?? []).map((p) => quote(locale, env.name(p))));
      when = sentence(w.decide(step.by ?? "holder", step.option ?? null, picks));
      if (step.expect?.result === "decided") then.push(w.decided);
      else if (step.expect?.result === "refused") then.push(w.decideRefused);
      break;
    }
    case "draw": {
      when = sentence(w.draw(step.by ?? "holder") + (step.take ? w.taking(step.by ?? "holder", gameTitle(locale, step.take)) : ""));
      const e = step.expect;
      if (e?.result === "drawn" || e?.result === "choosing") then.push(w.drawn[e.result]);
      else if (e?.result === "refused" || e?.reason !== undefined) {
        then.push(w.drawRefused(e?.reason ? (env.refusal?.(e.reason) ?? e.reason) : null));
      }
      break;
    }
  }
  const e = step.expect;
  if (e?.balance !== undefined) then.push(w.balance("holder", e.balance));
  if (e?.rivalBalance !== undefined) then.push(w.balance("rival", e.rivalBalance));
  if (e?.position !== undefined) then.push(w.onCell("holder", e.position));
  if (e?.rivalPosition !== undefined) then.push(w.onCell("rival", e.rivalPosition));
  if (e?.decision !== undefined) then.push(w.decision(e.decision === "pending"));
  if (e?.game !== undefined) then.push(w.playing("holder", e.game === "none" ? null : gameTitle(locale, e.game)));
  if (e?.offered !== undefined) then.push(w.offered(e.offered));
  if (e?.conditions !== undefined) then.push(w.conditions(e.conditions));
  if (e?.objects !== undefined) then.push(w.objects(e.objects));
  then.push(...holdingsText(w, env, "holder", e?.holder ?? []));
  then.push(...holdingsText(w, env, "rival", e?.rival ?? []));
  return { when, then: sentence(then.length === 0 ? w.nothing : then.join("; ")) };
}

/** A scenario in one language. */
export function scenarioText(scenario: ScenarioDoc, env: ScenarioTextEnv): ScenarioText {
  return { given: givenText(scenario, env), steps: scenario.steps.map((s) => stepText(s, env)) };
}
