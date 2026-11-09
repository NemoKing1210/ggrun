/**
 * Rule text — the sentence a player reads under an entry's name, generated
 * from its rules in ru, en and uk (spec §13).
 *
 * Only the name and the optional flavor line are written by hand, so the text
 * cannot promise something the entry does not do: it is assembled from the
 * same primitives the game runs. A rule reads "<when>, <if …>, <does …>."; an
 * item starts with how it is used, an effect ends with how long it lasts.
 */
import type { IeeParams } from "../../types/iee";
import {
  LOCALES,
  type CellType,
  type DurationDoc,
  type EntryDoc,
  type EntryRef,
  type Locale,
  type LocalizedText,
  type ParamDecl,
  type RuleDoc,
  type UsageDoc,
} from "./doc";
import type { EntryFacts, TriggerName } from "./runtime";
import { NOUNS, counted, joinAnd, sentence } from "./text-kit";
import {
  actionDef,
  cellList,
  conditionDef,
  incomingClause,
  type ActionDoc,
  type ConditionDoc,
  type TextEnv,
} from "./vocabulary";

const IF: Record<Locale, string> = { en: "if ", ru: "если ", uk: "якщо " };

/**
 * Lead-ins of the triggers. Two absorb the condition that names them best:
 * "when you land on a penalty cell" instead of "when you land on a cell, if
 * the cell is a penalty cell", and "when you pass a game" likewise.
 */
const LEADS: Record<
  Locale,
  {
    land: (cells: string | null) => string;
    outcome: (is: "passed" | "dropped" | null) => string;
    apply: string;
    expire: string;
    tick: string;
    pickup: string;
    /** What arrives (wave B): the `incoming` condition's clause, or anything at all. */
    incoming: (clause: string | null) => string;
    /** A game is picked for the holder (wave C). */
    gameRoll: string;
    /** A game is assigned to the holder (wave C). */
    rollCreated: string;
    objectEntered: string;
    /** A rival's regular move ends on the holder's cell (wave D). */
    sameCell: string;
  }
> = {
  en: {
    land: (cells) => `when you land on ${cells ?? "a cell"}`,
    outcome: (is) =>
      is === "passed" ? "when you pass a game" : is === "dropped" ? "when you drop a game" : "when your game is resolved",
    apply: "when it is applied",
    expire: "when it ends",
    tick: "at the end of your turn",
    pickup: "when you get it",
    incoming: (clause) => (clause ? `when ${clause}` : "when anything acts on you"),
    gameRoll: "when a game is picked for you",
    rollCreated: "when you get a game",
    objectEntered: "when a move passes through or ends on its cell",
    sameCell: "when a rival's move ends on your cell",
  },
  ru: {
    land: (cells) => `когда вы встаёте на ${cells ?? "клетку"}`,
    outcome: (is) =>
      is === "passed" ? "когда вы проходите игру" : is === "dropped" ? "когда вы дропаете игру" : "когда ваша игра завершается",
    apply: "при наложении",
    expire: "когда эффект заканчивается",
    tick: "в конце вашего хода",
    pickup: "когда вы его получаете",
    incoming: (clause) => (clause ? `когда ${clause}` : "когда на вас что-либо действует"),
    gameRoll: "когда вам выбирается игра",
    rollCreated: "когда вы получаете игру",
    objectEntered: "когда чей-то ход проходит через его клетку или заканчивается на ней",
    sameCell: "когда ход соперника заканчивается на вашей клетке",
  },
  uk: {
    land: (cells) => `коли ви стаєте на ${cells ?? "клітинку"}`,
    outcome: (is) =>
      is === "passed" ? "коли ви проходите гру" : is === "dropped" ? "коли ви дропаєте гру" : "коли ваша гра завершується",
    apply: "під час накладання",
    expire: "коли ефект закінчується",
    tick: "наприкінці вашого ходу",
    pickup: "коли ви його отримуєте",
    incoming: (clause) => (clause ? `коли ${clause}` : "коли на вас щось діє"),
    gameRoll: "коли вам обирається гра",
    rollCreated: "коли ви отримуєте гру",
    objectEntered: "коли чийсь хід проходить через його клітинку або закінчується на ній",
    sameCell: "коли хід суперника закінчується на вашій клітинці",
  },
};

