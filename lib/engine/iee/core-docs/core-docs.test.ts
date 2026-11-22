import { describe, expect, it } from "vitest";

import { compileSet } from "../dsl/set";
import { isEffect, isItem } from "../dsl/runtime";
import { CORE_DOCS, CORE_ENTRY_IDS, CORE_PACK_ID, CORE_REVISIONS } from "./index";

const set = compileSet(CORE_DOCS);

/**
 * The system pack after wave D (spec §17.1, plan tasks A.5, B.4, C.3 and D.3):
 * the core and wave-A to wave-D rows of the starter set; the effect
 * `heavy_boots`, kept as «Тяжёлый шаг» now that the boots are the cursed item
 * `cursed_boots` (an entry keeps its kind, so the slug could not move); and
 * nine handouts that only their items hand out — `magnet_pull` («Магнит»),
 * `fate_roll` («Кости судьбы»), `treasure_hunt` («Карта сокровищ»), and wave
 * C's `vetoed_genre`, `pick_of_two`, `favoured_game`, `behind_doors`,
 * `chosen_genre` and `chosen_era`, which remember what their item picked.
 */
const ITEM_KEYS = [
  "broken_compass",
  "chaos_die",
  "cleansing_salve",
  "copy_scroll",
  "crown",
  "cursed_boots",
  "cursed_die",
  "era_pick",
  "fate_dice",
  "favourite",
  "game_reroll",
  "genre_pick",
  "genre_veto",
  "golden_coin",
  "hex_scroll",
  "hook",
  "jinx",
  "joker",
  "lead_weights",
  "lucky_coin",
  "magnet",
  "mine",
  "mirror_shield",
  "philosophers_stone",
  "phoenix",
  "portal_scroll",
  "postponed_game",
  "purifying_amulet",
  "second_chance",
  "shield",
  "snare",
  "spare_die",
  "speed_boots",
  "speed_elixir",
  "spring",
  "swap_scroll",
  "teleport",
  "teleport_ring",
  "thief_glove",
  "three_doors",
  "time_stone",
  "trade_scroll",
  "treasure_map",
];
const EFFECT_KEYS = [
  "acceleration",
  "back_teleport",
  "behind_doors",
  "burden",
  "castling",
  "chain",
  "chosen_era",
  "chosen_genre",
  "clean_start",
  "curse",
  "curse_echo",
  "curse_of_greed",
  "fast_track",
  "fate_roll",
  "favoured_game",
  "fortune",
  "genre_trial",
  "greedy_explorer",
  "hard_mode",
  "heavy_boots",
  "immunity",
  "invisibility",
  "lost_time",
  "lucky",
  "magnet_pull",
  "main_story",
  "mark",
  "misfired_portal",
  "misfortune",
  "momentum",
  "no_dlc",
  "no_guides",
  "old_hardware",
  "one_chance",
  "overload",
  "pick_of_two",
  "pickpocket",
  "poison",
  "pursuit",
  "swamp",
  "tailwind",
  "tax",
  "toll",
  "treasure_hunt",
  "uncharted_territory",
  "unlucky",
  "vetoed_genre",
  "ward",
];

/**
 * Renamed entries keep the id they had as stage-1 keys (D11): instances,
 * references and exports point at the id, so a rename is a new slug on the
 * same entry, never a new entry.
 */
const KEPT_IDS: Record<string, string> = {
  speed_boots: "4a8ad97d-4287-468d-b300-5e20c2a593b0", // was lodestone
  swamp: "d010558f-1f33-4da4-96b9-53e2596f8d16", // was slowed
  ward: "5d9e9af9-9c47-4f8f-82b2-1ee357df48ba", // was the effect shield
  toll: "1ea04d36-3025-4a31-8951-743c98b929ef", // was taxed
};