const USAGE_WINDOW: Record<Locale, Record<"anytime" | "before_roll" | "after_dice" | "on_open_roll", string>> = {
  en: {
    anytime: "use at any time",
    before_roll: "use before your roll",
    after_dice: "use right after the dice",
    on_open_roll: "use while your game is in progress",
  },
  ru: {
    anytime: "применяется в любой момент",
    before_roll: "применяется до броска",
    after_dice: "применяется сразу после броска",
    on_open_roll: "применяется, пока идёт ваша игра",
  },
  uk: {
    anytime: "застосовується будь-коли",
    before_roll: "застосовується до кидка",
    after_dice: "застосовується одразу після кидка",
    on_open_roll: "застосовується, поки триває ваша гра",
  },
};

const USAGE_TARGET: Record<Locale, Record<"self" | "other" | "any" | "none", string>> = {
  en: { self: "", none: "", other: " on another player", any: " on any player" },
  ru: { self: "", none: "", other: " на другого игрока", any: " на любого игрока" },
  uk: { self: "", none: "", other: " на іншого гравця", any: " на будь-якого гравця" },
};

/** Whom a target filter allows (spec §6.10) — it replaces the plain "on another player". */
const USAGE_FILTER: Record<Locale, Record<"ahead" | "behind" | "nearest_ahead" | "nearest_behind" | "leader", string>> = {
  en: {
    ahead: " on a player ahead of you",
    behind: " on a player behind you",
    nearest_ahead: " on the nearest player ahead of you",
    nearest_behind: " on the nearest player behind you",
    leader: " on the leader",
  },
  ru: {
    ahead: " на игрока впереди вас",
    behind: " на игрока позади вас",
    nearest_ahead: " на ближайшего игрока впереди вас",
    nearest_behind: " на ближайшего игрока позади вас",
    leader: " на лидера",
  },
  uk: {
    ahead: " на гравця попереду вас",
    behind: " на гравця позаду вас",
    nearest_ahead: " на найближчого гравця попереду вас",
    nearest_behind: " на найближчого гравця позаду вас",
    leader: " на лідера",
  },
};

/** What a use asks its user to pick for their next game (wave C, spec §6.16). */
const USAGE_PICK: Record<Locale, Record<"genre" | "years" | "game" | "cell", string>> = {
  en: { genre: ", picking a genre", years: ", picking a span of release years", game: ", picking a game", cell: ", picking a cell" },
  ru: { genre: ", с выбором жанра", years: ", с выбором лет выпуска", game: ", с выбором игры", cell: ", с выбором клетки" },
  uk: { genre: ", з вибором жанру", years: ", з вибором років випуску", game: ", з вибором гри", cell: ", з вибором клітинки" },
};

/** How a passive or cursed item works — it is never used (spec §6.10). */
const HELD: Record<Locale, { passive: string; cursed: string; fires: (n: number) => string }> = {
  en: {
    passive: "works while you hold it",
    cursed: "cursed: it cannot be used and works by itself",
    fires: (n) => (n === 1 ? "works once, then it is gone" : `works ${n} times, then it is gone`),
  },
  ru: {
    passive: "действует, пока предмет у вас",
    cursed: "проклятый: его нельзя использовать, он действует сам",
    fires: (n) => (n === 1 ? "срабатывает один раз и исчезает" : `срабатывает ${counted("ru", n, n, NOUNS.time)} и исчезает`),
  },
  uk: {
    passive: "діє, поки предмет у вас",
    cursed: "проклятий: його не можна використати, він діє сам",
    fires: (n) => (n === 1 ? "спрацьовує один раз і зникає" : `спрацьовує ${counted("uk", n, n, NOUNS.time)} і зникає`),
  },
};

const USES: Record<Locale, (n: number) => string> = {
  en: (n) => (n === 1 ? "single use" : `${n} uses`),
  ru: (n) => (n === 1 ? "одно использование" : `использований: ${n}`),
  uk: (n) => (n === 1 ? "одне використання" : `використань: ${n}`),
};

const DURATION: Record<Locale, (d: DurationDoc) => string> = {
  en: (d) => {
    const n = d.count ?? 1;
    switch (d.unit) {
      case "rolls":
        return `lasts ${counted("en", n, n, NOUNS.roll)}`;
      case "moves":
        return `lasts ${counted("en", n, n, NOUNS.move)}`;
      case "passed_games":
        return `lasts until you pass ${counted("en", n, n, NOUNS.game)}`;
      case "triggers":
        return n === 1 ? "works once" : `works ${counted("en", n, n, NOUNS.time)}`;
      case "next_game":
        return "lasts until your next game is resolved";
      case "instant":
        return "";
      default:
        return "permanent";
    }
  },
  ru: (d) => {
    const n = d.count ?? 1;
    switch (d.unit) {
      case "rolls":
        return `действует ${counted("ru", n, n, NOUNS.roll)}`;
      case "moves":
        return `действует ${counted("ru", n, n, NOUNS.move)}`;
      case "passed_games":
        return `действует, пока вы не пройдёте ${counted("ru", n, n, NOUNS.game)}`;
      case "triggers":
        return `срабатывает ${counted("ru", n, n, NOUNS.time)}`;
      case "next_game":
        return "действует до конца вашей следующей игры";
      case "instant":
        return "";
      default:
        return "действует постоянно";
    }
  },
  uk: (d) => {
    const n = d.count ?? 1;
    switch (d.unit) {
      case "rolls":
        return `діє ${counted("uk", n, n, NOUNS.roll)}`;
      case "moves":
        return `діє ${counted("uk", n, n, NOUNS.move)}`;
      case "passed_games":
        return `діє, доки ви не пройдете ${counted("uk", n, n, NOUNS.game)}`;
      case "triggers":
        return `спрацьовує ${counted("uk", n, n, NOUNS.time)}`;
      case "next_game":
        return "діє до кінця вашої наступної гри";
      case "instant":
        return "";
      default:
        return "діє постійно";
    }
  },
};

/** A piece of a sentence's head: a clause takes commas in ru/uk, a phrase does not. */
type HeadPart = { text: string; clause: boolean };

/** The lead of a rule and which of its conditions it already said. */
function leadOf(
  locale: Locale,
  trigger: TriggerName,
  conditions: readonly ConditionDoc[],
): { lead: HeadPart | null; absorbed: ReadonlySet<number> } {
  const leads = LEADS[locale];
  const absorbed = new Set<number>();
  switch (trigger) {
    case "beforeCellEffect":
    case "afterCellEffect": {
      const i = conditions.findIndex((c) => c.op === "cellType");
      if (i === -1) return { lead: { text: leads.land(null), clause: true }, absorbed };
      absorbed.add(i);
      const cell = conditions[i] as Extract<ConditionDoc, { op: "cellType" }>;
      return {
        lead: { text: leads.land(cellList(locale, cell.in as readonly CellType[], "to")), clause: true },
        absorbed,
      };
    }
    case "onOutcome": {
      const i = conditions.findIndex((c) => c.op === "outcome");
      if (i === -1) return { lead: { text: leads.outcome(null), clause: true }, absorbed };
      absorbed.add(i);
      const is = (conditions[i] as Extract<ConditionDoc, { op: "outcome" }>).is;
      return { lead: { text: leads.outcome(is), clause: true }, absorbed };
    }
    case "onApply":
      return { lead: { text: leads.apply, clause: false }, absorbed };
    case "onExpire":
      return { lead: { text: leads.expire, clause: true }, absorbed };
    case "onTick":
      return { lead: { text: leads.tick, clause: false }, absorbed };
    case "onPickup":
      return { lead: { text: leads.pickup, clause: true }, absorbed };
    case "beforeGameRoll":
      return { lead: { text: leads.gameRoll, clause: true }, absorbed };
    case "onRollCreated":
      return { lead: { text: leads.rollCreated, clause: true }, absorbed };
    case "onObjectEntered":
      return { lead: { text: leads.objectEntered, clause: true }, absorbed };
    case "onSameCell":
      return { lead: { text: leads.sameCell, clause: true }, absorbed };
    case "onIncoming": {
      // "when a rival aims a harmful action at you" — the `incoming` condition is the lead.
      const i = conditions.findIndex((c) => c.op === "incoming");
      if (i === -1) return { lead: { text: leads.incoming(null), clause: true }, absorbed };
      absorbed.add(i);
      const incoming = conditions[i] as Extract<ConditionDoc, { op: "incoming" }>;
      return { lead: { text: leads.incoming(incomingClause(locale, incoming)), clause: true }, absorbed };
    }
    default:
      // onUse, beforeMovement, afterMovement, whileActive: the action says it all.
      return { lead: null, absorbed };
  }
}

/**
 * Joins a sentence head and its body. English puts a comma after any
 * introductory part; Russian and Ukrainian only around clauses ("когда …",
 * "если …"), never after a bare phrase ("в конце хода", "с вероятностью 30%").
 */