describe("core documents — the system pack", () => {
  it("all compile, with no errors and no warnings", () => {
    expect(set.failures).toEqual([]);
    expect(set.warnings).toEqual([]);
    expect(set.entries).toHaveLength(91);
  });

  it("carry exactly the curated slugs", () => {
    const keys = [...set.byKey.keys()].sort();
    expect(keys).toEqual([...ITEM_KEYS, ...EFFECT_KEYS].sort());
    expect(Object.keys(CORE_ENTRY_IDS).sort()).toEqual(keys);
  });

  it("split into items and effects", () => {
    expect(set.entries.filter(isItem).map((e) => e.key).sort()).toEqual(ITEM_KEYS);
    expect(set.entries.filter(isEffect).map((e) => e.key).sort()).toEqual(EFFECT_KEYS);
  });

  it("keep the entry ids of the stage-1 keys they were renamed from", () => {
    for (const [slug, id] of Object.entries(KEPT_IDS)) {
      expect(`${slug}:${CORE_ENTRY_IDS[slug as keyof typeof CORE_ENTRY_IDS]}`).toBe(`${slug}:${id}`);
    }
  });

  it("have distinct entry and revision ids, the pack's own id among none of them", () => {
    const ids = CORE_DOCS.flatMap((d) => [d.entryId, d.revisionId]);
    expect(new Set(ids).size).toBe(182);
    expect(ids).not.toContain(CORE_PACK_ID);
    for (const record of CORE_DOCS) {
      const slug = record.doc.slug as keyof typeof CORE_ENTRY_IDS;
      expect(record.entryId).toBe(CORE_ENTRY_IDS[slug]);
      expect(record.revisionId).toBe(CORE_REVISIONS[slug].revisionId);
    }
  });

  it("are listed items first, then effects", () => {
    const kinds = CORE_DOCS.map((d) => d.doc.kind);
    expect(kinds).toEqual([...ITEM_KEYS.map(() => "item"), ...EFFECT_KEYS.map(() => "effect")]);
  });

  // Names live only in the documents — the dictionaries do not carry them —
  // so this is the one place a missing or duplicated name is caught.
  it.each(["ru", "en", "uk"] as const)("are named in %s, each entry differently", (locale) => {
    const names = set.entries.map((e) => e.names[locale]);
    for (const name of names) expect(name.trim().length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("core documents — generated rule text", () => {
  const text = (key: string) => set.byKey.get(key)!.ruleText;

  it.each([
    ["hex_scroll", "Use at any time on another player. Single use. The chosen player gets “Swamp”."],
    ["cleansing_salve", "Use at any time. Single use. Removes all your penalty effects."],
    ["speed_boots", "Use before your roll. Single use. You get “Tailwind”."],
    ["spare_die", "Use before your roll. Single use. You get “Lucky”."],
    ["lead_weights", "Use at any time on another player. Single use. The chosen player gets the item “Heavy Boots”."],
    ["jinx", "Use at any time on another player. Single use. The chosen player gets “Unlucky”."],
    ["swamp", "Your move is 1 cell shorter. Lasts 2 moves."],
    ["poison", "Your move is 1 cell shorter. Lasts until you pass 2 games."],
    ["ward", "When you land on a penalty cell, the cell does not fire. Works once."],
    ["heavy_boots", "Your move is 2 cells shorter. Lasts 1 roll."],
    ["unlucky", "If the game was passed, your dice have 2 fewer sides. Lasts 3 rolls."],
    ["toll", "When you land on a cell, you lose 1 point. Lasts 3 moves."],
    ["tailwind", "Your move is 2 cells longer. Lasts 1 move."],
    ["acceleration", "Your move is 1 cell longer. Lasts 2 moves."],
    ["lucky", "If the game was passed, your dice have 2 more sides. Lasts 2 rolls."],
    ["momentum", "When you pass a game, you gain 1 point. Lasts 3 rolls."],
    // Wave A.
    ["teleport", "Use at any time. Single use. You instantly move 3 cells forward."],
    ["portal_scroll", "Use at any time on a player ahead of you. Single use. You instantly move to the chosen player's cell."],
    ["swap_scroll", "Use at any time on a player ahead of you. Single use. You instantly swap places with the chosen player."],
    [
      "teleport_ring",
      "Use at any time on a player ahead of you. Single use. You instantly move to the cell right before the chosen player.",
    ],
    ["magnet", "Use before your roll on a player ahead of you. Single use. You get “Magnetic Pull”."],
    [
      "magnet_pull",
      "If the game was passed and your roll is lower than the chosen player's last roll, your move is 2 cells longer. Lasts 1 roll.",
    ],
    ["hook", "Use at any time on another player. Single use. The chosen player instantly moves 2 cells back."],
    [
      "time_stone",
      "Use at any time on another player. Single use. The chosen player instantly returns to the cell their last move started from.",
    ],
    ["fate_dice", "Use before your roll. Single use. You get “Roll of Fate”."],
    [
      "fate_roll",
      "If the game was passed, you roll 1 more die. If the game was passed and the dice show 4 or less, you do not move. Lasts until your next game is resolved.",
    ],
    [
      "chaos_die",
      "Use at any time. Single use. You instantly move by a d20 roll: 1 → 5 back, 2–5 → 2 back, 6–10 → stay put, 11–15 → 2 forward, 16–19 → 4 forward, 20 → 8 forward.",
    ],
    ["purifying_amulet", "Use at any time. Single use. Removes one of your penalty effects or cursed items of your choice."],
    ["fortune", "If the game was passed, a die showing 1 is thrown again once. Lasts 1 roll."],
    ["fast_track", "If the game was passed, the dice are thrown twice and the better throw counts. Lasts until you pass 1 game."],
    [
      "cursed_boots",
      "Cursed: it cannot be used and works by itself. If the game was passed, the dice result is 2 lower (never below 1). Works once, then it is gone.",
    ],
    [
      "cursed_die",
      "Cursed: it cannot be used and works by itself. If the game was passed, the dice are thrown twice and the worse throw counts. Works once, then it is gone.",
    ],
    [
      "broken_compass",
      "Cursed: it cannot be used and works by itself. If the game was passed, the lower half of the dice range moves you back by the result, the upper half forward. Works once, then it is gone.",
    ],
    ["back_teleport", "You instantly move 1–3 cells back."],
    [
      "burden",
      "If the game was passed, the dice result is lower by 1 for each item you hold (never below 1). Lasts until your next game is resolved.",
    ],
    ["misfortune", "If the game was passed, a die showing 6 is thrown again once. Lasts 1 roll."],
    ["lost_time", "If the game was passed, you do not move. Lasts until you pass 1 game."],
    ["misfired_portal", "You instantly move 1–5 cells back."],
    ["pursuit", "The nearest rival behind you instantly halves the gap to you."],
    ["castling", "You instantly swap places with the nearest rival behind you."],
    // Wave C.
    ["genre_veto", "Use at any time, picking a genre. Single use. You get “Vetoed Genre”."],
    [
      "vetoed_genre",
      "When a game is picked for you, games of the genre you picked cannot come up. Lasts until your next game is resolved.",
    ],
    ["favourite", "Use at any time, picking a game. Single use. You get “Favoured Game”."],
    [
      "favoured_game",
      "When a game is picked for you, the game you picked is three times as likely to come up. Lasts until your next game is resolved.",
    ],
    ["era_pick", "Use at any time, picking a span of release years. Single use. You get “Chosen Era”."],
    [
      "behind_doors",
      "When a game is picked for you, the draw offers 3 games and you take one. Lasts until your next game is resolved.",
    ],
    [
      "game_reroll",
      "Use while your game is in progress. Single use. Your game in progress is replaced by a new one, without a judge and without spending the season's rerolls.",
    ],
    [
      "postponed_game",
      "Use while your game is in progress. Single use. Your game in progress is set aside and comes back as your game 2 rolls later; a new game is picked now.",
    ],
    // It waits for the first game that would get conditions (the owner's call at the wave C gate).
    ["immunity", "Your games get no completion conditions. Works once."],
    [
      "hard_mode",
      "When you get a game, the game gets a completion condition: “Play on Normal difficulty or higher”. Lasts until your next game is resolved.",
    ],
    [
      "genre_trial",
      "When a game is picked for you, games sharing a genre with the last game you passed cannot come up. Lasts until your next game is resolved.",
    ],
    [
      "old_hardware",
      "When a game is picked for you, only games released in 2009 or earlier can come up. Lasts until your next game is resolved.",
    ],
    [
      "uncharted_territory",
      "When a game is picked for you, games of a genre you have passed a game in this season cannot come up. Lasts until your next game is resolved.",
    ],
    // Wave D: an object acts on whoever enters its cell — "the player who entered", never "you".
    [
      "mine",
      "Use at any time, picking a cell. Single use. The item stands on the chosen cell. When a move passes through or ends on its cell, the move stops there without a landing and the player who entered is thrown 2 cells back.",
    ],
    [
      "spring",
      "Use at any time, picking a cell. Single use. The item stands on the chosen cell. When a move passes through or ends on its cell, the move goes 2 cells further.",
    ],
    [
      "snare",
      "Use at any time, picking a cell. Single use. The item stands on the chosen cell. When a move passes through or ends on its cell, the move stops there without a landing and the penalty wheel spins instead of the cell.",
    ],
    [
      "crown",
      "Works while you hold it. If the game was passed, the dice result is 1 higher. When a rival's move ends on your cell, the rival who arrived takes this item. There is one in the season.",
    ],
  ])("%s reads in English: %s", (key, en) => {
    expect(text(key).en).toBe(en);
  });

  it.each([
    ["hex_scroll", "Применяется в любой момент на другого игрока. Одно использование. Выбранный игрок получает «Болото»."],
    ["cleansing_salve", "Применяется в любой момент. Одно использование. Снимает все ваши штрафные эффекты."],
    ["ward", "Когда вы встаёте на штрафную клетку, клетка не срабатывает. Срабатывает 1 раз."],
    ["toll", "Когда вы встаёте на клетку, вы теряете 1 очко. Действует 3 хода."],
    ["poison", "Ваш ход короче на 1 клетку. Действует, пока вы не пройдёте 2 игры."],
    ["momentum", "Когда вы проходите игру, вы получаете 1 очко. Действует 3 броска."],
    ["unlucky", "Если игра пройдена, у ваших кубиков на 2 грани меньше. Действует 3 броска."],
    ["lead_weights", "Применяется в любой момент на другого игрока. Одно использование. Выбранный игрок получает предмет «Тяжёлые ботинки»."],
    [
      "broken_compass",
      "Проклятый: его нельзя использовать, он действует сам. Если игра пройдена, нижняя половина значений кубиков ведёт вас назад на выпавшее число, верхняя — вперёд. Срабатывает один раз и исчезает.",
    ],
    [
      "purifying_amulet",
      "Применяется в любой момент. Одно использование. Снимает на ваш выбор один ваш штрафной эффект или проклятый предмет.",
    ],
    ["pursuit", "Ближайший соперник позади вас мгновенно сокращает отставание от вас вдвое."],
    ["genre_pick", "Применяется в любой момент, с выбором жанра. Одно использование. Вы получаете «Избранный жанр»."],
    [
      "chosen_genre",
      "Когда вам выбирается игра, выпадают только игры выбранного вами жанра. Действует до конца вашей следующей игры.",
    ],
    ["pick_of_two", "Когда вам выбирается игра, выпадают 2 игры на выбор — вы берёте одну. Действует до конца вашей следующей игры."],
    [
      "no_guides",
      "Когда вы получаете игру, игре добавляется условие прохождения: «Без прохождений, вики и подсказок — технические фиксы разрешены». Действует до конца вашей следующей игры.",
    ],
    [
      "mine",
      "Применяется в любой момент, с выбором клетки. Одно использование. Предмет встаёт на выбранную клетку. Когда чей-то ход проходит через его клетку или заканчивается на ней, ход останавливается на ней без срабатывания клетки и вошедшего игрока отбрасывает на 2 клетки назад.",
    ],
    [
      "crown",
      "Действует, пока предмет у вас. Если игра пройдена, результат кубиков на 1 больше. Когда ход соперника заканчивается на вашей клетке, пришедший соперник забирает этот предмет. В сезоне такой предмет один.",
    ],
  ])("%s reads in Russian", (key, ru) => {
    expect(text(key).ru).toBe(ru);
  });

  it.each([
    ["swamp", "Ваш хід коротший на 1 клітинку. Діє 2 ходи."],
    ["acceleration", "Ваш хід довший на 1 клітинку. Діє 2 ходи."],
    ["poison", "Ваш хід коротший на 1 клітинку. Діє, доки ви не пройдете 2 гри."],
    ["spare_die", "Застосовується до кидка. Одне використання. Ви отримуєте «Везіння»."],
    ["lucky", "Якщо гру пройдено, у ваших кубиків на 2 грані більше. Діє 2 кидки."],
    ["magnet", "Застосовується до кидка на гравця попереду вас. Одне використання. Ви отримуєте «Притягання»."],
    ["castling", "Ви миттєво міняєтеся місцями з найближчим суперником позаду."],
    ["second_chance", "Застосовується будь-коли. Одне використання. Ви отримуєте «Вибір із двох»."],
    [
      "chosen_era",
      "Коли вам обирається гра, випадають лише ігри обраних вами років випуску. Діє до кінця вашої наступної гри.",
    ],
    [
      "clean_start",
      "Коли ви отримуєте гру, грі додається умова проходження: «Почати з нового збереження». Діє до кінця вашої наступної гри.",
    ],
    [
      "snare",
      "Застосовується будь-коли, з вибором клітинки. Одне використання. Предмет стає на обрану клітинку. Коли чийсь хід проходить через його клітинку або закінчується на ній, хід зупиняється на ній без спрацювання клітинки і замість клітинки крутиться штрафне колесо.",
    ],
    [
      "spring",
      "Застосовується будь-коли, з вибором клітинки. Одне використання. Предмет стає на обрану клітинку. Коли чийсь хід проходить через його клітинку або закінчується на ній, хід триває ще на 2 клітинки.",
    ],
  ])("%s reads in Ukrainian", (key, uk) => {
    expect(text(key).uk).toBe(uk);
  });
});