function assemble(locale: Locale, head: readonly HeadPart[], body: string): string {
  if (head.length === 0) return sentence(body);
  if (locale === "en") return sentence(`${head.map((h) => h.text).join(", ")}, ${body}`);
  let out = head[0]!.text;
  for (let i = 1; i < head.length; i++) {
    const comma = head[i - 1]!.clause || head[i]!.clause;
    out += `${comma ? ", " : " "}${head[i]!.text}`;
  }
  const last = head[head.length - 1]!;
  return sentence(`${out}${last.clause ? ", " : " "}${body}`);
}

/** An instant effect does nothing but act as it arrives: its rules need no "when it is applied" (spec §6.4). */
export function isInstantEffect(doc: Pick<EntryDoc, "kind" | "duration">): boolean {
  return doc.kind === "effect" && doc.duration?.unit === "instant";
}

/**
 * One rule as one sentence. Assumes the rule passed the checks. A rule of an
 * instant effect goes without its lead: arriving is all such an effect does.
 */
export function ruleSentence(rule: RuleDoc, env: TextEnv, instant = false): string {
  const locale = env.locale;
  const conditions = (rule.if ?? []) as ConditionDoc[];
  const actions = rule.do as ActionDoc[];
  const led = leadOf(locale, rule.when as TriggerName, conditions);
  const { absorbed } = led;
  const lead = instant && rule.when === "onApply" ? null : led.lead;

  const ifs: string[] = [];
  const chances: string[] = [];
  conditions.forEach((c, i) => {
    if (absorbed.has(i)) return;
    const def = conditionDef(c);
    const clause = def.text[locale](c, env);
    (def.phrase === "chance" ? chances : ifs).push(clause);
  });

  const head: HeadPart[] = [];
  if (lead) head.push(lead);
  if (ifs.length > 0) head.push({ text: `${IF[locale]}${joinAnd(locale, ifs)}`, clause: true });
  if (chances.length > 0) head.push({ text: joinAnd(locale, chances), clause: false });

  const body = joinAnd(
    locale,
    actions.map((a) => actionDef(a).text[locale](a, env)),
  );
  return assemble(locale, head, body);
}

function usageSentence(usage: UsageDoc, locale: Locale): string {
  if (usage.activation !== "active") return sentence(HELD[locale][usage.activation]);
  const window = USAGE_WINDOW[locale][usage.window ?? "anytime"];
  const filter = usage.target?.filter;
  const target = filter ? USAGE_FILTER[locale][filter] : USAGE_TARGET[locale][usage.target?.who ?? "self"];
  const uses = USES[locale](usage.charges ?? 1);
  const pick = usage.pick ? USAGE_PICK[locale][usage.pick] : "";
  return [sentence(`${window}${target}${pick}`), sentence(uses)].join(" ");
}

/** One in the season (wave D, `usage.unique: "season"`, spec §6.19) — closing an item's text. */
const SEASON_ONE: Record<Locale, string> = {
  en: "there is one in the season",
  ru: "в сезоне такой предмет один",
  uk: "у сезоні такий предмет один",
};

/** How many times a passive or cursed item fires before it vanishes — closing its text, as a duration does. */
function heldClosing(usage: UsageDoc, locale: Locale): string {
  if (usage.activation === "active" || usage.charges === undefined) return "";
  return sentence(HELD[locale].fires(usage.charges));
}

export interface RuleTextInput {
  /** Parameter values to print — defaults, or the season's resolved values. */
  params: IeeParams;
  /** Facts about other entries, by entry id — names of what the rules hand out. */
  resolve: (entryId: string) => EntryFacts | null;
}

/** The whole description of an entry in every locale. */
export function ruleText(doc: EntryDoc, input: RuleTextInput): LocalizedText {
  const decls: Readonly<Record<string, ParamDecl>> = doc.params ?? {};
  const out = {} as LocalizedText;
  for (const locale of LOCALES) {
    const env: TextEnv = {
      locale,
      params: input.params,
      decls,
      resolve: (ref: EntryRef) => input.resolve(ref.entry),
    };
    const parts: string[] = [];
    if (doc.kind === "item" && doc.usage) parts.push(usageSentence(doc.usage, locale));
    for (const rule of doc.rules) parts.push(ruleSentence(rule, env, isInstantEffect(doc)));
    if (doc.kind === "effect" && doc.duration) {
      const line = DURATION[locale](doc.duration);
      if (line) parts.push(sentence(line));
    }
    if (doc.kind === "item" && doc.usage) parts.push(heldClosing(doc.usage, locale));
    if (doc.kind === "item" && doc.usage?.unique === "season") parts.push(sentence(SEASON_ONE[locale]));
    out[locale] = parts.filter((p) => p.length > 0).join(" ");
  }
  return out;
}
