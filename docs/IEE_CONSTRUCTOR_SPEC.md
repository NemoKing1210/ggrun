# IEE constructor — specification v1

> **Status: approved 2026-10-06** — all twelve design questions are decided (§1).
> This file is **normative**: code that disagrees with it is a bug, and a change
> of behaviour starts with an edit here. Rationale, alternatives and the
> discussion live in the design document (Russian, Claude Doc):
> <https://claude.ai/code/artifact/91a74438-7eaa-49a6-ac38-8bb386955daa>.
> Delivery order and acceptance gates: [`IEE_CONSTRUCTOR_PLAN.md`](./IEE_CONSTRUCTOR_PLAN.md);
> progress: [`IEE_CONSTRUCTOR_LOG.md`](./IEE_CONSTRUCTOR_LOG.md).
>
> Supersedes [`ITEMS_EFFECTS_EVENTS.md`](./ITEMS_EFFECTS_EVENTS.md) §2.1 (the
> verdict against a constructor) and its storage sections §3–§5 wherever they
> disagree. Events — the third entity of that document — are out of scope and
> unchanged.

---

## 0. In one paragraph

Items and effects stop being TypeScript and become **data**: an entry is a card
plus rules *"when → if → do"* written **only** with primitives from a closed
vocabulary that stays code (each primitive = Zod schema + pure function +
ru/en/uk text template + power cost). There are no formulas, loops, variables or
scripts; a missing mechanic is a new primitive with tests. Entries live in
**packs**; publishing an entry creates an immutable **revision**; a season pins
revisions in its **catalog**; the game references revisions and never copies
them. All IEE state is written by **one executor**, and every change carries its
cause in a **journal**.

---

## 1. Decisions

| # | Decision |
| --- | --- |
| D1 | Only `admin` creates and edits packs and entries. Staff (`admin`, `judge`) keep the season wizard, as today. |
| D2 | Packs move between installations as `.ggpack` files (§11). The system pack `core` ships as one. |
| D3 | Penalty items are **cursed items** (§7.5). |
| D4 | A **reaction window** opens after the dice, only for holders of after-dice items (§7.4). |
| D5 | In «Налог», «Перегруз» and «Проклятие жадности» the **victim chooses**, with a minimal-loss default (§7.6). |
| D6 | **Out-of-turn moves** change position only (§7.3). |
| D7 | **Board objects** trigger when a regular move passes or stops on their cell (§7.7). |
| D8 | «Охотник» is replaced by «Погоня» (§13). |
| D9 | One field, `character` (`bonus` \| `penalty` *for the recipient*), decides the drop pool; harm to a target is a property of the **action**, not of the entry (§7.8). |
| D10 | Waves are delivered in the order A → B → C → D. |
| D11 | At runtime entries are referenced by **revision UUID**; `slug` is for URLs, files and search; no aliases. Exports keep entry UUIDs. Entry-to-entry references point at the **entry** and resolve through the season catalog (§10.3). |
| D12 | The starter set (§13, 83 entries) is the base content. |
| — | Default drop weight by rarity: `common` 100, `rare` 40, `epic` 15, `legendary` 5 (unchanged `RARITY_WEIGHT`). |

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| **entry** | An item or an effect: card + rules. |
| **item** | An entry that sits in a player's inventory. `active` (used by the holder), `passive` (works while held) or `cursed` (fires by itself, cannot be used). |
| **effect** | An entry applied to a player for a duration. |
| **pack** | A named set of entries with an icon and dependencies. `core` is the system pack. |
| **draft** | The editable JSON of an entry. Never played. |
| **revision** | An immutable, numbered, hashed snapshot of a draft. The only thing a season can play. |
| **season catalog** | Rows that attach revisions to a season, with per-season tuning. |
| **instance** | One live thing in a season: a held item, an applied effect, an object on a cell, a condition on a game roll. |
| **holder** | What an instance belongs to: a player, a board cell or a game roll. |
| **executor** | The only code that writes instances, decisions and journal rows. |
| **journal** | Append-only log of every IEE change with its cause. The feed and the admin turn trace are projections of it. |
| **decision** | A pause that waits for a player (reaction window, victim choice). |
| **character** | `bonus` or `penalty` *for whoever receives the entry*. «Свиток порчи» is a bonus: getting it is a reward, though it hurts a rival. |
| **pool** | Which wheel an entry drops from. Defaults to `character`; a season may move an entry. |
| **regular move** | The move a player earns by passing or dropping a game (dice → steps). |
| **out-of-turn move** | A position change caused by an item or effect. |
| **tier / pierce** | Protection strength (1 ordinary, 2 reinforced) vs. the pierce value of an incoming action (default 0). Protection works when `tier > pierce`. |

---

## 3. Architecture

Unchanged: the turn flow and the hook reducer (`reduceHookPatches`), the wheel
selection with weights and gates, use guards, the `event_log` feed, the ledger,
global events, the files module. Three things change:

1. **Definitions move from code to the database.** `lib/engine/iee/items/*`,
   `lib/engine/iee/effects/*` and the static `ITEMS`/`EFFECTS` registries are
   removed after parity. New: `lib/engine/iee/dsl/` (vocabulary, compiler, text,
   checks, upgraders), `lib/modules/iee/library/`, `lib/modules/iee/registry/`.
2. **One executor writes all IEE state.** `lib/modules/game/service/grant.ts`
   and `lib/modules/iee/repository/{inventory,effects}.ts` are replaced by
   `lib/modules/iee/executor/`. Today six places write state (wheel, item use,
   global events, admin intervention, expiry, season reset).
3. **The roll becomes a pipeline that can pause.** `resolveMovement` is split
   into the seven steps of §7.2; decisions live in `lib/modules/iee/decisions/`.

Layer rules (AGENTS.md §2) hold: the vocabulary, compiler, dice pipeline and
interception are pure (`lib/engine/`); persistence, registry and executor are
in `lib/modules/iee/`. The design document's section «Что меняется в
архитектуре» lists every affected file with its stage.

---

## 4. Data model

PostgreSQL via Drizzle, schema in `db/schema/iee.ts`. The project is not
deployed: there is **no data migration** — old tables are dropped, seeds are
re-created.

### 4.1 Enums

| Enum | Values |
| --- | --- |
| `iee_entry_kind` | `item`, `effect` |
| `iee_character` | `bonus`, `penalty` |
| `iee_rarity` | `common`, `rare`, `epic`, `legendary` |
| `iee_pack_visibility` | `draft`, `library` |
| `iee_instance_kind` | `item`, `effect`, `board_object`, `roll_condition` |
| `iee_holder_kind` | `player`, `cell`, `roll` |
| `iee_instance_status` | `active`, `ended` |
| `iee_end_reason` | `used`, `expired`, `triggered`, `cleansed`, `removed`, `stolen`, `transferred`, `discarded`, `burned`, `replaced`, `revoked`, `reset` |
| `iee_duration_unit` | `rolls`, `moves`, `passed_games`, `triggers`, `next_game`, `permanent` |
| `iee_decision_kind` | `reaction_window`, `victim_choice`, `game_choice` (wave C, §7.12) |
| `iee_decision_status` | `pending`, `resolved` (the player chose), `judged` (a judge chose for them), `defaulted` |
| `iee_visibility` | `public`, `holder`, `staff` |

Dropped: `iee_item_state`, `iee_effect_state`.

### 4.2 Definitions

**`iee_packs`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | kept across installs (exports) |
| `slug` | `text` unique | `[a-z0-9_]{2,48}`, free to change |
| `names` | `jsonb` | `{ ru, en?, uk? }` |
| `description` | `jsonb` | localized, optional |
| `icon_file_id` | `uuid` → `files.id` | nullable, `ON DELETE SET NULL` |
| `visibility` | `iee_pack_visibility` | `draft` hides it from the season wizard |
| `default_locale` | `text` | `ru` \| `en` \| `uk` |
| `is_system` | `boolean` | `true` only for `core` |
| `capabilities` | `text[]` | engine capabilities the pack needs (e.g. `board_objects`) |
| `min_dsl_version` | `integer` | default `1` |
| `created_by` | `uuid` → `users.id` | |
| `created_at`, `updated_at`, `archived_at` | `timestamptz` | archive instead of delete |

**`iee_pack_dependencies`** — `pack_id` → `iee_packs.id` (cascade),
`depends_on_pack_id` → `iee_packs.id` (restrict); pk on both. Maintained by the
library from the references inside drafts; never edited by hand.

**`iee_entries`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | kept across installs |
| `pack_id` | `uuid` → `iee_packs.id` | `RESTRICT` |
| `slug` | `text` | unique per pack |
| `kind` | `iee_entry_kind` | immutable after the first publish |
| `draft` | `jsonb` | an `EntryDoc` (§5), may be invalid while edited |
| `icon_file_id` | `uuid` → `files.id` | nullable |
| `latest_revision_id` | `uuid` | denormalised convenience, nullable |
| `created_by`, `created_at`, `updated_at`, `archived_at` | | |

**`iee_entry_revisions`** — insert-only (no `UPDATE`/`DELETE` path exists in
code; an architecture test enforces it).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | the runtime reference (D11); UUID v5 of `entry_id` and `content_hash`, so the same content has the same id on every installation (§11) |
| `entry_id` | `uuid` → `iee_entries.id` | `RESTRICT` |
| `number` | `integer` | 1, 2, … per entry; unique `(entry_id, number)`; local to the installation |
| `doc` | `jsonb` | validated `EntryDoc`, including scenarios |
| `dsl_version` | `integer` | version the doc was written against |
| `content_hash` | `text` | sha-256 of the canonical JSON of `doc`; unique `(entry_id, content_hash)` — publishing or importing the same content twice is a no-op |
| `created_by`, `created_at` | | |

**`season_catalog`** — replaces `seasons.config.iee.entries`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `season_id` | `uuid` → `seasons.id` | cascade |
| `entry_id` | `uuid` → `iee_entries.id` | restrict; unique `(season_id, entry_id)` — one revision per entry per season |
| `revision_id` | `uuid` → `iee_entry_revisions.id` | **`RESTRICT`** — a pinned revision cannot be deleted |
| `enabled` | `boolean` | default `true` |
| `pool` | `iee_character` | default = the revision's `character` |
| `rarity` | `iee_rarity` | nullable override |
| `weight` | `integer` | default from rarity |
| `max_per_season`, `max_per_player` | `integer` null | |
| `cooldown_rolls`, `min_position`, `unlock_after_move` | `integer` | as today's `IeeEntryConfig` |
| `param_overrides` | `jsonb` | keyed by declared parameter (§5.4) |
| `duration_override` | `integer` null | |
| `target_override` | `text` null | `self` \| `other` \| `any` \| `none` |
| `created_at`, `updated_at` | | |

Switching a season to a newer revision is an explicit staff action with a diff;
in an active season it affects future grants only (rule G2-a). Instances keep
the revision they were granted with.

What a catalog holds (checked on every save, `lib/modules/iee/catalog/normalize.ts`):

- `enabled` means "drops from the wheel". A row with `enabled = false` is
  attached all the same: it plays when something hands it out (an item's rule,
  a challenge reward) and never drops.
- Attaching an entry attaches, disabled, what its pinned revision references
  (§10.3), transitively, at their latest revisions. So do the keys the
  season's challenges reward and the references of every revision the
  season's live instances hold — an instance granted before a switch must keep
  compiling.
- An entry whose pack is archived, or not in the library (`draft`), cannot be
  attached anew; one the season already plays stays, and so does a dependency
  that live instances need.
- Keys are unique in a season (two packs may share one).
- The wizard saves the catalog with the settings, in one transaction; the
  audit row `season_catalog_updated` lists, by key, what was attached,
  detached, switched to another revision, retuned, and attached as a
  dependency by the server.

### 4.3 Runtime state

**`iee_instances`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `season_id` | `uuid` → `seasons.id` | cascade |
| `entry_id` | `uuid` → `iee_entries.id` | restrict; limits and stacking count per **entry** (the foreign key arrives with the library in stage 2) |
| `revision_id` | `uuid` → `iee_entry_revisions.id` | **`RESTRICT`** (likewise from stage 2) |
| `kind` | `iee_instance_kind` | |
| `holder_kind` | `iee_holder_kind` | |
| `holder_player_id` | `uuid` → `season_players.id` | cascade; set when `holder_kind = player` |
| `holder_cell_index` | `integer` | set when `holder_kind = cell` |
| `holder_roll_id` | `uuid` → `game_rolls.id` | cascade; set when `holder_kind = roll` |
| `owner_player_id` | `uuid` → `season_players.id` | who cast or placed it; nullable |
| `aimed_player_id` | `uuid` → `season_players.id` null | the player the item that handed this effect to its user was aimed at — whom its rules read as the chosen player at the turn's hooks (wave A, §6.11); set null when they leave |
| `chosen` | `jsonb` null | what the use that handed this effect to its user picked (wave C, §6.16): `{ genre }`, `{ years: [from, to] }` or `{ gameId, title }`; what `"picked"` reads at `beforeGameRoll`. Null when nothing was picked |
| `params` | `jsonb` | parameter snapshot at grant (overrides applied); a `roll_condition`'s text instead — `{ ru, en?, uk? }` (§6.17) |
| `charges_left` | `integer` null | |
| `remaining` | `integer` null | with `remaining_unit` |
| `remaining_unit` | `iee_duration_unit` null | |
| `anchor_roll_seq` | `integer` null | the holder's roll counter the instance counts from: it takes part in the holder's rolls after this one — a status granted while the holder has a game in flight starts after that game (SC-HEXSCROLL-7) |
| `count_from_roll_seq` | `integer` null | where the counter counts from once a `refresh` renewed it (§7.10): it goes down only on the holder's rolls after this one, while the rules keep taking part from `anchor_roll_seq`; null = the anchor |
| `status` | `iee_instance_status` | `active` = in force (counters are eager) |
| `end_reason` | `iee_end_reason` null | |
| `source` | `text` | `cell_bonus`, `cell_penalty`, `item:<instanceId>`, `event:<id>`, `admin`, `seed`, … |
| `source_move_id` | `uuid` → `moves.id` null | the move that produced it (wheel drops); `set null` |
| `cause_journal_id` | `bigint` → `iee_journal.id` | the journal row that created it |
| `granted_roll_seq` | `integer` | season clock at grant |
| `granted_at`, `ended_at` | `timestamptz` | |

Check constraints: exactly one holder column is set and it matches
`holder_kind`; an `ended` instance has an `end_reason` and an active one has
none. Indexes: `(season_id, holder_player_id, status)`,
`(season_id, entry_id, status)`, partial `(season_id, holder_cell_index) WHERE
status = 'active'`, partial `(holder_roll_id) WHERE holder_roll_id IS NOT
NULL` (wave C, migration `0028`: a roll's conditions, read and ended with it). `stack` keeps one instance per grant (§7.10), so there is
no stack counter.

**`iee_decisions`** — a pause that waits for a player (§7.4, §7.6); written by
the executor only.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `season_id` | `uuid` → `seasons.id` | cascade |
| `player_id` | `uuid` → `season_players.id` | who decides; cascade |
| `kind` | `iee_decision_kind` | |
| `status` | `iee_decision_status` | at most one `pending` of each kind per player (partial unique index) |
| `instance_id`, `revision_id` | `uuid` null | the instance whose rule asked, and its revision — no foreign key, as in the journal |
| `rule_index` | `integer` null | which rule of the revision asked |
| `options` | `jsonb` | `[{ id, kind, params }]` — what was offered: `discard`, `endure`, `retain` (§7.6), `accept`, `react` (§7.4), `take` — one of the games offered, its `among` (§7.12) |
| `default_choice` | `jsonb` | `{ option, picks? }` — what the default would be when asked; recomputed when it is applied |
| `context` | `jsonb` | what the decision needs to be carried out: the entry that asked, the default's rule, whether the feed shows it; for a reaction window the turn it holds — the roll and how it was reported, the throw shown, the move projected and the server draws made so far (§7.4); for a game choice how the pick came about — a roll, a reroll (the roll it replaced, the item that rerolled it) — and the games offered as they were (§7.12) |
| `choice` | `jsonb` null | `{ option, picks? }` — what was decided |
| `resolved_by_user_id` | `uuid` → `users.id` null | the player, or the judge who chose for them; null when defaulted |
| `cause_journal_id` | `bigint` → `iee_journal.id` null | the `decision_open` row; `set null` |
| `created_at`, `resolved_at` | `timestamptz` | |

Index `(season_id, status)`.

**`iee_journal`** — append-only.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigserial` pk | global order |
| `season_id` | `uuid` → `seasons.id` | cascade |
| `turn_seq` | `integer` null | the season roll counter at the time |
| `op` | `text` | §9.2 |
| `actor_player_id`, `target_player_id` | `uuid` null | |
| `actor_user_id` | `uuid` null | staff for admin operations |
| `instance_id`, `revision_id` | `uuid` null | no foreign key: history outlives what it describes |
| `rule_index` | `integer` null | which rule of the revision fired |
| `intent` | `jsonb` | what was asked |
| `outcome` | `jsonb` | what happened (incl. `blocked`, `reflected`, `noop`) |
| `rng` | `jsonb` null | every server random draw used |
| `cause_id` | `bigint` → `iee_journal.id` null | the row this one follows from |
| `visibility` | `iee_visibility` | |
| `created_at` | `timestamptz` | |

Index `(season_id, id)`, `(season_id, turn_seq)`.

### 4.4 Kept and dropped

- **Kept:** `event_log` (the public feed; IEE rows are projected from the
  journal, §9.3), `ledger_entries` (balance), `season_players` (position,
  `roll_seq`, counters), `event_templates` / `player_events` (global events),
  `files`.
- **Dropped:** `player_inventory`, `player_effects`, their enums, and
  `seasons.config.iee.entries`.
- **Changed (wave C):** `game_rolls.postponed_until_seq` (`integer` null) — on
  a roll whose game its player set aside (`postponeGame`, §6.16): the player's
  roll counter (`season_players.roll_seq`) at which the game comes back — the
  counter when it was set aside, plus `afterRolls − 1`; null once it has come
  back (or will not: a blacklisted game), and on every other roll.

### 4.5 `seasons.config.iee` after the change

Kept: `enabled`, `inventorySize` (counts **bonus items only**),
`allowTargetingOthers`, `pvpProtectionMoves`, `revealDropsInFeed`,
`nothingWeight`, `catchUp`, `events`. Removed: `entries`. Added (all optional,
`null` = no limit):

| Field | Meaning |
| --- | --- |
| `maxActiveEffectsPerPlayer` | cap on active effects per player |
| `tagLimits` | `Record<tag, number>` — active instances per player with that tag |
| `disabledTags` | tags removed from the season entirely (e.g. `game_condition`) |
| `powerCeiling` | maximum power of an attached revision (warning in the wizard) |
| `boardObjectsPerPlayer` | default `2` (§7.7) |

The limits hold whoever hands an entry out. The wheel's gates keep an entry
that would break one off the wheel (`disabled_tag`, `effect_limit`,
`tag_limit`); the executor refuses a grant from any source that would break
one (`blocked_limit`, journaled as a no-op with its reason), so an item's rule
or a challenge reward cannot get around them. A disabled tag removes the entry
outright. The two caps count active instances, so they never stop a `refresh`
effect the player already holds — refreshing adds none.

---

## 5. The entry document (DSL v1)

### 5.1 Shape

```ts
type Locale = "ru" | "en" | "uk";
type Localized = { ru: string; en?: string; uk?: string };

interface EntryDoc {
  dslVersion: 1;
  kind: "item" | "effect";
  slug: string;                       // [a-z0-9_]{2,48}, unique per pack
  name: Localized;
  flavor?: Localized;                 // hand-written; rule text is generated
  character: "bonus" | "penalty";
  rarity: "common" | "rare" | "epic" | "legendary";
  tags: string[];                     // §6.6
  glyph?: string;                     // Heroicon name for the icon fallback (§12); one of IEE_GLYPHS
  params?: Record<string, ParamDecl>; // season-overridable values
  usage?: UsageDoc;                   // items only
  duration?: DurationDoc;             // effects only
  stacking?: StackingDoc;             // effects only
  protection?: { tier: 1 | 2 };       // entries that block or reflect (wave B, §6.13): 1 unless set
  rules: RuleDoc[];
  scenarios?: ScenarioDoc[];          // §5.5 — what the entry promises, run on publish
}

interface ParamDecl { type: "int" | "bool" | "enum"; default: number | boolean | string;
                      min?: number; max?: number; values?: string[] }

interface UsageDoc {
  activation: "active" | "passive" | "cursed";
  window?: "anytime" | "before_roll" | "after_dice" | "on_open_roll"; // active only
  target?: { who: "self" | "other" | "any" | "none";                  // active only
             filter?: "ahead" | "behind" | "nearest_ahead" | "nearest_behind" | "leader" };
                                      // filter: only with who "other" or "any" (§6.10)
  charges?: number;                   // 1–99. Active: uses (required). Passive: firings before it
                                      // vanishes — none: it stays while held. Cursed: firings
                                      // before it vanishes (required, usually 1)
  pick?: "genre" | "years" | "game" | "cell"; // what the user picks on use (wave C, §6.16; a cell —
                                      // where the item places itself — wave D, §6.18); a removal's
                                      // choice is the action's own (`remove`, §6.10)
  unique?: boolean | "season";        // at most one per holder; cursed items are always unique;
                                      // "season": one in the whole season (wave D, §6.19)
}

interface DurationDoc {
  unit: "instant" | "rolls" | "moves" | "passed_games" | "triggers" | "next_game" | "permanent";
  count?: number;                     // required for rolls, moves, passed_games, triggers; none for next_game
}

interface StackingDoc { mode: "unique" | "refresh" | "stack"; maxStacks?: number; group?: string }

interface RuleDoc {
  when: string;                       // a trigger, §6.1
  if?: ConditionDoc[];                // AND
  do: ActionDoc[];                    // executed in order, at most 8 (§7.10)
  priority?: "early" | "normal" | "late"; // 50 / 100 / 200
}

type ConditionDoc = { op: string } & Record<string, unknown>;
type ActionDoc    = { op: string } & Record<string, unknown>;
type ValueDoc = number | { param: string } | { random: [number, number] }
              | { table: { die: number; rows: { upTo: number; value: number }[] } }
              | { source: string } & Record<string, unknown>;      // §6.5
type EntryRef = { entry: string /* entry uuid */; slug?: string /* readability only */ };
```

`params` are the only season-tunable values: a number in a rule may be written
as `{ "param": "steps" }` and the season catalog's `param_overrides.steps`
replaces the default. Unknown keys in `param_overrides` are rejected. Numbers
are **signed**: a penalty that shortens a move declares `steps` with
`default: -1, min: -6, max: -1`, and the bounds keep a season from turning it
into a bonus. An override that breaks its declaration (unknown name, wrong
type, out of range, not one of `values`) is not applied: the default stays and
the problem is reported to staff — a typo in a season's tuning must neither
change what an entry does nor fail a turn.

`stacking` defaults to `{ "mode": "refresh" }` when an effect omits it.

### 5.2 Validation

Every document is validated twice: on publish (and import), and when the
registry loads it. A document that fails at load time disables its entry for
the season and writes a staff-visible `compile_failed` journal row; the turn
continues (the same tolerance `runHook` has today for removed keys).

### 5.3 Evolution

Each revision stores `dsl_version`. Additive vocabulary changes (a new
primitive, a new optional parameter) need nothing. A breaking change ships an
**upgrader** `vN → vN+1` in `lib/engine/iee/dsl/upgrade.ts`, applied when the
registry loads an older document; entry scenarios are re-run. Stored revisions
are never rewritten.

### 5.4 Examples

```json
{
  "dslVersion": 1, "kind": "effect", "slug": "swamp",
  "name": { "ru": "Болото", "en": "Swamp" },
  "character": "penalty", "rarity": "common", "tags": ["movement"],
  "params": { "steps": { "type": "int", "default": -1, "min": -6, "max": -1 } },
  "duration": { "unit": "moves", "count": 2 },
  "stacking": { "mode": "refresh" },
  "rules": [
    { "when": "afterMovement", "do": [{ "op": "steps", "delta": { "param": "steps" } }] }
  ]
}
```

```json
{
  "dslVersion": 1, "kind": "item", "slug": "swap_scroll",
  "name": { "ru": "Свиток обмена", "en": "Scroll of Exchange" },
  "character": "bonus", "rarity": "legendary", "tags": ["movement", "directed"],
  "usage": { "activation": "active", "window": "before_roll",
             "target": { "who": "other" }, "charges": 1 },
  "rules": [ { "when": "onUse", "do": [{ "op": "swapPositions", "with": "target" }] } ]
}
```

### 5.5 Entry scenarios

An entry's scenarios are what it promises, written as data — **Given / When /
Then** — and executed: publishing and importing run them, and a red one keeps
the entry a draft (§14). They are part of the document, so a revision carries
the proof of what it does, and its content hash covers it.

```ts
interface ScenarioDoc {
  id?: string;                        // [A-Z0-9][A-Z0-9-]{1,31}, unique in the entry ("SC-SWAMP-1")
  title: Localized;                   // the promise, as a consequence (≤ 120)
  note?: Localized;                   // why, when the expected result is not obvious
  given?: GivenDoc;
  steps: StepDoc[];                   // 1–12, run in order; each checks what it led to
}

type ScenarioEntry = "self" | EntryRef;  // "self" = the entry the scenario belongs to

interface GivenDoc {
  holder?: PlayerGiven;               // cell 10, 5 points
  rival?: PlayerGiven & { left?: boolean };  // cell 12, 5 points; `left`: out of the run
  sides?: number;                     // the season's dice, 2–20 (d6)
  loop?: boolean;                     // the board loops (it does not)
  draws?: "low" | "high";             // server draws: "low" (default) — every chance holds,
                                      // a range gives its low end; "high" — the opposite
}
interface PlayerGiven {
  position?: number;                  // 0–39
  balance?: number;                   // 0–99
  inFlight?: boolean;                 // a game rolled and not reported yet
  game?: ScenarioGame;                // that game, of the scenario pool (wave C) — in flight
  passed?: ScenarioGame[];            // ≤ 8: the games passed this season so far, oldest first
  lastRoll?: number;                  // 1–60: the dice sum of their last move — what «Магнит»
                                      // compares against (wave A, §6.11); none unless set
  carries?: { entry: ScenarioEntry; count?: number }[];  // ≤ 8, 1–4 copies each
}
type ScenarioGame = "starfall" | "old_keep" | "quiet_house" | "gear_run"
  | "tiny_planet" | "iron_tide" | "night_shift" | "sky_garden";  // the scenario pool (below)
type ScenarioPick = { genre: string } | { years: [number, number] } | { game: ScenarioGame };

type StepDoc =
  | { do: "roll"; by?: "holder" | "rival"; outcome: "passed" | "dropped";
      dice: number;                   // what the dice show in total
      then?: number[];                // faces drawn after that first throw, in order — the dice
                                      // thrown again, a second throw (§7.2); the last repeats
      cell?: CellType;                // the cell the move ends on, wherever that is (plain)
      react?: ScenarioEntry;          // in the reaction window: use the roller's newest of this
                                      // reaction item (wave B, §7.4); accept otherwise
      expect?: { moved?: number;      // cells travelled, signed, before the cell acts
                 diceCount?: number; diceSides?: number;
                 cellFires?: boolean; wheel?: "none" | "bonus" | "penalty";
                 wheelAgain?: "none" | "bonus" | "penalty";
                 window?: "none" | "accepted" | "used" } & StateExpect }
                                      // wheelAgain: the wheel a rule spins once more after
                                      // the landing's own (wave B, §6.12); none unless one asks;
                                      // window: whether a reaction window opened and how it
                                      // was answered (wave B, §7.4)
  | { do: "use"; item?: EntryRef;     // the entry itself unless named
      by?: "holder" | "rival";        // who uses it — the holder unless set (wave B, §6.13)
      on?: "rival" | "holder" | "nobody";  // default: the other player when the item may be aimed
                                           // at another (`other`, `any`), nobody otherwise
      choose?: ScenarioEntry;         // a pick of the holder's own: their newest of this entry (§6.10)
      chooseEntry?: ScenarioEntry;    // a pick from the season's catalog: this entry (wave B, §6.12)
      pick?: ScenarioPick;            // a pick for the next game (wave C, §6.16)
      take?: ScenarioGame;            // a choice of games the use opens: take this one (§7.12)
      expect?: { result?: "used" | "refused"; reason?: UseRefusal } & StateExpect }
  | { do: "draw"; by?: "holder" | "rival";  // the player's next game is picked, as rolling does (wave C, §7.12)
      take?: ScenarioGame;            // a choice it opens: take this one; it waits otherwise
      expect?: { result?: "drawn" | "choosing" | "refused"; reason?: DrawRefusal } & StateExpect }
  | { do: "grant"; entry: ScenarioEntry; to?: "holder" | "rival";
      via?: "wheel";                  // as the wheel hands it out: what the recipient's entries
                                      // do to what arrives applies (wave B, §6.13); as staff otherwise
      expect?: { result?: "granted" | "refreshed" | "refused" } & StateExpect }
  | { do: "decide"; by?: "holder" | "rival";  // who answers their pending victim choice (wave B, §7.6)
      option?: "discard" | "endure" | "retain";  // the default when none is named
      picks?: ScenarioEntry[];                  // the items picked: the newest held of each, in order
      expect?: { result?: "decided" | "refused" } & StateExpect };

interface StateExpect {
  holder?: { entry: ScenarioEntry; count: number }[];  // active instances after the step; 0 = none
  rival?: { entry: ScenarioEntry; count: number }[];
  balance?: number;                   // the holder's points, change during the step
  rivalBalance?: number;
  position?: number;                  // the cell each stands on after the step, 0–39 —
  rivalPosition?: number;             // where an out-of-turn move shows (§7.3)
  decision?: "pending" | "none";      // the holder's victim choice after the step (wave B, §7.6)
  game?: ScenarioGame | "none";       // the holder's game in flight after the step (wave C)
  offered?: number;                   // 0–5: the games the holder's pending choice offers (§7.12)
  conditions?: number;                // 0–8: the completion conditions the holder's game holds (§6.17)
}
type DrawRefusal = "gameAlreadyHaveRoll" | "ieeDecisionPending" | "catalogAllPlayed";
type UseRefusal = "ieeItemNotFound" | "ieeItemAlreadyUsed" | "ieeItemNotUsable"
  | "ieeItemWrongWindow" | "ieeTargetRequired" | "ieeTargetSelfNotAllowed"
  | "ieeTargetNotActive" | "ieeTargetingDisabled" | "ieeTargetProtected"
  | "ieeTargetAlreadyAffected" | "ieeTargetNotEligible"
  | "ieeChoiceRequired" | "ieeChoiceInvalid"              // wave A, §6.10
  | "ieeEntryChoiceRequired" | "ieeEntryChoiceInvalid"    // wave B, §6.12
  | "ieeItemsForbidden" | "ieeTargetUntargetable"         // wave B, §6.13
  | "ieeDecisionPending"                                  // wave B, §7.6
  | "ieeItemReactionOnly" | "ieeTargetReacting";          // wave B, §7.4 — the item path's own codes
```

**The scenario season** is fixed, so a scenario reads the same everywhere: a
40-cell board without a loop unless `loop` says otherwise; one die on a pass
and two on a drop, d6 unless `sides` says otherwise; no streak multiplier; points never ride on a roll;
other players may be targeted and nobody is protected; the wheel never hands
anything out — whether a landing would spin it is what `wheel` checks. Two
players: the **holder** (cell 10, 5 points, four rolls behind them) and a
**rival** (cell 12, 5 points, nine moves).

**The scenario pool** (wave C, §6.16) — the games a pick draws from, in this
order:

| Game | Genres | Released | Rating |
| --- | --- | --- | --- |
| `starfall` | action, shooter | 1993 | 3.0 |
| `old_keep` | rpg | 1997 | 4.0 |
| `quiet_house` | horror, adventure | 2001 | 3.5 |
| `gear_run` | racing | 2005 | 2.5 |
| `tiny_planet` | puzzle, platformer | 2009 | 4.5 |
| `iron_tide` | strategy | 2012 | 3.8 |
| `night_shift` | horror, action | 2016 | 4.2 |
| `sky_garden` | platformer, adventure | 2021 | 4.8 |

A pick takes, of the games the player has not had that their rules leave (or
all they have not had, when the rules leave none — `relaxed`), the first — a
favoured game ahead of the rest — with low draws, and the last with high
draws; a choice of `n` offers the first `n` (the last `n`). A use picks what
the pool offers the user: a genre of its games, a decade it has games from, a
game they have not had.

**What runs.** A scenario plays in a season kept in memory and written nowhere
(`lib/modules/iee/sim`), through the code a season runs: the engine's turn
(`playTurn`, §7.1), the holder's statuses at each hook, the executor (grants,
stacking, counters, charges, intents), the wheel's polarity, the item path's
guards and refusals. The entry under test plays its own document; every other
entry the scenario or the entry's rules name plays its latest revision — or the
draft published together with it.

- `carries` are in force before the first step, as if handed out at the end of
  the last roll; a `grant` step hands an entry out now, through the executor —
  it counts from the recipient's next roll, or the one after while they have a
  game in flight.
- A `roll` step is one whole turn of the player who rolls: the dice show
  `dice` between them (as evenly as the faces allow), the move ends on `cell`,
  and the turn settles — fired rules, charges, intents and counters. When the
  roller's reaction items offer something (§7.4), the window opens and is
  answered as the step says: `react` uses the roller's newest instance of that
  item if the window offers it, and accepts otherwise; a throw again draws its
  faces from `then`, after what step 3 drew.
- A `use` step uses the newest held instance of the item as the holder — or
  as the rival, with `by`; an item used up answers `ieeItemAlreadyUsed`, one
  never held `ieeItemNotFound`. A `grant` step hands out as staff do, past
  everything that answers what arrives — `via: "wheel"` hands out as a drop,
  which the recipient's entries may answer (§6.13).
- A `roll` step starts the player's next game first: a victim choice of
  theirs still waiting takes its default (§7.6). A `decide` step answers the
  holder's — or, with `by`, the rival's — pending victim choice as the
  dashboard does: the option named, or the default; `picks` names the items,
  the newest held instance of each. Nothing pending, an option not offered or
  picks that do not fit answer `refused`.
- A `draw` step picks the player's next game as rolling does (§7.12): a
  set-aside game that is due, or a draw from the scenario pool as their rules
  shape it — `drawn`; a choice their rules ask for opens and waits —
  `choosing` — unless `take` names one of the games it offers. A game in
  flight, a choice already waiting or nothing left to draw answer `refused`.
  A `roll` step reports the game in flight, if there is one: a pass adds it to
  the games the player has passed. A `use` step carries a pick for the next
  game (`pick`), and an item used on an open roll (`rerollGame`,
  `postponeGame`) picks the next game as the item path does — `take` answers a
  choice it opens. `game` and `offered` read the holder's game in flight and
  their pending choice after any step; `conditions`, how many completion
  conditions that game holds (§6.17) — given by the rules as a step assigns
  the game; a game given in flight was rolled before the scenario began and
  holds none.
- `objects` in Given (wave D, §6.18; at most 4) stand on the board before the
  first step — an item, its cell (0–39) and whose it is, the holder's unless
  `owner: "rival"` — as if their owners had placed them. The scenario board's
  cells are all plain, so any cell may hold one, but only one: a Given that
  puts two on a cell is broken (`object_cell`). A `use` step of an item that
  places itself carries the cell in `pick` (`{ cell }`); the check `objects`
  counts the objects standing after any step.
- Every expectation is checked after its step. A scenario is **green** when
  every step runs and every expectation holds. A step that cannot run — dice
  that cannot show the number, a player out of the run rolling, an entry the
  scenario names that is not there to play — is **broken**, and so is the
  scenario; the steps after it do not run.

**Checks before running** (§14): every entry a scenario names resolves the way a
reference does (§10.3) — `missing_ref` at its path; a `use` step uses an item —
`scenario_item`; ids are unique — `scenario_id_taken`. A season's registry does
not check scenarios: it plays rules, and a scenario may name an entry the season
does not attach.

**References.** What a scenario names is needed to *check* the entry, not to
*play* it: the pack depends on it (§10.3, §11), and attaching the entry to a
season does not attach it.

---

## 6. Vocabulary v1

Each primitive is code in `lib/engine/iee/dsl/` with: Zod schema of its
parameters, a pure implementation, a ru/en/uk text template, a power cost, and
unit tests for behaviour and text. **Stage** says when it lands. Names and
parameters marked *stage 1* are frozen by this spec; those of later waves are
provisional until their wave starts, and any change is made here first.

### 6.1 Triggers

| Trigger | Fires when | Stage |
| --- | --- | --- |
| `onUse` | an active item is used — a reaction item's in the reaction window, after the dice (§6.15) | 1 |
| `onApply`, `onExpire` | an effect is applied / ends | 1 |
| `beforeMovement` | before the dice: composition (count, sides) | 1 |
| `afterMovement` | steps computed (step modifiers) | 1 |
| `beforeCellEffect`, `afterCellEffect` | the landing cell resolves | 1 |
| `onOutcome` | the holder's game is passed or dropped | 1 |
| `onTick` | end of the holder's turn | 1 |
| `afterDice` | dice thrown, token not moved (rerolls, result modifiers, reactions) | A |
| `whileHeld` | not a `when` of its own: a passive or cursed item's rules use the turn hooks' triggers and act while it is held (§6.10) | A |
| `onPickup` | an item enters the holder's inventory, whatever its activation; run by the executor | A |
| `onIncoming` | something is about to reach the holder: a rival's harmful action, an entry — from a rival **or the wheel** — or a move back (§6.13) | B |
| `whileActive` | not a moment: its rules hold for as long as the effect lasts or the item is held — the use checks and the executor ask (§6.13) | B |
| `beforeGameRoll` | a game is about to be picked for the holder — their next game, a reroll, a game an item draws again; its rules shape the pool (§6.16, §7.12) | C |
| `onRollCreated` | a game is assigned to the holder — a new roll, a reroll, a game taken from a choice, a set-aside game come back; its rules add completion conditions (§6.17) | C |
| `onObjectEntered` | a regular move passes or stops on the object's cell | D |
| `onSameCell` | a rival ends a regular move on the holder's cell | D |

### 6.2 Conditions (all combined with AND)

| Condition | Parameters | Stage |
| --- | --- | --- |
| `outcome` | `is: "passed" \| "dropped"` | 1 |
| `cellType` | `in: string[]` | 1 |
| `chance` | `percent: 1..99` (server rng) | 1 |
| `hasEntry` | `tag?`, `entry?`, `character?`, `who: "self" \| "target"` | 1 |
| `diceShow` | `of: "sum" \| "any"`, `cmp: "eq" \| "lte" \| "gte"`, `value` (was `dice`: the action `dice` holds the name) | A |
| `rank` | `is: "leader" \| "last"` or `lte: n` (1–50) — the holder's place as the rule starts | A |
| `itemCount` | `cmp: "eq" \| "lte" \| "gte"`, `value`, `character?` — the items the holder has, of a character or all | A |
| `targetRelative` | `is: "ahead" \| "behind"` — where the chosen player stands | A |
| `compareLastRoll` | `mine: "next"`, `cmp: "lt" \| "gt"`, `theirs: "target"` — the holder's dice against the chosen player's last roll («Магнит») | A |
| `incoming` | `is: "harm" \| "entry" \| "moveBack"`, with `entry` `kind?` and `character?` — what is about to reach the holder (§6.13) | B |

### 6.3 Actions

Every action declares `harm: "none" | "target"` in code — harm to the target is
what protection and interception react to (D9).

| Group | Actions (`op`) | Stage |
| --- | --- | --- |
| Turn and balance | `steps` (± cells, signed), `dice` (count/sides ±), `balance` (± points, via the ledger), `skipCellEffect`, `noMove` | 1 |
| Effects | `grantEffect` (`entry`, `to: self\|target`), `grantItem` (`entry`, `to`), `cleanse` (`character?`, `tags?`, `count \| "all"`) | 1 |
| Roll | `resultModify` (`delta?`, `cap?`), `rerollOn` (`values`), `bestOfTwo`, `worstOfTwo`, `direction` (`lowerHalf: "back"`) — see §6.8; `outcomeTable` becomes a value source (§6.5), `skipTurn` waits for an entry that needs it | A |
| Out-of-turn movement | `move` (`by: Value`, `who?`), `moveToTarget` (`at: "cell" \| "before"`), `swapPositions` (`with: target \| nearestBehind`), `rollbackLastMove` (`who`), `halveGap` (`who: nearestBehind`) — see §6.9 | A |
| Cursed and passive items | `remove` (`what`, `character?`, `entry?`, `pick: choice \| newest \| random`, `count?`, `from?`) — was `removeItem`; planting is `grantItem` to the target (the provisional `plantItem` is not a primitive); rules of passive and cursed items at the turn hooks — see §6.10 | A |
| Item operations | `stealItem`, `transferItem`, `swapItems`, `copyItem`, `grantChosen`, `extraSpin` — see §6.12; a discard is `remove` (wave A), the victim's own pick of it arrives with the decisions; a transformation is `remove` (choice) and `grantChosen` in one rule | B |
| Protection | `block`, `reflect`, `amplify` (`factor`), `replace` (`with`), `untargetable`, `forbidItems`, `pierce` (`value`) — see §6.13 | B |
| Player decisions | `victimChoice` (`count`, `orKeep`), `holdLimit` (`max`) — see §6.14; reaction items (`window: "after_dice"`): `reroll`, and `bestOfTwo`, `rerollOn`, `resultModify` at their `onUse` — see §6.15 | B |
| Game pool | `poolExclude`, `poolRequire` (`genres`, `years`, `rating`), `poolFavor` (`factor`), `chooseOfN` (`n`), `rerollGame`, `postponeGame` (`afterRolls`); the user's pick on use (`usage.pick`) — see §6.16 | C |
| Completion conditions | `addCondition` (`text`), `conditionImmunity` — see §6.17 | C |
| Board | `placeObject` (the item itself, on the cell its user picks — `usage.pick: "cell"`), object effects `stopMove`, `push` (`delta`), `extend` (`delta`), `spinInstead` (`pool`) — see §6.18; `takeEntry` («Корона») — see §6.19 | D |

### 6.4 Durations

`instant` (no instance is kept), `rolls`, `moves` (regular moves only),
`passed_games` (dropped games do not count), `triggers` (each time a rule of the
instance fires), `next_game` (ends when the holder's next game is resolved,
passed or dropped — one game, so it takes no count and a season does not tune
it; wave A), `permanent`. See §7.9 for when each counts down.

An **instant** effect acts once, as it arrives, and keeps nothing: it has
`onApply` rules only (`trigger_kind` otherwise) and no stacking — a second one
simply acts again. Its instance row is written and ended at once
(`end_reason = triggered`), so the wheel's counters (`maxPerSeason`,
`maxPerPlayer`, cooldowns) count it like any drop; the journal reads `grant`
(`instant: true`), what its rules did, `end`. Its rule text has no "when it is
applied" lead and no duration sentence (§13).

### 6.5 Value sources

| Source | Meaning | Stage |
| --- | --- | --- |
| number literal | | 1 |
| `{ "param": name }` | declared parameter, season-overridable | 1 |
| `{ "random": [a, b] }` | server rng, inclusive | 1 |
| `{ "table": { "die": n, "rows": [{ "upTo": k, "value": v }, …] } }` | a die rolled on a table («Кубик хаоса»): the server rolls d`n` (2–100) and the first row whose `upTo` the roll does not exceed gives the value; 2–12 rows going up strictly, the last one at the die's top face. Offered where the rule text can list it (`move`); power counts its mean | A |
| `{ "source": "diceSum" }` | sum of the current dice — the faces that count, as the step reads them | A |
| `{ "source": "itemCount", "character"?, "multiplier" }` | items the holder has, all or of a character, times `multiplier` (−10…10, not 0) («Бремя») | A |
| `{ "source": "targetLastRoll" }` | the dice sum of the chosen player's last regular move | A |

No arbitrary expressions. A mechanic that needs a formula is a new value
source in code. `random` and `chance` draw from the server rng only; the
journal records every draw. A source is read where the rule runs (§6.11): a
source that cannot be read there — no dice yet, nobody chosen, a player who
has not moved — is worth 0. Sources stand only in the numbers whose sentence
can say them: `steps.delta`, `balance.amount`, `resultModify.delta`,
`move.by` (`source_action` elsewhere).

### 6.6 Tags

Base taxonomy in code: `directed` (aimed at another player), `movement`,
`dice`, `inventory`, `game_pool`, `game_condition`, `board`, `protection`,
`curse`, `handout`. Packs may add their own tags (`[a-z0-9_]`). Seasons can
limit or disable tags (§4.5).

`handout` (wave A) marks an entry that plays only when another hands it out —
«Магнит»'s pull (`magnet_pull`), the throw of «Кости судьбы» (`fate_roll`).
Attaching what hands it out attaches it, switched off (§10.3); the season
presets never switch it on, the sandbox's `core` wheels leave it off, and the
calibration measures it inside its item (§14). An admin may still switch one
on: off the wheel it plays as written — the pull, aimed at nobody, does nothing.

### 6.7 Stage-1 primitives — parameters and placement

Frozen with this spec. "Executor triggers" are `onUse`, `onApply`, `onExpire`
(no turn is in progress); "turn hooks" are the other six.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| condition `outcome` | `is: "passed" \| "dropped"` | every turn hook |
| condition `cellType` | `in: CellType[]` (≥ 1) | `beforeCellEffect`, `afterCellEffect`, `onOutcome` |
| condition `chance` | `percent`: 1–99, literal or an int parameter bounded to 1–99 | everywhere |
| condition `hasEntry` | `who: "self" \| "target"`, at least one of `entry`, `tag`, `character` | everywhere; `who: "target"` only at `onUse` of an item aimed at a player |
| action `steps` | `delta: Value` | `afterMovement` |
| action `dice` | `count?: Value`, `sides?: Value` (at least one) | `beforeMovement` |
| action `balance` | `amount: Value`, `to?: "self" \| "target"` (default self) | `afterCellEffect`, `onOutcome`, `onTick` (folded into the move's ledger line), executor triggers (own ledger line) |
| action `skipCellEffect` | — | `beforeCellEffect` |
| action `noMove` | — | `afterMovement`: the regular move is cancelled — the token stays, no cell fires, the wheel does not spin |
| action `grantEffect` / `grantItem` | `entry: EntryRef`, `to: "self" \| "target"` | executor triggers, `onOutcome`, `onTick` |
| action `cleanse` | `character?`, `tags?` (any of), `count: n \| "all"` — removes the holder's **effects**, newest first | executor triggers, `onOutcome`, `onTick` |

`to: "target"` exists only at `onUse` of an item whose `usage.target.who` is
`other` or `any`. An item aimed at `other` refuses a missing target
(`ieeTargetRequired`), its own holder (`ieeTargetSelfNotAllowed`) and a player
who has left the run (`ieeTargetNotActive`); `any` refuses a missing target
only when a rule needs one. Harm (§6.3): `grantEffect`/`grantItem` to a target
harm it unless the granted entry is a bonus; `balance` to a target harms it
when the amount can be negative; everything aimed at the holder harms no one.

Conditions run in order and stop at the first false one, so a `chance` placed
after a failing condition draws nothing. Rule `priority` is `early` (50),
`normal` (100, the default) or `late` (200).

### 6.8 Wave-A primitives — the dice pipeline

`afterDice` runs once the dice are thrown (§7.2, step 2) and before the token
moves; it knows the outcome and what the dice showed, not the cell. What the
dice showed is also known from `afterMovement` through `afterCellEffect`.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| condition `diceShow` | `of: "sum" \| "any"`, `cmp: "eq" \| "lte" \| "gte"`, `value: FixedValue` — at `afterDice` the first throw, later the faces that counted | `afterDice`, `afterMovement`, `beforeCellEffect`, `afterCellEffect` |
| action `rerollOn` | `values`: 1–6 faces (1–20) — a die showing one of them is thrown again, once | `afterDice` |
| action `bestOfTwo` / `worstOfTwo` | — the dice are thrown twice and the throw better (worse) **for the holder** counts: the higher sum on a pass, the lower on a drop | `afterDice` |
| action `resultModify` | `delta?: Value`, `cap?: FixedValue` (at least one) — added to the dice result, then capped (the lowest cap wins), never below 1 | `afterDice` |
| action `direction` | `lowerHalf: "back"` — the lower half of the dice range (a sum below the middle of `count..count·sides`, judged on the faces as thrown) moves the holder back by the result, the upper half forward, on either outcome; the size is what the move would have been | `afterDice` |

Every one of them acts on drops too, where the holder wants a *lower* result:
an entry that should help or hurt on a pass only says so with an `outcome`
condition, as `core`'s dice statuses do (the owner's call, 2026-10-09).

### 6.9 Wave-A primitives — out-of-turn moves

Each moves a player out of turn (§7.3) and acts where the executor runs rules:
`onUse`, `onApply`, `onExpire`. A chosen player exists only at `onUse` of an
item aimed at one (§6.7).

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| action `move` | `by: Value` — cells, signed (a die table allowed, §6.5); `who?: "self" \| "target"` (default self) | executor triggers |
| action `moveToTarget` | `at: "cell" \| "before"` — the holder jumps onto the chosen player's cell, or the cell right before it | `onUse` of an aimed item only (`aimedOnly`: the editor does not offer it elsewhere) |
| action `swapPositions` | `with: "target" \| "nearestBehind"` — the holder and the other player trade cells | executor triggers |
| action `rollbackLastMove` | `who: "self" \| "target"` — back to the cell that player's last regular move started from | executor triggers |
| action `halveGap` | `who: "nearestBehind"` — that rival moves forward half the gap to the holder, rounded down («Погоня», §16) | executor triggers |

- **When positions are read.** A move is resolved as it is carried out,
  against the positions at that moment, so moves in a row see each other.
- **The nearest rival behind** is the active participant on the highest cell
  strictly below the holder's; a tie is decided by the server rng (journaled).
  With nobody behind, nothing happens (`noop`, `nobody_behind`) — and the wheel
  does not offer an effect that moves the nearest rival behind as it arrives
  to a player with nobody behind the cell they landed on (gate
  `nobody_behind`, §7.11).
- **Where a move ends.** Back never wraps, even on a loop: it stops at cell 0 —
  a penalty must not become a jump to the front. Forward wraps on a loop and
  otherwise stops at the last cell. `before` is the chosen player's cell minus
  one, never below 0.
- **Who is not moved.** A participant out of the run (finished, withdrawn) is
  not moved and not swapped with (`noop`, `not_active`); a rollback before a
  first move does nothing (`no_last_move`).
- **Harm** (§6.3): `move` aimed at the target harms it when it can go back;
  `swapPositions` and `rollbackLastMove` aimed at the target harm it;
  `moveToTarget` and `halveGap` harm no one.

### 6.10 Wave-A primitives — cursed and passive items

An item is used (`active`), works while held (`passive`) or works by itself
and cannot be used (`cursed`, always a penalty — D3; every penalty item is
cursed). Where its rules may stand:

| Activation | Triggers | Charges |
| --- | --- | --- |
| `active` | `onUse`, `onPickup` | uses; at zero the item is spent (`used`) |
| `passive` | the turn hooks (`beforeMovement` … `onTick`), `onPickup` | firings before it vanishes; none — it stays while held |
| `cursed` | the turn hooks, `onPickup` | firings before it vanishes (`triggered`), usually 1 |

- **While held.** A passive or cursed item's rules at the turn hooks take part
  in its holder's rolls after the one it arrived in — exactly as an effect's
  do (anchored at grant, §7.9): a rival's «Свинцовые грузы» never touch a game
  in flight, a penalty drop never touches the roll that dropped it. Each turn
  in which a rule of the item fires spends one charge; at zero the item
  vanishes (`end_reason = triggered`, a `item_expired` feed row where drops are
  revealed).
- **Unusable.** Using a passive or cursed item is refused: `ieeItemNotUsable`.
- **Unique** (`usage.unique`; cursed items always): a holder holds at most one
  instance of the entry. A second grant does nothing (`noop`, `unique`); the
  wheel does not offer it to a holder who has it (`duplicate_unique`); an item
  that would hand it to a player who has it is refused before it is spent
  (`ieeTargetAlreadyAffected`).
- **The inventory cap counts bonus items only** (`inventorySize`): a cursed
  item takes no slot, and a full inventory does not keep it off the wheel.
- **Planting** is `grantItem` with `to: "target"`: the chosen player gets the
  item — with a cursed one, that is «Свинцовые грузы».
- **`onPickup`** runs as the item arrives, any activation, like an effect's
  `onApply`.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| action `remove` | `what: "effect" \| "item" \| "any"`; `character?`; `entry?: EntryRef`; `pick: "choice" \| "newest" \| "random"`; `count?: 1–8` (default 1); `from?: "self" \| "target"` (default self) — ends what matches: effects `cleansed`, items `removed` | executor triggers, `onOutcome`, `onTick`; `pick: "choice"` only at `onUse`, from the holder, once per item |
| target filter | `usage.target.filter`: `ahead` / `behind` — strictly ahead or behind the user; `nearest_ahead` / `nearest_behind` — the nearest active player that way (ties all count); `leader` — on the highest cell | an aimed item (`who: other \| any`) |

- **A choice** is made when the item is used: the use form lists the user's own
  instances the `remove` matches, and the use is refused without one
  (`ieeChoiceRequired`) or with one that does not match (`ieeChoiceInvalid`).
- **A target filter** is judged on the positions when the item is used; the
  picker offers only the players it allows, and the use is refused for any
  other (`ieeTargetNotEligible`).
- **Harm**: `remove` from the target harms it unless it removes penalties only.

### 6.11 Wave-A primitives — standing, items held, the chosen player

| Primitive | May appear at | Reads |
| --- | --- | --- |
| condition `rank` | everywhere | the holder's place as the rule starts: `leader` — nobody active strictly ahead; `last` — nobody active strictly behind; `lte: n` — within the first n (ties share the better place, as the leaderboard does) |
| condition `itemCount` | everywhere | the holder's held items (an item being used counts), all or of a `character` |
| condition `targetRelative` | where a chosen player can be seen | their position against the holder's |
| condition `compareLastRoll` | where the dice are known (`afterDice` on), and a chosen player can be seen | the dice of the roll in progress (the faces that count) against the chosen player's last regular move — strictly lower or higher; nobody chosen, or a player who has not moved, and it does not hold |
| source `diceSum` | where the dice are known | the dice of the roll in progress |
| source `itemCount` | everywhere | the holder's held items |
| source `targetLastRoll` | where a chosen player can be seen | the chosen player's last roll |

- **The remembered player** («Магнит»). A chosen player exists at the use of
  an item aimed at one (§6.7); an effect that such a use hands **to its user**
  (`grantEffect`, `to: "self"`) remembers whom the item was aimed at
  (`aimed_player_id`, §4.3). Its rules at the turn's hooks read that player as
  the chosen player — where they stand and their last roll, **as they are when
  the rule runs** (a roll they make in between counts). Only these readers see
  them: `targetRelative`, `compareLastRoll`, `targetLastRoll`. An effect's
  rules do not act on the remembered player, and `hasEntry` with
  `who: "target"` stays at an item's use (what the remembered player holds is
  not loaded). A renewal (`refresh`) aimed at someone else remembers the new
  player; one aimed at nobody keeps the old. An effect handed out otherwise —
  off the wheel, to the chosen player — remembers nobody, and what reads the
  chosen player does not hold.
- **Checks.** A condition or a source that reads the chosen player where none
  can be seen is `target_unavailable` / `source_unavailable`; `diceSum` before
  the dice is `source_unavailable`; a source in a number that cannot say it is
  `source_action`. The editor offers only what the checks accept.
- **Text.** A source reads as what it counts: "your move is longer by the
  dice result", "the dice result is lower by 1 for each item you hold",
  "you gain 1 point for each cursed item you hold".

### 6.12 Wave-B primitives — item operations

Items change hands, are copied, chosen from the season's catalog, and the
wheel spins once more.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| action `stealItem` | `count?: 1–8` (default 1), `rarity?: Rarity[]` — that many random bonus items of the chosen player (of those rarities) go to the holder | `onUse` of an aimed item only |
| action `transferItem` | `to: "target" \| "randomRival"`, `count?`, `rarity?` — that many random bonus items of the holder go to the chosen player, or to a random active rival (server rng) | executor triggers, `onOutcome`, `onTick`; `to: "target"` only at `onUse` of an aimed item |
| action `swapItems` | `rarity?` — the holder and the chosen player each hand one random bonus item to the other, both picked before either moves; nothing moves when either has none | `onUse` of an aimed item only |
| action `copyItem` | `rarity?` — a fresh copy of a random bonus item of the chosen player (of those rarities) goes to the holder; they keep theirs | `onUse` of an aimed item only |
| action `grantChosen` | `rarity?: Rarity[]`, `activation?: "active" \| "passive"` — the user picks an item of the season's catalog — a bonus item attached and switched on, of those rarities and activation — and gets it | `onUse` only, once per use |
| action `extraSpin` | `pool: "bonus" \| "penalty"` — the wheel of that pool spins once more this turn, after the landing's own | `afterCellEffect`, `onOutcome` |

- **What moves.** An item that changes hands is the same instance: its
  charges and parameters go with it (journal op `move`, the instance keeps its
  id), and its pickup rules do not run again — it was picked up once. A
  passive item counts from its new holder's next roll. Only **bonus** items
  move or are copied — cursed items cannot be stolen, passed or copied (§7.5)
  — and an item never hands itself over: the intent carries the instance whose
  rule asked (the item used, the item held, the effect), and that one stays.
  A unique item never goes to a holder who has one (`noop`, `unique`), nor is
  copied to one; the season-wide limits (§4.5) hold for a move as for a grant.
  A trade either side may not receive does not happen at all.
- **Rarity** in these filters is the entry's own — the one its card shows —
  not the rarity a season's catalog row plays it at for the weights.
- **A copy** is a fresh grant of the entry the season plays, tuned as the
  season tunes it — as the wheel would hand it out — not the copied instance's
  remaining charges.
- **A choice of an entry** (`grantChosen`) is made as the item is used, like a
  choice of the user's own instance (§6.10) — one of each per use at most
  (`entry_choice_twice`). The use form lists what the season's catalog offers
  — the server's own rule, `entryChoiceOptions`: bonus items attached and
  switched on, of the rarities and activation asked, never the item's own
  entry; the item path takes the pick as `chosenEntryId`. A use without one is
  refused (`ieeEntryChoiceRequired`), one outside the filter too
  (`ieeEntryChoiceInvalid`). «Джокер» is `grantChosen` (`common`, `active`);
  «Философский камень» is `remove` (`pick: "choice"`, `rarity: ["common"]`) and
  `grantChosen` (`common`) in one rule.
- **`remove` takes a `rarity` filter** (wave B): `rarity?: Rarity[]`, for the
  instances it may take — the stone turns a common item only.
- **The inventory cap** (`inventorySize`) gates the wheel only (§7.11): a
  steal, a gift or a copy lands in a full inventory as a grant by a rule does.
- **An extra spin** draws from the wheel of its pool with the picker's usual
  gates — a unique entry the first spin just handed out is gated out — and
  hands out what it draws as a drop; the dashboard's wheel animates the
  landing's own spin only, the extra one shows in the inventory and the feed.
- **Feed** (§9.3): a moved item is an `item_moved` row on the receiver's line —
  `how: "stolen" | "given" | "traded"`, `instanceId`, who it came from
  (`fromSeasonPlayerId`, `fromUsername`) — naming the item (`itemKey`, `name`)
  where the season reveals drops or the move came from an item's use. A copy
  is a grant and feeds as one.
- **Power** (§14): what a held item is worth by rarity, the strongest a pick of
  a rarity may take, and what one more spin hands out are read off `core` —
  each entry's power weighted by how often it drops (`PLAY_MODEL.heldItem`,
  `bestItem`, `spin`) — because the simulator plays the item under test and
  nothing a run hands out. A steal is worth twice the item (the lead moves by
  both sides), a gift what the holder has to give, a trade a third of an item
  for the user's pick of whom (an assumption, `tradeEdge`), a copy one item, a
  pick its rarity's best.
- **Bots** steal from a rival who holds something (an attack), copy as a buff,
  trade only with something of their own to give, never give their own away,
  and pick an item of the catalog at random among what is offered.
- **Harm** (§6.3): `stealItem` and `swapItems` harm the chosen player;
  `copyItem`, `transferItem` and `grantChosen` harm no one — what moves is a
  bonus. `extraSpin` acts on the holder.

### 6.13 Wave-B primitives — what arrives, and protection

Before something reaches a player it may be stopped, turned back on whoever
aimed it, made stronger or replaced; for a while a player may also stand out
of reach, or be kept from their own items.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| trigger `onIncoming` | — something is about to reach the holder (below); the executor asks before it carries it out | effects; passive and cursed items |
| trigger `whileActive` | — not a moment: what its rules say holds for as long as the effect lasts or the item is held; the use checks and the executor ask | effects; passive and cursed items |
| condition `incoming` | `is: "harm" \| "entry" \| "moveBack"`; with `entry`, `kind?: "item" \| "effect"` and `character?` — what is about to arrive: an action a rival's item aims at the holder that harms them (§6.3); an entry handed to the holder; an out-of-turn move that would take them back | `onIncoming` |
| action `block` | — what arrives does not happen | `onIncoming` |
| action `reflect` | — the harmful action is turned back on the rival who aimed it: it reaches them instead, as the holder's answer — their own protection may still block it — and one that turning back would not change, a swap of places or of items, is blocked instead | `onIncoming`, in a rule whose `incoming` is `harm` |
| action `amplify` | `factor: 2 \| 3` — what arrives comes that much stronger: an instant effect acts `factor` times, an effect with a counter lasts `factor` times as long, an item comes as `factor` copies, a move goes `factor` times as far; anything else comes once | `onIncoming` |
| action `replace` | `with: 0–6` — instead of what arrives, the holder moves `with` cells forward, out of turn (0: they stay where they are) | `onIncoming` |
| action `untargetable` | — rivals cannot aim items at the holder: such a use is refused, `ieeTargetUntargetable` | `whileActive` |
| action `forbidItems` | — the holder cannot use items: a use is refused, `ieeItemsForbidden` | `whileActive` |
| action `pierce` | `value: 1 \| 2` — harmful actions aimed at the holder pierce protection up to that tier | `whileActive` |

A rule at `onIncoming` may check `incoming`, `chance`, `hasEntry` (the holder),
`rank` and `itemCount`, and answers one way — one of `block`, `reflect`,
`amplify`, `replace` (`incoming_twice`); `reflect` needs `incoming` `harm` in
its rule (`reflect_scope`). A rule at `whileActive` may check `hasEntry` (the
holder), `rank` and `itemCount` — a standing state is judged whenever it is
asked, and a chance would answer differently each time. `protection` on an
entry that neither blocks nor reflects does nothing (`protection_unused`, a
warning).

- **What arrives.** `onIncoming` runs for everything that reaches a player
  through the executor: a use of a rival's item, the wheel's drops, the grants
  of rules — the holder's own included — copies and picks, items handed over,
  moves out of turn (§7.8). Not for what staff do. Only a rival's item aims at
  a player (§6.7), so `harm` is always an item's use: everything harmful one
  use aims at the holder arrives together, and one answer stands for all of
  it. An entry inside such a use then arrives as an entry, a move as a move —
  once the use got through.
- **Who answers.** The holder's instances are asked oldest first, each rule in
  order; the first rule whose conditions hold and whose answer applies
  answers, and nothing more is asked. An answer that does not apply — a
  protection pierced, a reflection of what was reflected already, an
  amplification of an item handed over (the same instance, §6.12) or of a swap
  — lets the next rule answer. The rules work from the moment the instance is
  there: no roll has to pass first.
- **Tier and pierce.** `block` and `reflect` stop a harmful action when the
  entry's `protection.tier` — 1, ordinary, unless it says 2, reinforced — is
  greater than the action's pierce: the `pierce` of the holder's
  `whileActive` rules, added up («Метка», 1). What nobody aimed (a drop, the
  holder's own rule) carries no pierce, and what is not harm takes no tier.
- **Charges.** An answer spends what a firing does (§6.10, §7.9): a charge of a
  passive or cursed item — gone at none — or one count of an effect's
  `triggers`; other durations protect while they last. A refusal at the use
  checks spends nothing — neither the user's charge nor the target's.
- **Chains** (§7.8). A reflected action is never reflected again: its second
  answer — a block, an amplification at the rival — is the last. What an
  answer does itself (the move of `replace`, the copies of `amplify`) arrives
  nowhere.
- **The use checks** ask the user's `whileActive` rules (`forbidItems`) once
  the item is usable in its window, and — for an item aimed at a rival — the
  rival's (`untargetable`), before the entry's own rules run.
- **Journal** (§9.2): `block`, `reflect`, `amplify`, `replace` — the instance
  that answered and its rule, what arrived (`scope`, the entry or the
  intents), the rival who aimed it, and the `tier` and `pierce` compared; a
  turned-back action is journaled as it lands.
- **Feed** (§9.3): an answer is an `intercepted` row on the line of the player
  whose entry answered — `how: "blocked" | "reflected" | "amplified" |
  "replaced"`, the entry (`key`, `name`), and for a rival's action who aimed
  it (`fromSeasonPlayerId`, `fromUsername`). Public for a rival's action — its
  use is public — and otherwise where the season reveals drops.
- **The dashboard** greys the uses out while the player cannot use items, and
  greys out a rival who cannot be targeted in the target picker, as it does
  one under newcomer protection.
- **Bots** aim at nobody who cannot be targeted, and use nothing while they
  cannot.
- **Power** (§14): what an arrival is worth and how often one comes in a roll
  — a harmful action, an entry by kind and character, a move back — are read
  off `core`, each entry's power weighted by how often it drops
  (`PLAY_MODEL.arrival`): the simulator plays rivals who use nothing a run
  hands out, so it cannot measure a protection. A `block` is worth what it
  stops — stopping a bonus is a setback; a `reflect`, that and the action
  turned back; an `amplify`, `factor − 1` times what arrives; a `replace`,
  what it stops and its cells. `untargetable` is worth the harmful actions a
  roll brings; `forbidItems`, half of what the items a roll hands out are
  worth — they wait, they are not lost (`delayLoss`, an assumption); `pierce`,
  the harmful actions a roll brings times the chance a protection would have
  stopped them (`shielded` — the share of the bonus items held that block or
  turn one back, read off the pack like the rest).
- **Harm** (§6.3): the protection primitives harm no one.

### 6.14 Wave-B primitives — the player's choices

Some entries ask their holder to choose (D5): what to give up, what to keep.
The question waits on the dashboard while the game goes on around it (§7.6).

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| action `victimChoice` | `count: 1–3` (1 unless set), `orKeep?: true` — the holder discards `count` of their bonus items, the ones they choose; with `orKeep` they may give nothing instead and keep what asked — the effect, or the item, whose rule this is — and giving ends it | `onApply`, `onPickup`, `onOutcome`, `onTick` |
| action `holdLimit` | `max: 1–3` — the holder may hold at most `max` bonus items: whenever they hold more — as it starts, and each time one more reaches them — they choose which to keep, and the rest burn | `whileActive` |

- **When it asks.** `victimChoice` asks only when there is a choice: when the
  holder has more bonus items than `count`, or — with `orKeep` — at least
  `count`. With `count` or fewer and no `orKeep`, what they have is discarded
  at once; with fewer than `count` and `orKeep` nothing happens and what
  asked stays («Перегруз»: the cap, no choice). `holdLimit` asks when it
  starts and whenever a bonus item reaches the holder — a drop, a rule's
  grant, a copy, an item handed over — while they hold more than `max`.
- What is offered are the holder's **bonus items** — passive ones too, never
  a cursed item (§7.5).
- What happens next, the default and who may answer: §7.6.
- `orKeep` in an instant effect keeps nothing (`or_keep_instant`, an error).
- **Harm** (§6.3): none — the question is the holder's own entry's; an entry
  that asks, handed to a rival («Налог» planted on them), is answered as the
  grant it is (§6.13).
- **Power** (§14): `victimChoice` is worth the bonus items it takes — the
  holder gives up their commonest: `count` × 1.45, a setback; with `orKeep`,
  nothing — the holder takes the cheaper of giving and keeping, so the entry
  is worth what its other rules are. `holdLimit` is worth what it burns in a
  roll — the bonus items a holder has over `max` (a Poisson spread around 0.8
  held) and one more arriving (0.072), at what one held is worth (1.8) — a
  setback.

### 6.15 Wave-B primitives — reaction items

An active item with `usage.window: "after_dice"` is a **reaction item** (D4).
It is used in the reaction window — after its holder's dice are thrown and
before the token moves (§7.4) — and acts on that throw. Its `onUse` rules are
read at that moment: they see the dice as `afterDice` does (its conditions,
the value source `diceSum`) and hold reaction actions only.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| action `reroll` | — the dice are thrown again; the new throw stands | `onUse` of a reaction item |
| action `bestOfTwo` | — the dice are thrown again and the better throw for the player counts: the higher on a pass, the lower on a drop; a tie keeps the first | `afterDice` (§6.8); `onUse` of a reaction item |
| action `rerollOn` | `values` — each die showing a listed face is thrown again, once | `afterDice` (§6.8); `onUse` of a reaction item |
| action `resultModify` | `delta`, `cap` (§6.8) — joining the result modifiers of step 5 | `afterDice` (§6.8); `onUse` of a reaction item |

- A reaction item aims at its holder only (`reaction_target`, an error), its
  `onUse` holds reaction actions only (`reaction_action`), and `reroll` stands
  nowhere else (`reaction_only`). It is never used from the inventory — the
  use checks refuse it (`ieeItemReactionOnly`); answering the window uses it.
- **When it is offered.** The window offers an item when one of its `onUse`
  rules holds on the throw and changes something: a throw again always does,
  `rerollOn` only when a die shows a listed face, `resultModify` only when the
  result moves (a cap above it changes nothing).
- **A throw again is a new throw**: a die on it showing a face the holder's
  statuses reroll at step 3 (`rerollOn` at `afterDice`) is thrown again once
  too; a best- or worst-of-two of step 3 is not repeated. What comes after —
  the result modifiers, the steps, the cell — reads the new faces, and its
  own result modifiers join the statuses' at step 5.
- **Harm**: none.
- **Power** (§14): what one use gains its holder, who sees the dice before
  choosing. They use it on a bad throw — a pass below an average throw, a drop
  above one — that it is expected to improve, the first that comes, and gain
  what it is expected to bring there; a drop's gain counts with the streak
  multiplier (`dropWeight`). On the dice of a new season a throw again is
  worth 2 cells, the better of two 2.2 and +1 to the result 1 — times the
  charges.

### 6.16 Wave-C primitives — the next game

What an entry does to the pick of its holder's next game: which games the
draw may hand out, which one it favours, whether the holder chooses among
several; and, on a game in flight, a new draw or the game set aside for later.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| trigger `beforeGameRoll` | — a game is about to be picked for the holder (§7.12) | effects; passive and cursed items |
| action `poolExclude` | `genres?`, `years?`, `rating?` (at least one) — the games that match are left out of the draw | `beforeGameRoll` |
| action `poolRequire` | the same — only the games that match are drawn | `beforeGameRoll` |
| action `poolFavor` | `factor: 2–5` — the game the user picked (`usage.pick: "game"`) weighs that many times in the draw | `beforeGameRoll` |
| action `chooseOfN` | `n: 2–5` — the draw offers that many games and the holder takes one | `beforeGameRoll` |
| action `rerollGame` | — the game in flight is replaced by a new draw | `onUse` of an item used on an open roll |
| action `postponeGame` | `afterRolls: 2–4` (2 unless set) — the game in flight is set aside and comes back as the holder's game that many picks later, counting the one now; a new game is picked now | `onUse` of an item used on an open roll |
| `usage.pick` | `"genre"`, `"years"`, `"game"` — what the user picks as they use the item | an active item aimed at its user |

- **What a game matches.** `genres`: a list of 1–8 genre names (the
  catalog's, lowercase), or one of the holder's own sets — `"picked"` (the
  genre the use picked), `"lastPassed"` (the genres of the holder's last
  passed game), `"passed"` (the genres of every game they passed this
  season); a game matches when one of its genres is in the set. `years`:
  `"picked"` (the span the use picked) or `{ min?, max? }` (release years
  1970–2100, fixed or a parameter); a game without a release date matches no
  span. `rating`: `{ min?, max? }` on the catalog's rating (0–5); a game
  without one matches none. A set that reads nothing — no pick remembered, no
  game passed yet — matches nothing: an exclusion leaves the pool as it is, a
  requirement is dropped.
- **Together.** Exclusions add up; each requirement narrows the pool further;
  several favoured games each weigh their factor, and a game favoured twice the
  larger of the two; of several choices the largest `n` counts. The season's
  own filters come first: the holder's rules only narrow what the season
  already allows, or favour a game in it. A rule that names several of genres,
  years and a rating names the games that match all of them.
- **Nothing left.** When the season's pool with the holder's rules has no game
  for them, the exclusions and requirements are set aside — the favour and the
  choice stay — and the draw goes on as without them; the journal says so
  (`pool`, `relaxed`). A rule never keeps a player from playing.
- **The pick on use** (`usage.pick`). The use form lists what may be picked —
  `genre`: the genres of the games the season's pool offers the user;
  `years`: the decades it has games from (1990–1999, …); `game`: the games it
  could hand them (not played, not set aside, within the season's filters) —
  and the item path takes the pick (`pickedGenre`, `pickedYears`,
  `pickedGameId`). A use without one is refused (`ieePickRequired`), one
  outside what is offered too (`ieePickInvalid`). What the use hands its user
  (`grantEffect`, `to: "self"`) remembers the pick (`chosen`, §4.3), as an
  effect handed out by an aimed item remembers whom it was aimed at (§6.11);
  handed out otherwise, an effect remembers nothing and `"picked"` reads
  nothing — nor does a pick of another kind. An item that asks for a pick is
  used on its user, from the inventory (`pick_target`), and hands them an
  effect that remembers it (`grantEffect` to `self` at `onUse`, `pick_unused`
  otherwise); a passive or cursed item asks for none (`usage_field`). Only an
  effect remembers a pick: `poolFavor` and `"picked"` stand in an effect's
  rules (`pick_place` elsewhere; the editor offers `poolFavor` in an effect
  only). A year a parameter sets is bounded to 1970–2100 (`year_range`).
- **Who takes part.** The rules of an instance granted while the game it would
  replace was in flight sit that pick out, as a status does a move in flight
  (§7.9): a reroll of that game is drawn without them.
- **On an open roll.** `rerollGame` and `postponeGame` stand at the `onUse` of
  an item used while its user's game is in flight (`window: "on_open_roll"`;
  `open_roll_only` elsewhere, and the editor offers them nowhere else). They
  act on the user's own game, whomever the item is aimed at. Neither asks a
  judge nor spends the season's rerolls: the item is the permission. The roll
  in flight ends as rerolled, and a new game is picked at once, as any pick is
  (§7.12) — a choice the user's rules ask for opens. The use is refused, and
  nothing spent, while a judge has the roll — a completion or a reroll waiting
  (`gameCompletionPending`, `gameRerollPending`) — and when the pool has no
  game to pick (the pool's own reason, as a roll gives it). A set-aside game
  comes back on the holder's pick once they have resolved `afterRolls − 1`
  more games — with 2, the game picked now is a new one and the one after it
  the set-aside game. The roll keeps it (`game_rolls.postponed_until_seq`,
  §4.4); no draw hands it out meanwhile, since the holder has had it. It comes
  back as it is — its own roll, open again: no draw, no rule shapes that pick
  and no choice opens. A blacklisted game does not come back.
- **Harm** (§6.3): none of these harms anyone — they shape the holder's own
  game.
- **Power** (§14): a game is worth how likely its player is to pass it — a pass
  instead of a drop swings 11.9 cells (a pass's 3.5 forward, a drop's 7 back
  at the streak weight, `PLAY_MODEL.gameSwing`). Each primitive moves that
  chance by an assumption (`PLAY_MODEL.pool`) until a live season measures it,
  as with the pass rate: a choice of 2 +0.1, of 3 +0.15, of 4 +0.18, of 5
  +0.2; a picked genre required +0.1, a picked span +0.07, a picked genre
  excluded +0.03, a picked game favoured +0.01 per factor above 1; a game in
  flight rerolled +0.2, set aside +0.15. What the holder did not pick narrows
  their pool against them: genres required or excluded −0.04, a span −0.05, a
  rating −0.03. The power simulator plays no game pool: these are not measured
  in play (a scenario's pool, §5.5, checks what they do, not what they are
  worth).

### 6.17 Wave-C primitives — completion conditions

What the holder must do for their next game to count as passed.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| trigger `onRollCreated` | — a game is assigned to the holder (§7.12) | effects; passive and cursed items |
| action `addCondition` | `text: Localized` (1–200 characters each) — the game gets a completion condition: it is passed with it or not at all | `onRollCreated` |
| action `conditionImmunity` | — the holder's games get no completion conditions | `whileActive` |

- **Held by the roll.** A condition is an instance of kind `roll_condition`
  held by the roll (`holder_kind: roll`): the entry that added it (its
  revision; `owner_player_id` is whoever cast that entry) and its text, kept
  in `params` (`{ ru, en?, uk? }`). It lasts as long as the roll: it ends with
  it — passed, dropped, rerolled or set aside (`expired`, journaled with
  `reason: roll_ended`) — and a new game asks the holder's rules again: a game
  taken from a choice as it is taken (none while the choice waits), a
  set-aside game as it comes back on its own roll. Which instances speak is
  decided as at `beforeGameRoll`: those that take part in the roll the game
  is on — never one granted while the game it replaces was in flight (§7.9).
  Each condition is journaled as a `grant` to the holder (`kind:
  roll_condition`, the roll, the text). It is no drop of its entry: the
  wheel's counters leave it out (§7.11). A season none of whose entries gives
  conditions asks nothing.
- **Where it shows.** On the game card, beside the game; in the completion
  request a judge approves; in the game history. The player reports the game
  as before; the judge — or, without moderation, the player's word — holds it
  to its conditions.
- **Immunity.** While a `conditionImmunity` rule holds for the holder, an
  `addCondition` adds nothing (`noop`, `immune`). The oldest immunity that
  holds answers; one that waits — an effect of `triggers`, a passive or
  cursed item with charges — spends a firing on the game whose conditions it
  kept off (`tick`, then `expire` at zero), as an answer to what arrives does
  (§6.13), and a game that would get none spends nothing. One that lasts a
  span of rolls spends nothing.
- **The season** may switch the tag `game_condition` off (`disabledTags`):
  its entries then neither drop nor are handed out (§7.11). An entry that adds
  conditions carries the tag — publishing refuses it otherwise
  (`condition_tag`, §14).
- **Harm**: none — the condition is the holder's own entry's; a rival's item
  that hands one to its target harms them as that grant does.
- **Power** (§14): a condition takes 0.05 from the pass chance (0.6 cells, an
  assumption, `PLAY_MODEL.pool.condition`); immunity is worth the conditions
  it keeps off — those a game would get, read off the pack like what arrives
  (§6.13): with `core`'s six, 0.024 a roll (`PLAY_MODEL.arrival.condition`).
  One that waits fires on a game that gets conditions, so a firing is worth
  a condition kept off: 0.6 cells. A condition comes with a penalty landing
  and acts on the next game, as an immunity from a bonus landing would, so an
  immunity for the next game alone would never meet one in a season that
  plays `core` — «Иммунитет» waits instead (the owner's call at the wave C
  gate).


### 6.18 Wave-D primitives — objects on the board

An item that places itself on a cell: it stands there until a regular move
enters the cell, acts on whoever made that move — its owner too — and is gone.

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| action `placeObject` | — the item stands on the cell its user picks as a board object | `onUse` of an active item whose pick is a cell (`placesOnly`) |
| `usage.pick` | `"cell"` — the user picks a cell as they use the item | an active item that places itself (`placeObject`) — and only such an item |
| trigger `onObjectEntered` | — a regular move passes through or ends on the object's cell | the rules of an item that places itself (`placed`) |
| action `stopMove` | — the move ends on the object's cell: the cells it had left are lost and no cell fires | `onObjectEntered` |
| action `push` | `delta: Value` (−6…6, not 0; a parameter allowed) — the mover is then moved that many cells, back when negative: no cell, no object | `onObjectEntered`, with `stopMove` |
| action `extend` | `delta: Value` (1–6; a parameter allowed) — the move goes that many cells further, in its own direction; the cell where it ends fires | `onObjectEntered` |
| action `spinInstead` | `pool: "bonus" \| "penalty"` — that wheel spins for the mover in place of the cell | `onObjectEntered`, with `stopMove` |

- **The object** is an instance of kind `board_object` held by the cell
  (`holder_kind: cell`, `holder_cell_index`): the item's revision and
  parameters, `owner_player_id` the user. Placing it is the item's use — its
  charge is spent as it is placed (`use`, then `place`).
- **Where** (`usage.pick: "cell"`): any cell of the board but the start and
  the finish; one object per cell; at most `boardObjectsPerPlayer` (§4.5,
  default 2) standing objects of one owner. A use without a cell is refused
  (`ieePickRequired`), one on a cell it may not take too
  (`ieeCellUnavailable`), and one past the owner's limit
  (`ieeObjectLimit`) — nothing is spent. Objects are public: the board shows
  them to everyone, with their owner.
- **The walk** (§7.7): a regular move passes the cells between where it starts
  and where it ends, in its direction, the last one included; the first
  object on that way acts. Its rules at `onObjectEntered` run with the mover
  as the one they speak of — "you" in their text is whoever entered; the
  owner stays the owner. The object then ends (`trigger_object`, then `end`
  with `triggered`): an object acts once.
- **What it does.** `stopMove` ends the move on the object's cell: no landing,
  so no cell fires and no wheel spins but the one `spinInstead` names; `push`
  then moves the mover from there, out of the walk — no cell, no object.
  `extend` lengthens the move in its own direction, and the walk goes on: a
  further object on the longer way acts too; the cell where it ends fires.
- **Not moves of their own.** An out-of-turn move (§7.3), a push, a teleport
  cell's jump and a cancelled move (`noMove`) pass no objects.
- **What a rule may check** at `onObjectEntered` is the mover's: `outcome`,
  `chance`, `hasEntry`, `diceShow`, `rank` and `itemCount` read the player who
  entered and their turn. There is no chosen player.
- **What the constructor offers** (§6.7): `placeObject` and the trigger only to
  an active item whose use asks for a cell (the scope's `places`; an
  unscoped list offers them); never to a passive or cursed item, which has no
  use to place it with. The checks: `place_pick` — an item that places itself
  asks for the cell, and only such an item asks for one; `object_unplaced` —
  an active item's rules at `onObjectEntered` without `placeObject` in its use
  (a held item's are `trigger_kind`); `object_stop` — `push` and
  `spinInstead` without `stopMove` in their rule, or `extend` with it;
  `object_idle` (a warning) — an item that places itself with no rule at
  `onObjectEntered`.
- **On the board** (§10): every board page marks the cells objects stand on —
  the item's glyph in a frame on the tile — and a cell's details name the
  object, its rule text and its owner (`BoardObjectView`). The dashboard's
  pick of a cell lists the free cells.
- **Bots** place an object that stops a move within a move ahead of the
  nearest rival ahead of them — none when nobody is ahead — and one that helps
  within a move ahead of themselves (`objectCellsFor`): an attack and a buff,
  as the planner scores them.
- **Harm** (§6.3): none — an object is the board's, aimed at no one, and no
  protection answers it (§6.13).
- **Power** (§14): an object acts on whoever enters first. Its owner places it
  where it serves them — a harm on a rival's way, a gain on their own — and
  it meets the one it was placed for three times in four
  (`PLAY_MODEL.object.aimed`, an assumption): it is worth half of what it
  does to the mover (0.75 − 0.25). An object is met moving forward, on a
  pass: `stopMove` takes the cells the move had left, half a pass's move
  (1.75); `push` and `extend` their cells; `spinInstead` a spin of its wheel.
  The simulator places no objects: they are held to the model.

### 6.19 Wave-D primitives — the same cell

| Primitive | Parameters | May appear at |
| --- | --- | --- |
| trigger `onSameCell` | — a rival's regular move ends on the holder's cell (after its objects and its landing cell) | effects; passive and cursed items |
| action `takeEntry` | — the rival who arrived takes this item, as it is: its charges and parameters move with it | `onSameCell` of an item |
| `usage.unique` | `"season"` — one in the season: once one has been handed out no source hands out another; it changes hands | an item |

- **Who arrives.** The rival whose regular move ends where the holder stands —
  after the move's objects and its landing cell, a teleport's jump included.
  An out-of-turn move arrives nowhere (§7.3), nor does a cancelled move or one
  that ends where it began. Every active player on that cell answers, in seat
  order — their effects and passive or cursed items, the oldest first — after
  the move's objects and before the landing's wheel.
- **What a rule may do there**: `takeEntry` (an item's only — `take_item`
  refuses it in an effect, and the constructor offers it to items alone);
  `balance`, `grantEffect`, `grantItem`, `cleanse`, `remove` and
  `transferItem` as the holder's own, written by the executor — nothing of a
  turn of the holder's runs, so no reducer folds them. Conditions: `chance`,
  `hasEntry`, `rank`, `itemCount` — the holder's. There is no chosen player.
- **A firing** counts down an effect of `triggers` and spends a passive or
  cursed item's charge, as a turn hook's does — unless the item went to the
  rival. A taken item's later rules no longer run for its former holder.
- **What may not be taken**: one the rival may not hold another of (§6.10)
  stays where it is (`noop`, `unique`).
- **«Корона»** (wave D): a passive bonus item without charges — +1 to a passed
  game's result while held (`afterDice`, as every dice rule since wave A,
  §6.8), and taken by the rival who ends a regular move on the holder's cell
  (`onSameCell` → `takeEntry`). One in the season (`unique: "season"`): the
  wheel never offers a second once one has dropped (the gate `unique_season`:
  any instance of the entry ever handed out in the season counts — an object
  on the board and a roll's condition are no drops of theirs), and a grant of
  another is refused (`blocked_unique`, `unique_season`) — whoever would get
  it, and even once the first is gone. One in the season is one per player
  too. Its rule text closes with "There is one in the season."
- **Journal**: `move` (`how: "taken"`) with the rival as the new holder; the
  feed's `item_moved` with `how: "taken"` on the rival's line.
- **Harm**: `takeEntry` harms the holder — but nothing aims it, so nothing
  answers it either: it is the board's.
- **Power** (§14): what the item does while held, for as long as it stays — a
  rival ends a move on a given player's cell `PLAY_MODEL.sameCell` of their
  rolls (an assumption, 0.1), so a held crown lasts 1/`sameCell` rolls on
  average (its charges, when fewer); a rule at `onSameCell` fires that often.
  «Корона»: +1 on a pass for ten rolls — 6, epic.
- **The constructor**: «Один на сезон» beside «Один на игрока» in the usage
  (switching it on shows the per-player switch on and locked); the moment
  «Когда соперник встаёт на вашу клетку» and the action «Соперник забирает».
  The feed: "took «Корона» landing on the cell of …".

---

## 7. Execution semantics

### 7.1 Turn phases

Unchanged order of today's `applyResolvedTurn`: outcome → `beforeMovement` →
dice pipeline (§7.2) → `afterMovement` → path and cell → `beforeCellEffect` /
`afterCellEffect` → wheel → `onOutcome` → `onTick`. The arithmetic of a turn —
dice, move, landing cell and the points each moves — is one pure function,
`playTurn` (`lib/engine/turn`), and the game's turn and the simulations (§5.5,
§10.5) all play through it; an invariant test holds them to it. Hook contributions are
reduced by the existing reducer: additive fields sum, overrides go to the
highest priority (conflicts recorded), vetoes OR, the first source pays the
charge. Order inside a phase: priority (early 50, normal 100, late 200), then
grant time, then id — as `sortPatchSources` does today.

### 7.2 The dice pipeline

1. **Composition** — dice count and sides: season base plus «Везение»,
   «Невезение», «Запасная кость», «Кости судьбы» (`beforeMovement`). A die has
   at least 2 sides.
2. **Roll** — server rng only. Then `afterDice` runs, once, on this first throw.
3. **Automatic rerolls** (`rerollOn`, `bestOfTwo`, `worstOfTwo`): «Удача» (a 1
   → reroll), «Неудача» (a 6 → reroll), «Проклятый кубик» (worse of two),
   «Быстрый путь» (better of two). Each die showing a listed face is thrown
   again, once — the faces of every source join. A best- or worst-of-two throws
   the dice a second time, with the same rerolls, and keeps the throw better
   (worse) for the player: the higher sum on a pass, the lower on a drop; a tie
   keeps the first. Best-of-two and worse-of-two together cancel out: a normal
   roll.
4. **Reaction window** — only if the player holds a reaction item the throw
   offers (§7.4, §6.15; wave B): it may throw again, keep the better of two,
   reroll faces or change the result.
5. **Result modifiers** (`resultModify`, `direction`) — first additions
   («Корона» +1, «Тяжёлые ботинки» −2, «Бремя» −1 per item), then the cap
   («Перегруз»: at most 3; the lowest of several), then minimum 1 — no dice is
   a result of 0. «Сломанный компас» sets the sign: the lower half of the faces
   moves the player back by the result, the upper half forward. Points
   (`bonusAddsToRollOnPass`) and a drop's streak multiplier lengthen the move in
   whichever direction it goes.
6. **Steps** — step modifiers add cells **with a sign**: plus is forward, minus
   is back. They can zero a move but never reverse it («Сапоги скорости» turn a
   move back by 3 into a move back by 1). «Кости судьбы» with a sum ≤ 4 cancel
   the move. Only a direction rule (step 5) reverses a move.
7. **Path and cell** — objects on the path (§7.7), then the cell where the move
   ends — for backward moves as well.

### 7.3 Out-of-turn moves

A cell fires only at the end of a **regular move**. A position change caused by
an item or effect («Телепорт», «Крюк», «Свиток обмена», «Погоня», …) changes the
position only: no cell, no wheel, no board objects, no `onSameCell` («Корона»),
and it does not count toward `moves` durations. Exception: reaching the finish
counts, as it has since session 23 — landing on the finish cell finishes the
run, with a `player_finished` row (`outOfTurn: true`).

The executor's `movePlayer` carries every such move out (primitives in §6.9):
it writes `season_players.position` (and the finish), a `move_player` journal
row per player moved — `from`, `to`, `finished`, `swappedWith` — always public,
and a `moved_out_of_turn` feed row on the moved player's own line (§9.3). It
neither writes `moves` nor changes where the player's last regular move
started, so a later «Камень времени» still returns there. A move the wheel's
drop makes during a turn lands on the board that turn played; it follows the
regular move, so the turn's own `moved` row still shows the regular move.

### 7.4 Reaction window

- **When it opens.** Only on the holder's own turn, and only when they hold a
  reaction item (§6.15) with a charge left that the throw offers — «Эликсир
  скорости», «Счастливая монета», «Золотая монета». Otherwise the turn plays
  straight through, as everyone else's does. Not while the player is kept
  from their items (`forbidItems`) or a victim choice of theirs waits (§7.6):
  they could not use one.
- **The pause.** The turn stops after step 3 (§7.2): the player sees the dice,
  the result and the cell the move would end on, and chooses *Accept* or
  *Use* one of the items offered. The token does not move until then. At most
  one reaction item a turn.
- **Two transactions.** Reporting the game opens the window: an
  `iee_decisions` row (`reaction_window`) whose context holds the turn — the
  roll and how it was reported, the throw shown, the move projected and every
  server draw made so far, the dice's and the rules' — and nothing else is
  written: the roll stays open, nothing fires, nothing is spent. The answer
  plays the turn again on those draws. *Accept* replays them all, so the move
  is the one shown; *Use* replays the throw, the item acts at step 4, and the
  rest of the turn draws afresh. The turn is then written as any turn is
  (§7.1), with the item's charge, the answer and the decision, in one
  transaction. What a staff edit changed in between (a revoke, a grant) acts
  on the replay as it would have acted on the turn.
- **No timeout**, but nothing moves the player's game on while it is open: no
  new game (the roll is still open), no second report or reroll of this one
  (`gameReactionPending`). A judge may accept on the player's behalf
  (moderation, «Решения»); only the player uses an item. Bots answer at once:
  they use the offered item expected to gain the most on a bad throw (§6.15),
  and accept otherwise.
- **Approval mode.** With completions approved by a judge
  (`moderation.completionRequireApproval`), the window opens when the judge
  approves: the approval is written with the window, the turn with the answer.
- **Out of reach meanwhile.** While the window is open, rivals' items aimed at
  the player are refused (`ieeTargetReacting`) and nothing is spent; the
  player's own other items wait too (`ieeDecisionPending`).
- **Journal and feed.** `decision_open` (the throw and the items offered);
  with the answer `decision_resolve` (`option`: `accept` or `react`, the item,
  the faces before and after), the item's `use`, then the turn's rows. The
  feed's `item_used` line says what the item did to the dice (`reaction`:
  `before`, `thrown`, `after`, `result`), and the turn's lines show the dice
  that counted.

### 7.5 Cursed items

- Sit in the inventory and cannot be used; they fire by themselves on the next
  relevant event (usually the next roll) and vanish — their rules stand at the
  turn hooks, and each turn one of them fires spends a charge (§6.10).
- Come from the penalty wheel or from a rival («Свинцовые грузы»), and bite
  from the holder's next roll on: never the game in flight, never the roll
  that dropped them.
- Removed by «Амулет очищения» and any `remove` action that reaches items;
  «Очищающая мазь» removes effects only. They cannot be copied, transformed,
  stolen or passed.
- «Налог», «Перегруз», «Проклятие жадности» and the inventory cap count bonus
  items only.
- At most one of each cursed item per player: the wheel does not offer it and
  «Свинцовые грузы» cannot target a player who has it.
- The dashboard shows them in the inventory with the penalty's colours, a
  "Cursed" badge and what sets them off — no Use button.

### 7.6 Victim choice

| Entry | The victim chooses | Default |
| --- | --- | --- |
| «Налог» | which bonus item to discard; with one — it goes, no choice; with none — 1 cell back, no choice | the most common rarity, newest on a tie |
| «Перегруз» | discard two bonus items of their choice, or next roll at most 3; with fewer than two items — the cap, no choice | the cap |
| «Проклятие жадности» | which one bonus item to keep, the rest burn; a new bonus item before the end of the next game asks again | the rarest, newest on a tie |

The three are written with `victimChoice` and `holdLimit` (§6.14).

- **The question** is an `iee_decisions` row (`victim_choice`) and what it
  offers: `discard` (`count` of the player's bonus items), `endure` (with
  `orKeep`: give nothing, keep what asked), `retain` (`count` to keep, the
  rest burn).
- **The answer** is the player's, on the dashboard; a judge may choose for
  them (moderation, the «Решения» tab). What is offered is what the player
  holds when they answer — an item gone since is not, one that came since is.
- **The default** — for `discard` the commonest rarity first, the newest on a
  tie; `endure` with `orKeep`; for `retain` the rarest, the newest on a tie —
  is applied when the player starts their next game without answering, and
  journaled.
- **One question at a time.** A new victim choice first applies the default of
  the one pending, so a player has at most one; `holdLimit` asking again
  updates its own question instead. A reaction window (§7.4) is a decision of
  another kind and may wait beside it.
- **Decide first.** While a question waits, the player cannot use items
  (`ieeDecisionPending`): the use checks refuse, nothing is spent.
- **What it does.** Discarded items end `discarded`, burned ones `burned`;
  giving with `orKeep` ends what asked (`triggered`). An answer with nothing
  left to act on — the items gone, the effect that asked ended — does nothing.
- **Journal** (§9.2): `decision_open` (the instance and rule that asked, the
  options, the default), `decision_resolve` (`by: "player" | "judge"`) and
  `decision_default` — each with the choice and what ended.
- **Feed** (§9.3): `decision_made` on the player's line — `how` (`chosen`,
  `judged`, `defaulted`), the entry that asked, the items that went and those
  kept; shown where the arrival of the entry that asked was.
- **The dashboard** shows the question above the inventory, and a
  notification (`decision_opened`) links to it; the page refreshes when a
  question of the player's opens or is answered — the realtime event
  `decisions:update` in their `user:<userId>` room.
- **Bots** take the default at once.

### 7.7 Board objects

- «Капкан», «Мина», «Пружина» are placed on any cell except start and finish;
  one object per cell; at most `boardObjectsPerPlayer` (default 2) per player.
  Objects are visible to everyone.
- An object fires on the **first** player whose regular move passes through or
  ends on its cell — including whoever placed it — then vanishes. Untriggered
  objects stay until the season ends.
- «Капкан»: the move stops there, the remaining steps burn, the penalty wheel
  spins instead of the cell. «Мина»: the move stops, the player is thrown 2 cells
  back, no cell fires. «Пружина»: the move continues 2 more cells and the cell
  where it ends fires.
- **The walk, step by step** (wave D, §6.18). After the dice and the step
  modifiers (§7.2, step 6) the move knows where it ends; it then walks there
  cell by cell, in its direction — forward on a pass, back on a drop or a
  reversal — over a looping board's seam as the move does. At each cell it
  enters, the last one included, an object standing there acts: `stopMove`
  ends the walk on that cell (with `push`, the mover then moves on from it,
  no further walk), `extend` adds its cells to what is left of the walk. A
  walk that ends without a stop lands: the cell where it ends fires, as any
  landing does (§7.2, step 7). On a board that does not loop the walk stops
  at either end. The objects that acted end as the turn is written, in the
  order they acted.

### 7.8 Interception and protection

- `onIncoming` runs for **everything** a player receives: rivals' directed
  actions and wheel drops alike («Феникс», «Эхо проклятия» need both), the
  grants of rules — the holder's own too — items handed over and moves out
  of turn; not what staff do (§6.13).
- Block and reflect react to actions with `harm: "target"`, regardless of the
  sender entry's character: «Щит» blocks «Свиток порчи» although the scroll is a
  bonus for its holder.
- Protection works when its `tier` (1 unless the entry says 2) is greater
  than the action's `pierce` (default 0). «Метка» gives incoming actions
  pierce 1.
- Interception kinds: block; reflect (a reflected action is never reflected
  again); amplify («Эхо проклятия», ×2); replace («Феникс»: back → 1 forward).
- Reaction chains are at most **2** deep: a reflected action meets one more
  answer at most, and what an answer does itself is not answered.
- A refusal at the use checks spends no charge; a block or reflect spends the
  protection's charge; whatever reaches the target is journaled.

### 7.9 Lifecycle (eager)

Counters change in the **same transaction** as the event that consumes them,
and an instance whose counter reaches zero ends immediately with
`end_reason = expired` and a journal row. Today's read-time expiry
(`expireEffectsFor` comparing with `roll_seq`) is removed.

| Unit | Decrements on |
| --- | --- |
| `rolls` | each resolved dice roll of the holder |
| `moves` | each regular move of the holder (out-of-turn moves do not count) |
| `passed_games` | each passed game of the holder (dropped ones do not count) |
| `triggers` | each time a rule of the instance fires |
| `next_game` | ends when the holder's next game is resolved, passed or dropped — counted like a single roll |
| `permanent` | never |

An instance counts down only on the rolls it takes part in: those after its
`anchor_roll_seq` (§4.3) — or, once a `refresh` renewed it, those after the
roll the renewal arrived in (`count_from_roll_seq`, §7.10). A wheel drop is
anchored at the roll that dropped it; a grant to a player with a game in
flight is anchored at that game. `onExpire`
runs when an effect **runs out** (`expired`) — not when it is cleansed,
revoked or wiped by a reset.

### 7.10 Stacking and limits

- `unique`: a second grant of the same entry is refused (`noop` in the journal);
  `refresh`: a renewal is a fresh copy — the new count, counted from the roll a
  fresh copy counts from, while the instance keeps playing as before. The roll
  already underway when it arrives (a game in flight, or the move whose landing
  handed it out) stays with the old count; whatever counts the effect down
  after that roll — a roll, a move, a passed game, a firing — comes off the
  renewed one (owner's call, 2026-10-09). The old copy stays when it has more
  left: never shorter (fix A3 stays). `stack`: every grant is an instance of
  its own, up to `maxStacks` active at once (two «Оберега» are two absorbed
  landings, and a veto two of them offer at once is paid by the older one
  only).
- `group`: within a group only the strongest instance acts (e.g. one result
  modifier per roll). **Wave B**: no wave-A entry needs it, so the checks
  refuse it (`not_available`) until then (settled at wave A's gate).
- Stacking, limits, cooldowns and uniqueness count per **entry**, never per
  revision.
- Engine invariants: a die has ≥ 2 sides; ≤ 8 actions per firing; chain depth
  ≤ 2; randomness is server-only.

### 7.11 Drops

The wheel spins within one pool: a bonus cell offers bonus items and effects, a
penalty cell offers cursed items and penalty effects (D9). Weight defaults to
the rarity weight; the season may change pool, rarity and weight per entry.
Gates as today: `enabled`, `maxPerSeason`, `maxPerPlayer`, `cooldownRolls`,
`minPosition`, `unlockAfterMove`, plus cursed-item uniqueness, the
season-wide limits (§4.5: `disabledTags`, `maxActiveEffectsPerPlayer`,
`tagLimits`) and `nobody_behind` — an effect that moves the nearest rival
behind as it arrives stays off the wheel of a player with nobody behind the
cell they landed on (§6.9). The counters count per **entry**, whatever the
revision. The `nothing` slice and catch-up weighting are unchanged.

### 7.12 The next game

A game is picked for a player (`pickGameForRoll`) when they roll, when a roll
of theirs is rerolled (a judge's approval, an instant reroll, «Переролл
игры»), and when a game they set aside comes back (`postponeGame`).

1. **Set aside.** A game the player set aside that is due (§6.16) is their
   game — its roll open again: no draw, no rules, no choice. Otherwise:
2. **The season's pool** — its source, filters, primary tag and the games the
   player has had, as today.
3. **The holder's rules** — the `beforeGameRoll` rules of their effects and
   passive or cursed items, oldest first, each as its conditions hold
   (`chance` draws from the server rng): exclusions and requirements narrow
   the pool (§6.16); with nothing left, they are set aside.
4. **The draw** — among the pool's first candidates, as today, a favoured game
   weighing its factor; a favoured game the candidates do not reach joins
   them when the pool holds it.
5. **A choice** (`chooseOfN`): the draw takes `n` different games — among the
   pool's first candidates, at least `n` of them, each weighing its favour —
   and opens a `game_choice` decision with them (§4.3), and no roll is
   written. The player takes one on the dashboard (`take`), and the roll is
   created with it. While it waits there is no open roll: the player cannot
   roll again, nor use items (`ieeDecisionPending`). No default, no timeout,
   no judge — it is the player's game. Bots take one at random. With fewer
   than two games to offer there is no choice.
6. **The roll** is created, and `onRollCreated` rules run — completion
   conditions (§6.17).

Journal: `pool` — the holder's rules that shaped the pick (their instances,
what they excluded, required, favoured and how many they offered), whether
they were set aside (`relaxed`), and the roll the pick went to — or, for a
choice, the decision and the games it offered (`offered`); the decision rows
as for any decision (§7.6): `decision_open` with the games offered,
`decision_resolve` with the game taken and its roll. Feed: `game_rolled` says
when the game came from a choice (`chosen`, with how many were `offered`) or
came back (`returned`); `game_rerolled` names the item that rerolled it
(`itemKey`, `name`), says when the new game came back (`returned`), and when a
choice opened instead of a new game (`choosing`, how many it offers); a
set-aside game is a `game_postponed` row in its place — the game, the roll it
comes back on (`comesBackOn`, the holder's roll number), the item, and the new
game or the choice — under the rolls tab.

---

## 8. Registry and compilation

- **Load set** for a season: every revision referenced by its `season_catalog`
  rows **plus** every revision referenced by its active instances (an instance
  granted before a revision switch keeps working).
- **Lookup**: a key or an entry id finds what the catalog attaches, at the
  pinned revision — a grant by key or by reference can never reach an entry the
  season does not play. A revision id also finds the older revisions live
  instances hold; an instance is drawn from its own revision
  (`instanceView`), so its text and numbers stay the ones it was granted with.
- **Compilation**: each revision document is turned into the existing
  `ItemDef` / `EffectDef` shapes by composing vocabulary functions. No `eval`:
  data only selects and parameterises code. The registry neither checks nor
  runs scenarios (§5.5): a season plays rules.
- **Cache** key: season id + sorted content hashes + vocabulary build id.
- **Serializable view** for the client (`EntryView`; no compiler or vocabulary
  in client code): `{ revisionId, entryId, key, kind, name, ruleText, flavor,
  glyph, character, polarity, rarity, tags, usage, duration, stacking,
  triggers, art }` — every text in all three locales, the numbers under the
  season's tuning. Pages build views from the season registry and pass them
  down; components render `name[locale]` and `ruleText[locale]` and never
  look an entry up by key in the dictionaries, which no longer hold entry
  texts. Lists that only need a name (effect badges, the staff panel) carry
  the entry's `names` with each row. `art` (`{ iconUrl, packIconUrl, system }`)
  says how the entry is drawn (§12).

---

## 9. Executor and journal

### 9.1 Contract

`lib/modules/iee/executor/` exposes operations that run **inside the caller's
transaction** and return journal ids. No other module writes `iee_instances`,
`iee_decisions` or `iee_journal`; an architecture test fails on any other
writer.

| Operation | Effect |
| --- | --- |
| `grant` | create an instance (item or effect), applying stacking and limits; runs `onApply` |
| `use` | spend one charge of a held item (the guard is the UPDATE); ends it at zero |
| `fire` | record a rule firing; decrement `triggers`; spend charges |
| `tick` | decrement `rolls` / `moves` / `passed_games` counters for an event |
| `end` | end an instance with a reason (used, expired, cleansed, removed, …) |
| `move` | change an instance's holder (steal, transfer, a trade, «Корона») — wave B (§6.12) |
| `place` | create a board object on a cell: the item's use places it (wave D, §6.18) |
| `triggerObject` | an object a regular move entered: journaled with what it did to the mover, then ended (`triggered`) — wave D |
| `movePlayer` | out-of-turn position change (writes `season_players.position`) — wave A |
| `balance` | balance change through `ledger_entries` |
| `openDecision` / `resolveDecision` | decisions (§7.4, §7.6) — wave B: a victim choice opens as a rule asks (`victimChoice`, `holdLimit`), and is answered, judged or defaulted; a reaction window opens as a turn's throw offers a reaction item, and is answered with the turn; wave C: a game choice opens as a pick asks for one (§7.12), and is answered with the roll; the caller announces what changed once its transaction commits |
| `resetSeason` | end everything for a season reset |
| `compileFailed` | staff-visible warning for an entry that failed to load |

### 9.2 Journal ops

`grant`, `fire`, `tick`, `expire`, `use`, `end`, `move`, `place`, `trigger_object`,
`move_player`, `balance`, `block`, `reflect`, `amplify`, `replace`, `noop`,
`decision_open`, `decision_resolve`, `decision_default`, `pool` (wave C,
§7.12), `reset`, `compile_failed`.

### 9.3 Feed

Journal rows with `visibility = public` are projected into `event_log` with the
existing IEE event types. The executor *returns* the projected rows and the
caller inserts them — the turn writes its feed as one ordered batch, and the
item and staff paths decide what is public. Payloads carry the entry key and
a snapshot of its names (`name`), so history reads the same after a rename —
the feed renders that snapshot and falls back to the key. Types:
`item_granted`, `item_used`, `item_expired`, `item_revoked`, `effect_applied`,
`effect_expired`, `effect_cleansed`, `effect_revoked`, and `moved_out_of_turn`
(wave A, under the "moved" tab: `from`, `to`, `swappedWith?`; the subject is
the player moved, who may be a rival of the one whose turn or item moved them),
and `item_moved` (wave B, under the items-and-effects tab: `how`, `instanceId`,
`fromSeasonPlayerId`, `fromUsername`, and `itemKey`, `name` where the move is
named; the subject is the player who received the item), and `intercepted`
(wave B, §6.13, the same tab: `how`, `instanceId`, the answering entry's
`key` and `name`, and `fromSeasonPlayerId`, `fromUsername` for a rival's
action; the subject is the player whose entry answered).
`decision_made` (wave B, §7.6, the same tab: `how: "chosen" | "judged" |
"defaulted"`, the asking entry's `key` and `name`, `option`, and the names of
the items `discarded` and `kept`; the subject is the player who decided).
`object_placed` and `object_triggered` (wave D, §6.18, under the
items-and-effects tab: the item's `key` and `name`, the `cell`, the owner;
`object_triggered` on the line of the mover it acted on, with what it did —
`stopped`, `pushed`, `extended`, `spun`).
`game_postponed` (wave C, §7.12, under the rolls tab: the game set aside —
`gameId`, `title` — `comesBackOn`, `afterRolls`, the item's `itemKey` and
`name`, and the new game — `newGameId`, `newTitle` — or the choice opened,
`choosing`); `game_rolled` and `game_rerolled` carry wave C's `chosen`,
`offered`, `returned`, `choosing`, `itemKey` and `name` where they apply.
A reaction item's use (wave B, §7.4) is an `item_used` row with `reaction:
{ before, thrown, after, result: { before, after } }` — the faces it was used
on, the throws it made, the faces that counted and the dice result before and
after it. The line reads a throw again as the faces before and after, a
second throw that lost as both throws, a change to the result as the result
before and after.
A cursed item (wave A, §6.10) rides on the item rows with its `character`: its
`item_granted` reads as a curse picked up (in the penalty colour), and the
`item_expired` of a cursed item that has fired its last charge reads as the
curse shaken off; a passive item that wears out reads as an ordinary
`item_expired`. A held item's charge spent is journalled (`tick`, unit
`charges`), not fed.
A move row names the entry (`key`, `name`) where the season reveals drops — or
always, for a move an item's use made, since the use is public anyway. A new
public kind (steal, object, decision) adds an `EventType`, a feed filter tab
entry and en/ru/uk texts (AGENTS.md §7, §10). The admin **turn trace** reads the journal directly ("why did the player
move 3, not 5").

---

## 10. Library

### 10.1 Rules

- Mutations are admin-only (D1) and each writes `logAdminAction`.
- Drafts are edited freely. **Publish** validates (§14), runs the entry's
  scenarios (§5.5), and inserts revision `n + 1` if the content hash differs
  from the latest; otherwise it is a no-op. Publishing a pack publishes every
  changed entry; a draft refused by a red scenario takes down with it whatever
  in the set references it.
- Entries and packs are archived, never deleted. A revision referenced by a
  season catalog or an instance cannot be deleted (FK `RESTRICT`).

### 10.2 The `core` pack

`core` ships in the repository as `seed/iee/core.ggpack` and is loaded by the
same import as any pack (seed and boot: `pnpm iee:import`), as the system — no
actor, a log line instead of an audit row. It is read-only in production; on a
development install (`IEE_CORE_EDITABLE=1`) it is edited in the constructor and
exported back into the file (`pnpm iee:export core seed/iee/core.ggpack`),
which is committed together with the engine's fixture generated from it
(`pnpm iee:core` → `lib/engine/iee/core-docs/core.generated.ts`, checked by a
test). Re-importing identical content creates nothing (content hash). Any core
entry can be copied into another pack and changed there.

### 10.3 References between entries

A rule references another entry by **entry** (`{ "entry": "<uuid>" }`), never by
revision. In a season the reference resolves to the revision in that season's
catalog, with its overrides. The library maintains pack dependencies from these
references; attaching an entry to a season attaches the entries it references
(latest published revision) automatically, switched off — they play when
handed out and do not drop (§4.2).

A reference resolves at publish to the referenced entry's latest revision, so
it must point at a published entry — or at a packmate published together with
it (publishing a pack checks its changed drafts together).

The entries an entry's **scenarios** name (§5.5) resolve the same way and count
towards the pack's dependencies, but a season does not attach them: they are
needed to check the entry, not to play it.

### 10.4 The constructor

The library is edited in `/admin/catalog` (admin only, D1): **Library** (packs
and entries, a new pack, a `.ggpack` import), **Pack** (metadata and icon,
entries and their revisions, what publishing would do, publish, export, attach
to a season) and **Entry** — the editor. The editor is forms over the entry
document; the stored draft is what the forms produce, trimmed, without empty
translations and without the default `priority`.

- A rule is a card **When · If · Do**. The triggers an entry may use, and the
  conditions and actions a trigger may hold, come from the vocabulary's
  placement (§6.7) — the same functions the checks use — so the editor never
  offers what publishing would refuse. A value is a number, a parameter or a
  random range (§6.5); switching a number to "parameter" declares one with
  that default and bounds that keep its sign (§5.1).
- Beside the forms, live: the card as a player sees it, the rule text in all
  three languages, the power and the checks. The server runs the same checks
  when the draft is saved and when it is published.
- **Scenarios** (§5.5) are a block of their own: Given, then steps of **When ·
  Then**, each reading back as sentences. Running them plays the draft as it is
  in the form on the server and saves nothing (`runScenariosAction`, admin
  only); the editor runs them when it opens an entry that has scenarios, after
  a save and after a publish. A run keeps what every step observed, and each
  expectation is compared with it again as the author edits it — an
  expectation never changes what happens — so the verdict beside a check is
  current until Given, When or what the entry plays changes; a scenario a run
  no longer describes reads **Not run** (or **Changed since the run** when
  the entry itself changed). A missed expectation offers **take what
  happened**: the expected value becomes the observed one.
- Any entry — `core`'s included — can be **copied** into a pack that may be
  changed: a new entry under a new slug, starting from the source's latest
  revision (its draft when it has none), its references unchanged, its icon
  shared (`copyEntry`, audited `iee_entry_copied`).
- Switching a season to another revision lists what changes first — name,
  rule text, flavor, character, rarity, usage, duration, stacking, tags,
  power — and switches only on confirmation (§4.2).

### 10.5 The sandbox

The editor can play an entry before it is published: a **temporary season
kept in memory** for one request — never written to the database, so drafts
can be tried and nothing has to be cleaned up — played by bots through the
same code a season runs (`playTurn`, the executor, the wheel, the item path,
the bots' item policy). Runner: `lib/modules/iee/sim/sandbox.ts`; the editor's
side: `lib/modules/iee/library/sandbox.ts`, `runSandboxAction` (admin only).

- **Season:** a new season's defaults — the board laid out as a new season
  lays one (40 cells; bonus, penalty, teleport and event cells; event cells
  hand out no challenge here), the default dice and points — with items and
  effects on, other players targetable and newcomers unprotected. It attaches
  the entry under test at its draft, on its wheel at its rarity's weight; what
  its rules hand out (and what those hand out), off the wheels; and, when the
  run asks, `core`'s other entries on the wheels too, at their latest
  revisions. One entry per slug: the draft wins over a `core` entry of the
  same slug.
- **Players:** 2–4 bots, each starting with the entry under test (an item in
  the inventory, an effect in force) unless the run says otherwise. A round is
  one turn of each bot still in the run. Before each of its two steps — before
  it rolls, and with the game in flight — a bot may use an item, as it does in
  a season: at the bots' item chance (60 %), what their policy picks, through
  the item path's guards. Then it passes (70 %) or drops (30 %) its game. The
  board, the dice, the wheel, the bots' choices and the games drawn come from a
  **seed** — four streams of it, so a change in what the entry draws leaves the
  board, the bots' choices and the games alone — and the same seed plays the
  same run. At most 50 rounds; a run ends early when every bot has finished.
- **Games** (wave C): each bot's game is drawn before its in-flight step as
  rolling draws it (§7.12) — the holder's rules shape it, a set-aside game
  comes back when due, a choice of games is taken at once at random, as a
  season's bots take it — from a pool of 64: the scenario pool (§5.5) eight
  times over, the years a little later each time round. A bot whose item
  asks for a pick for the next game picks at random from what the pool offers
  it; a game it rerolls or sets aside is replaced at once. With nothing left
  to draw, a bot plays on without a game.
- **Trace:** what was handed out before the first round, then every turn — who,
  the game played, passed or dropped, the dice, from and to, the cell, what the wheel handed
  out, the points after, and the item uses before it — with the journal rows
  it wrote (§9.2), each with its entry named; and a summary: each bot's cell,
  points, status and what it holds, and for every entry seen — the one under
  test first — how often it dropped, was handed out otherwise, was used, fired
  (a rule that shaped a draw counts as firing) and ran out, and how many cells
  its rules added to its holders' moves or took from them.
- **Recorded:** each run is an audit row (`iee_sandbox_run`: the entry, its
  slug, the draft's hash, bots, rounds, seed, whether `core` was on the wheels
  and whether the bots started with the entry, and the summary — or why the
  entry did not play).

---

## 11. `.ggpack` format

A zip file:

```
manifest.json
icons/<entry-slug>.webp    (or .png)
icons/_pack.webp
```

```ts
interface GgpackManifest {
  format: "ggpack"; formatVersion: 1; exportedAt: string; dslVersion: number;
  pack: { id: string; slug: string; names: Localized; description?: Localized;
          defaultLocale: Locale; capabilities: string[]; minDslVersion: number;
          dependencies: { id: string; slug: string }[]; icon?: string };
  entries: { id: string; slug: string; kind: "item" | "effect"; icon?: string;
             revisions: { number: number; contentHash: string; doc: EntryDoc }[] }[];
}
```

Export writes the latest revision of each entry by default (full history on
request). Import validates the manifest and runs the publish checks on every
document; packs and entries are matched by **UUID**, revisions by content hash;
icons go through the `iee_icon` file category. Import reports what was added and
what was already there, and is audited.

- Icons: export writes `icons/<entry-slug>.<ext>` and `icons/_pack.<ext>`
  (`_pack_icon` when an entry is called `_pack`). Import stores every icon the
  file names before its transaction — refusing the import, with the path, if
  the category refuses one — and removes what it stored if the import is
  refused; an icon already stored with the same bytes is reused. A pack or an
  entry the file names no icon for keeps the one it has.

- The file carries no revision ids and its revision numbers only order the
  history: an imported revision is numbered after the local ones, and its id is
  derived from the entry and the content hash (§4.2). Export → import into an
  empty database → export gives the same manifest.
- `dependencies` lists the packs the exported documents reference — in their
  rules and in their scenarios; every one must already be installed, and a
  reference may not leave the pack and its declared dependencies.
- Import runs the scenarios (§5.5) of the revision each imported entry will
  play — its latest — against what the installation has; a red one refuses
  the file. Older revisions are history: they passed when they were made.
- Import is all or nothing (one transaction) and refuses, before writing:
  a document newer than the engine, a hash that does not match its document,
  an entry that belongs to another pack, a change of kind, a slug taken by
  another pack or entry, and any publish-check error — the set checks run over
  the incoming entries together with the pack's entries already installed.
- An entry renamed in the file is renamed on import. A local draft is replaced
  by the newest imported revision unless it holds unpublished work; the report
  lists the drafts it kept.
- Encoding is deterministic (sorted keys, fixed zip timestamps), so a committed
  pack changes only when its content does.

---

## 12. Icons

- File category `iee_icon` in `lib/modules/files/service/categories.ts`: upload
  by `admin`, visibility `public`, PNG or WebP, square 64–512 px, ≤ 256 KB,
  served by `/api/files?key=…` with an immutable cache.
- Entries and packs have an optional icon. Fallback chain: entry icon → static
  art from `public/iee` (core only, existing manifest) → the entry's `glyph` →
  pack icon → glyph by kind.
- The UI draws the frame (item = square slot, effect = hexagon, DESIGN.md); art
  keeps its meaningful content in the central 75 %.
- A picture is stored once per content (by checksum) and shared by every pack
  and entry that uses it. Replacing or clearing an icon removes the old file
  once no pack or entry points at it. Icons belong to the entry, not to a
  revision: an instance of an older revision draws with its entry's icon.
- Set by the library (`setEntryIcon`, `setPackIcon`; admin, audited, the system
  pack read-only) or carried by a `.ggpack` (§11). The view carries
  `art: { iconUrl, packIconUrl, system }`; the chain itself is the client's
  (`iconSource`).

---

## 13. Rule text

- Every primitive has a template per locale; the generator composes the rule
  text of an entry from its rules («Когда … если … — …»). Entry references print
  the referenced entry's name; numbers print with their units.
- Only the name and the optional flavor text are written by hand. A rule text
  can therefore never contradict the behaviour. A player card shows the flavor
  as its own line under the rule text.
- `ru` is required to publish; `en`/`uk` fall back to `ru` with a warning.
- Templates live with the vocabulary (`lib/engine/iee/dsl`), not in
  `lib/i18n/dictionaries`: a template belongs to the primitive it describes,
  and the three languages are kept in step by types and tests.
- Shape: an item opens with how it is used ("Use at any time on another
  player. Single use."), then one sentence per rule ("When you land on a
  penalty cell, the cell does not fire."), and an effect closes with its
  duration ("Lasts 2 rolls."). Landing and outcome rules fold their cell and
  outcome conditions into the lead ("when you pass a game"). An instant effect
  says only what it does ("You instantly move 1–3 cells back."): arriving is
  all it does, and nothing lasts. A die table lists its rows ("by a d20 roll:
  1 → 5 back, 2–5 → 2 back, …").

---

## 14. Publish checks

**Blocking:**

- schema invalid, or an unknown operation;
- an operation the current vocabulary or the pack's capabilities do not provide
  («недоступно: нужна возможность X» — the entry stays a draft);
- a reference to a missing entry or to a pack that is not a dependency;
- an action incompatible with its trigger (`resultModify` outside `afterDice`
  and a reaction item's `onUse`); a reaction item aimed at anyone but its
  holder (`reaction_target`), one whose `onUse` holds anything but reaction
  actions (`reaction_action`), a `reroll` outside one (`reaction_only`) —
  §6.15;
- a pick for the next game (§6.16) on an item not used on its user
  (`pick_target`), one nothing remembers (`pick_unused`), a rule reading a pick
  where nothing remembers one (`pick_place`), a year parameter unbounded to
  1970–2100 (`year_range`); a game rerolled or set aside anywhere but an item
  used on an open roll (`open_roll_only`); an entry that adds completion
  conditions without the tag `game_condition` the season switches them off by
  (`condition_tag`, §6.17);
- a grant cycle (A grants B, B grants A);
- a condition that can never hold (a die value above its sides);
- no `ru` name;
- a scenario that names a missing entry (`missing_ref`), a `use` step without
  an item (`scenario_item`), a scenario id used twice (`scenario_id_taken`);
- a red entry scenario (§5.5): an expectation that does not hold
  (`scenario_failed`, at the step's `expect`, with the scenario, the step, the
  field, what was expected and what happened) or a step that cannot run
  (`scenario_broken`, with the reason).

**Warnings (do not block):**

- a penalty entry with no counter in the pack and its dependencies (the
  counter-play test of `iee-catalog.test.ts`, generalised);
- extreme values (e.g. +10 steps on a d6);
- two entries with identical behaviour;
- no own icon (the fallback chain applies);
- power above the suggested rarity, or above the season's `powerCeiling`.

Every finding has a `code`, a `path` into the document (so an editor marks the
field) and `params` — the operation, trigger, parameter or entry it is about —
from which an editor builds its own sentence per locale; the English `message`
is for logs and staff.

**Power** is the advantage an entry gives its holder over its life — or takes
from whoever it is aimed at — counted in cells (`entryPower`,
`lib/engine/iee/dsl/power.ts`). Each action costs what one firing is worth on
the turns its rule fires on, and goes one way: it helps the holder (or, aimed
at the chosen player, the user) or sets them back — a penalty handed to the
holder, a pass's move lost, a bonus kept off the holder's landing. Conditions
scale a rule by how often they hold; an effect is worth its rules times its
duration, an item its rules times its charges; the power is what that comes
to, whichever way — a drawback takes from the gain («Кости судьбы»: a die more
on a pass, less the move of a low sum). The costs rest on a model of ordinary
play (`lib/engine/iee/dsl/play-model.ts`), calibrated against the simulator:

| Action | One firing is worth |
| --- | --- |
| `steps` | its cells, whichever way the move goes |
| `dice` count | 3.5 forward on a pass, 3.5 back on a drop — drops weigh 0.48 of the turns, not 0.4, because a run of drops multiplies the next |
| `dice` sides | half a cell on every die thrown: one on a pass, two on a drop |
| `balance` | 0.2 of a cell a point (it rides on the next roll, either way); a loss only when there are points to take (0.3 of the time) |
| `skipCellEffect` | what the landing would have done: a bonus cell 1.1, a penalty cell 1 (its points and its wheel) |
| `noMove` | a pass's move lost, a drop's move back spared — the throws the rule fires on (a sum of 2 or less loses 1.5) |
| `grantEffect` / `grantItem` | the power of what it hands out (2 when unknown) |
| `cleanse` | 1 an effect, 3 for all |
| `rerollOn`, `bestOfTwo`, `worstOfTwo`, `resultModify`, `direction` | what it changes in a pass's forward and a drop's backward move, from the exact distribution of a new season's dice |
| `move` | its cells (a die table at its mean) |
| `moveToTarget` | the gap to the player aimed at, `aimGap` = 6 (one less for `before`) |
| `swapPositions` | twice the gap — both sides move: 2 × 6 with the chosen player, 2 × 4 with the nearest rival behind (`behindGap` = 4) |
| `rollbackLastMove` | a rival's passed game undone (3.5), or the holder's own drop (7) — used when it pays |
| `halveGap` | half of `behindGap`: 2 |
| `remove` | the power of the entry it names; 2 an instance when it names none — like an unknown grant (measured: a poison taken off is worth 3); a bonus item of the rarities it names, what one of them is worth (wave B) |
| `stealItem` | twice a held item of its rarities (both sides): 2 × 1.62 for any — common 1.29, rare 2.05, epic 4.4, legendary 12, at their shares of the drops (wave B, §6.12; read off `core` after wave D) |
| `transferItem` | twice what the holder has to give — an item times the chance they hold it (a Poisson spread around 0.8 bonus items held); a setback |
| `swapItems` | a third of an item, twice: the user's pick of whom to trade with (`tradeEdge`) |
| `copyItem` | one held item of its rarities |
| `grantChosen` | the pack's strongest of its rarities: common 2, rare 3.6, epic 6, legendary 12 |
| `extraSpin` | what its wheel drops: the bonus wheel 1.45, the penalty wheel 1 the other way |
| `block` | what it stops (wave B, §6.13; `PLAY_MODEL.arrival`, read off `core` — each entry's power at its drops): a harmful action 1.88 (the pack's harmful items, a swap counted on the one side it harms), a bonus item 1.62, a bonus effect 0.92, a cursed item 1.38, a penalty effect 0.96, a move back 2.1; stopping a bonus is a setback |
| `reflect` | a block of a harmful action, and the action turned back on the rival: 1.88 + 1.76 (a swap does not turn) |
| `amplify` | `factor − 1` times what arrives, its way |
| `replace` | what it stops, and its cells forward |
| `untargetable` | the harmful actions a roll brings, stopped: 0.014 × 1.88 |
| `forbidItems` | half of what the items a roll hands out are worth — they wait, they are not lost (`delayLoss`): 0.5 × 0.076 × 1.62, a setback |
| `pierce` | the harmful actions a roll brings, times the chance a protection would have stopped them (`shielded`, 0.057 — the share of the bonus items held that block or turn one back, read off `core`): a setback |
| `victimChoice` | the bonus items it takes, the holder's commonest: `count` × 1.29, a setback (wave B, §6.14); with `orKeep` nothing — the holder takes the cheaper way |
| `holdLimit` | the bonus items it burns in a roll — those held over `max` and one more arriving — at 1.62 each, a setback |
| `reroll`, and `bestOfTwo`, `rerollOn`, `resultModify` at a reaction item's `onUse` | what one use gains on the bad throw it is used on — the first pass below an average throw, or drop above one, that it is expected to improve (wave B, §6.15): a throw again 2, the better of two 2.2, +1 to the result 1 |
| `poolExclude`, `poolRequire` | the chance to pass the game it leaves, times a pass instead of a drop (`gameSwing`, 11.9 cells; wave C, §6.16): what the use picked, required, +0.1 for a genre and +0.07 for a span (1.19 and 0.83), excluded +0.03 (0.36); what the holder did not pick, −0.04 for genres, −0.05 for a span, −0.03 for a rating (0.48, 0.6, 0.36 the other way); a rule naming several adds them up |
| `poolFavor` | +0.01 to the chance a factor above 1: 0.24 cells at ×3 |
| `chooseOfN` | the chance to pass a game the holder chose: of 2 +0.1, of 3 +0.15, of 4 +0.18, of 5 +0.2 — 1.19, 1.79, 2.14, 2.38 cells |
| `rerollGame`, `postponeGame` | a game in flight the holder would rather not play: replaced +0.2 (2.38 cells), set aside +0.15 (1.79) |
| `addCondition` | a completion condition takes 0.05 from the chance to pass the game (an assumption, `PLAY_MODEL.pool.condition`): 0.6 cells, a setback (wave C, §6.17) |
| `conditionImmunity` | the conditions a game gets in a roll, kept off: 0.024 a roll (read off `core`, `PLAY_MODEL.arrival.condition`) × 0.6; one that waits (`triggers`, a held item's charges) fires on a game that gets them — 0.6 a firing |

A rule's conditions also say what its actions are worth on (`narrow`): an
`outcome` condition a pass or a drop, a `cellType` its cells, a `diceShow` on
the sum the throws it lets through — no move on a pass of 2 or less loses 1.5
cells, not 3.5. Dice the entry's own rules add before the throw (a
`beforeMovement` `dice` firing on every pass or drop) are the dice its later
rules read: «Кости судьбы»'s sum of 4 or less is 1 throw of 2d6 in 6, losing
3⅓. An `outcome` condition holds 60/40 and sets which of a pass or a drop the
actions are worth on (60 % passed games is an assumption — there is no live
season to measure it from yet; revisit it from the first season's rolls); a `cellType` condition holds as often as a new season's
board has those cells; a `chance` its percent. An effect that lasts a number
of `triggers` waits for its conditions, so they do not discount it. A passed
game is worth 1.5 rolls; permanent, 10. What an effect does as it arrives
(`onApply`) or ends (`onExpire`) counts once, however long it lasts; an
instant effect is worth its arrival. An item held for its work (§6.10) is
worth its rules times its charges, and those charges wait for their conditions
like `triggers` do — one is spent on each turn a rule fires; a passive item
without charges works for good (10); what an item does as it is picked up
(`onPickup`) counts once. `aimGap` and `behindGap` are assumptions
like the pass rate — a season's real spread is known only once it is played;
the simulator measures each out-of-turn primitive with the rival placed at
those gaps. The next game is worth one roll.

Wave B's arrivals (§6.13): an `incoming` condition holds as often as such an
arrival comes in a roll — a harmful action 0.014, a bonus item 0.076, a bonus
effect 0.024, a cursed item 0.01, a penalty effect 0.09, a move back 0.013
(read off `core` after wave D) — the wheels' share of each on a new season's
board and a rival's harmful item as often as a player lands one; it says what
its rule's actions are worth on. A rule at `onIncoming` without one answers
everything, about 0.23 arrivals a roll. An entry that waits — a passive item with charges, an effect of
`triggers` — is worth its answers whenever they come, as for the turn's
triggers.

Wave A's readers (§6.11): a `compareLastRoll` holds as often as a roll of the
turns the rule fires on comes out lower (higher) than a last roll that was a
pass or a drop at their rates — exact, from the dice; `targetRelative` holds
half the time; `rank` as often as one place of a field of **8** (`field`) is
the one asked for; `itemCount` as often as a Poisson count around **1** held
item (`heldItems`, a fifth of them cursed — `cursedShare`) compares as asked.
A source is worth the play model's mean of what it reads: a roll's dice sum on
the turns the rule fires on (3.5 on a pass, 7 on a drop, 4.9 either way), the
mean of held items times the multiplier, a last roll's 4.9. The field and the
held items are assumptions the two-player simulator cannot measure; the
sources, `compareLastRoll` and the next game are calibrated against it
(«Магнит» measured with the rival's last roll at 5, an item count with one
item held).

The simulator (`lib/modules/iee/sim/measure.ts`) plays two players for twelve
turns (thirty for an entry that waits for its conditions) on a long board with
`core` on the wheels (its handouts left off), every seed with and without the
entry on the same dice, games and wheel draws; the difference is the entry's
worth. An active item is used on the first turn — one that asks for a pick
takes the newest of what the holder carries; a passive or cursed one works by
itself while held. `lib/modules/iee/sim/power-calibration.test.ts` holds the
estimate to it for each primitive and each `core` entry (within half a cell, a
third of the value and two standard errors). A `core` entry is measured where
the play model puts its players — a player aimed at 6 ahead (with a last roll
of 5 for «Магнит»), the rival behind 4 back, a rival's last move a pass of 4 —
and with what it works on: the salve and the amulet on a poisoned holder,
«Бремя» on a holder with one item. A handout is measured inside its item.

**Rarity** says how special an entry is, not which step of one effect it is
— three strengths of the same swamp are not three rarities (the owner's call,
2026-10-09):

| Rarity | What it is |
| --- | --- |
| `common` | the everyday traffic of the wheels: a cell or two of steps, points or dice |
| `rare` | a mechanic of its own (a cleanse, a blocked cell) or clearly stronger than the everyday |
| `epic` | an entry that swings a race or bends a rule of the season |
| `legendary` | the rewards of hard challenges (a later wave), not the wheels' traffic |

Power guards the strength side of it: a rarity carries up to **common 2.5,
rare 4, epic 6**; above that is legendary (`suggestedRarity`). The editor
shows the power and the rarity it alone would suggest; `power_above_rarity`
warns when an entry is stronger than its rarity carries. An entry weaker than
its rarity is not flagged — uniqueness is the author's call. The season wizard
flags a revision above its `powerCeiling`.

`core` by this rule (measured on 1000 seeds, session 24): `cleansing_salve`
(3.0, a cleanse), `ward` (1.0, a blocked cell) and `poison` (3.0, the strongest
penalty) are rare; the other thirteen are common; nothing in `core` is epic.
With these weights a bonus spin is worth 1.65 cells and a penalty spin 1.64 —
the wheels hand out as much as they take.

Wave A (session 29, 1000 seeds; power / measured): the out-of-turn leaps set
the top — `swap_scroll` 12 / 11.8 and `castling` 8 / −7.7 are above epic and
so legendary, `portal_scroll` 6 / 5.8 and `teleport_ring` 5 / 4.8 epic;
`teleport` 3 / 2.8, `time_stone` 3.5 / 3.7, `misfired_portal` 3 / −3.0 and
`lost_time` 3.2 / −3.5 sit in rare by strength. `hook`, `fast_track`,
`broken_compass` and `pursuit` (2 or less) are rare as mechanics of their own,
`fate_dice` (1.8 / 1.6) epic as a rule bent; the rest are common. The wheels
stay even: a bonus spin is worth 1.58 cells, a penalty spin 1.58. A penalty
landing is worth more with wave A's wheel (`castling` and `pursuit` swing a
long run): skipping one measures 1.7 ± 0.2 on 3000 seeds against the model's
1, a bonus one 0.8 ± 0.2 against 1.1 — inside the tolerance, so `landing`
stays until a live season says otherwise.

Wave C (session 38): the next game's entries are worth what the play model
assumes (§6.16, §6.17) — the simulator plays no game pool and no game is
harder there than another, so they do nothing in play and are not measured;
`power-calibration.test.ts` holds each to its assumption, and holds the wave's
eighteen to the next game's primitives alone. Every one sits at or below its
provisional rarity: the items 0.2–2.4 («Переролл игры» the strongest), the
conditions 0.6, the pool's penalties 0.5–0.6, «Иммунитет» 0.6 (§6.17). The
pack-read model moved with them: six of the penalty wheel's 33 entries are
conditions at 0.6, so a penalty spin takes 1 cell and a bonus spin gives 1.43;
what arrives, the held items and `shielded` were re-read the same way.

Wave D (session 42): an object on the board is worth what it does to the one
who meets it, at the model's aim (§6.18) — the simulator places none, so
`power-calibration.test.ts` holds the three to the model like the next game's
entries: «Мина» 1.9, «Капкан» 1.4, «Пружина» 1.0. «Корона» is measured,
6 / 5.4 on 1000 seeds: the simulator's rival takes it now and then, as a rival
does in the model (`sameCell`, §6.19). The pack-read model moved with four
more bonus items — a bonus spin gives 1.45; what arrives, the held items and
`shielded` were re-read the same way, and «Налог», which takes a held item,
went from 1.1 to 1.2.

---

## 15. Weights and the drop table

Default weights: `common` 100, `rare` 40, `epic` 15, `legendary` 5. With the
starter set: the bonus pool has 49 entries (shares by rarity 66.5 / 29.4 /
3.7 / 0.4 %; one specific common entry drops in 3.5 % of bonus spins, one
specific legendary in 0.18 %, any legendary about once in 286 spins); the
penalty pool has 32 entries (77.1 / 22.3 / 0.6 %); the six completion
conditions take 25.7 % of penalty spins, so a season may disable the tag
`game_condition`. The season wizard shows the drop table and a 1000-spin
simulator: the spins are the picker's own (`simulateSpins`), and the wizard
says the largest gap from the table and whether chance explains it — every
slice within four standard deviations of its share (`spinGaps`;
`lib/engine/iee/selection/simulate.test.ts` holds the picker to the table on
both of `core`'s wheels).

---

## 16. «Погоня» (replaces «Охотник»)

The nearest rival behind the holder immediately halves the gap: moves forward
half the distance, rounded down (a tie between equally near rivals is broken by
server rng). It is an out-of-turn move (§7.3). The wheel does not offer it to a
player with nobody behind.

---

## 17. Starter set (D12)

83 entries = 45 items + 38 effects: the Excel list (75) merged with the 14
current core entries, minus 6 duplicates. Cumulative availability: core 14
(17 %), wave A 37 (45 %), B 59 (71 %), C 77 (93 %), D 81 (98 %); «Чёрная
карта» and «Белая карта» wait for events. Stage 1 ports the 14 current entries
**unchanged** (same keys and behaviour) for parity; the renames and merges
below are applied to `core` in stage 2 and later waves.

Changes against the Excel list and the current core:

| Before | After | Why |
| --- | --- | --- |
| «Обмен судьбой» | merged into «Карманник» | same rule |
| «Ловушка» | merged into «Потерянное время» | same rule |
| «Разбитая броня» | merged into «Метка» | same rule |
| core `lodestone` «Путеводный камень» | merged into «Сапоги скорости» (`speed_boots`) | same rule |
| core `slowed` «Замедление» | merged into «Болото» (`swamp`) | same rule |
| core effect `heavy_boots` | cursed item «Тяжёлые ботинки» (`cursed_boots`, wave A); the effect stays as «Тяжёлый шаг» | as in Excel; an entry keeps its kind and a pack its slugs, so the item has a slug of its own |
| «Охотник» | «Погоня» (`pursuit`) | the "+1 to a roll against the owner" was undefined |
| «Торговая лицензия» | «Свиток торговли» (`trade_scroll`) | a two-party consented trade is out of v1 scope |
| «Незнакомая территория»: series | genre the player has not passed this season | `games_catalog` has genres, no series |
| «Отложенная игра»: "returns later" | returns exactly two rolls later | the engine needs a term |
| core effect `shield` «Щит» | «Оберег» (`ward`) | the Excel «Щит» is a different item |
| core `taxed` «Обложен налогом» | «Пошлина» (`toll`) | confusable with the Excel «Налог» |
| «Философский камень», «Копировальный свиток» | only common **bonus** items | cursed items cannot be transformed or copied |

### 17.1 Entries by wave

Names are the content language (ru) with an English working title; slugs are
the `core` slugs from stage 2 on (stage 1 keeps the current keys). The
rarities of waves A–D are provisional: each wave assigns them by the rule of
§14 — measured strength and uniqueness — when it lands.

### Core (stage 1–2) — 14

| Slug | Name (en / ru) | Kind | Character | Rarity | Rule | Origin |
| --- | --- | --- | --- | --- | --- | --- |
| `speed_boots` | Boots of Speed / Сапоги скорости | item | bonus | common | Next move goes 2 cells further. | Excel + core (`lodestone`) |
| `spare_die` | Spare Die / Запасная кость | item | bonus | common | Before the roll: «Везение» — passed games get dice with 2 more sides for two rolls. | core |
| `cleansing_salve` | Cleansing Salve / Очищающая мазь | item | bonus | rare | Removes every penalty effect; cursed items stay. | core |
| `hex_scroll` | Hex Scroll / Свиток порчи | item | bonus | common | Applies «Болото» to the chosen rival. | core |
| `jinx` | Jinx / Сглаз | item | bonus | common | Applies «Невезение» to the chosen rival. | core |
| `tailwind` | Tailwind / Попутный ветер | effect | bonus | common | Next move goes 2 cells further. | core |
| `acceleration` | Acceleration / Ускорение | effect | bonus | common | Next two moves go 1 cell further each. | Excel |
| `lucky` | Lucky / Везение | effect | bonus | common | On a passed game, dice get 2 more sides; lasts two rolls. | core |
| `ward` | Ward / Оберег | effect | bonus | rare | Absorbs the next penalty cell your move ends on. | core (was effect `shield`) |
| `momentum` | Momentum / Разгон | effect | bonus | common | Each passed game in the next three rolls earns a balance point. | core |
| `swamp` | Swamp / Болото | effect | penalty | common | Next two moves are 1 cell shorter each. | Excel + core (`slowed`) |
| `toll` | Toll / Пошлина | effect | penalty | common | For the next three moves every cell you stop on costs a balance point. | core (was `taxed`) |
| `unlucky` | Unlucky / Невезение | effect | penalty | common | On a passed game, dice get 2 fewer sides; lasts three rolls. | core |
| `poison` | Poison / Отравление | effect | penalty | rare | Every move is 1 cell shorter until you pass two games; dropped games do not count. | Excel |

### Wave A — 23

As shipped (session 29): rarities by §14 — the provisional ones held unless the
strength said otherwise (`teleport_ring` epic, `castling` legendary;
`lead_weights` kept common from `core`). Every dice rule acts on passed games
only: a lower result, a reroll or a reversal on a drop would help the holder
(§6.8).

| Slug | Name (en / ru) | Kind | Character | Rarity | Rule | Origin |
| --- | --- | --- | --- | --- | --- | --- |
| `teleport` | Teleport / Телепорт | item | bonus | rare | Instantly 3 cells forward, out of turn. | Excel |
| `portal_scroll` | Portal Scroll / Свиток портала | item | bonus | epic | Instantly to the cell of a chosen player ahead, out of turn. | Excel |
| `swap_scroll` | Scroll of Exchange / Свиток обмена | item | bonus | legendary | Swap positions with a chosen player ahead, out of turn. | Excel |
| `teleport_ring` | Ring of Teleportation / Кольцо телепортации | item | bonus | epic | Instantly to the cell right before a chosen player ahead, out of turn. | Excel |
| `magnet` | Magnet / Магнит | item | bonus | common | Pick a player ahead: if your next passed roll is lower than their last one, +2 to the move — through the handout «Притяжение». | Excel |
| `hook` | Hook / Крюк | item | bonus | rare | The chosen rival instantly steps back 2 cells, out of turn. | Excel |
| `time_stone` | Time Stone / Камень времени | item | bonus | rare | The chosen rival returns to the cell their last move started from; grants from that cell stay. On a rival only: undoing one's own drop is worth ~7 cells. | Excel |
| `fate_dice` | Dice of Fate / Кости судьбы | item | bonus | epic | Your next passed game rolls a die more; a sum of 4 or less means no move — through the handout «Бросок судьбы». | Excel |
| `chaos_die` | Chaos Die / Кубик хаоса | item | bonus | common | Roll d20 now: 1 → −5, 2–5 → −2, 6–10 → 0, 11–15 → +2, 16–19 → +4, 20 → +8 cells, out of turn. | Excel |
| `purifying_amulet` | Amulet of Purification / Амулет очищения | item | bonus | common | Removes one penalty effect or cursed item of your choice. | Excel |
| `lead_weights` | Lead Weights / Свинцовые грузы | item | bonus | common | Plants the cursed item «Тяжёлые ботинки» (`cursed_boots`) on the chosen rival. | core |
| `fortune` | Fortune / Удача | effect | bonus | common | If your next roll is a pass showing a 1 — automatic reroll. | Excel |
| `fast_track` | Fast Track / Быстрый путь | effect | bonus | rare | After your next passed game the roll is made twice, the better one counts. | Excel |
| `cursed_boots` | Heavy Boots / Тяжёлые ботинки | item (cursed) | penalty | common | Next passed game −2 to the result, never below 1; then the item vanishes. | Excel + core (was the effect `heavy_boots`, which stays as «Тяжёлый шаг») |
| `cursed_die` | Cursed Die / Проклятый кубик | item (cursed) | penalty | common | Next passed game is rolled twice, the worse one counts; then the item vanishes. | Excel |
| `broken_compass` | Broken Compass / Сломанный компас | item (cursed) | penalty | rare | Next passed game: the lower half of the faces moves you back by the result, the upper half forward; then the item vanishes. | Excel |
| `back_teleport` | Backward Teleport / Телепорт назад | effect | penalty | common | Instantly back 1–3 cells, out of turn. | Excel |
| `burden` | Burden / Бремя | effect | penalty | common | Next roll, if passed: −1 per item you hold, cursed ones included, never below 1. | Excel |
| `misfortune` | Misfortune / Неудача | effect | penalty | common | If your next roll is a pass showing a 6 — forced reroll. | Excel |
| `lost_time` | Lost Time / Потерянное время | effect | penalty | rare | Your next passed game gives no move; it waits through drops. | Excel + «Ловушка» |
| `misfired_portal` | Misfired Portal / Неудачный портал | effect | penalty | rare | Instantly back 1–5 cells, out of turn. | Excel |
| `pursuit` | Pursuit / Погоня | effect | penalty | rare | The nearest rival behind instantly halves the gap to you, out of turn. | replaces Excel «Охотник» |
| `castling` | Castling / Рокировка | effect | penalty | legendary | Swap positions with the nearest rival behind, out of turn. | Excel |

`core` after wave A holds 40 entries: these 23 (37 of the starter set with the
core wave), the effect `heavy_boots` kept as «Тяжёлый шаг» / Heavy Step, and two
handouts (§6.6) — `magnet_pull` «Притяжение» / Magnetic Pull and `fate_roll`
«Бросок судьбы» / Roll of Fate.

### Wave B — 22

As shipped (session 34): the provisional rarities held — by strength every
entry sits at or below them, and the rarer ones mark what is special
(«Воровская перчатка» epic at 3.6, «Карманник», «Проклятие жадности»,
«Перегруз», «Эхо проклятия» and «Проклятие» rare below 2.5). The elixir acts on
passed games only, as every dice rule does since wave A: one more on a drop is
a longer move back. «Карта сокровищ» works through the handout «Поиск
сокровищ» (`treasure_hunt`), as «Магнит» and «Кости судьбы» do: an item acts
when it is used, and the next move is an effect's. «Перегруз»'s cap waits for a
passed game, as «Потерянное время» does.

| Slug | Name (en / ru) | Kind | Character | Rarity | Rule | Origin |
| --- | --- | --- | --- | --- | --- | --- |
| `speed_elixir` | Elixir of Speed / Эликсир скорости | item | bonus | common | Reaction after the dice, on a passed game: +1 to the result. | Excel |
| `lucky_coin` | Lucky Coin / Счастливая монета | item | bonus | common | Reaction after the dice: reroll, the new result stands. | Excel |
| `golden_coin` | Golden Coin / Золотая монета | item | bonus | rare | Reaction after the dice: reroll, keep the better of two. | Excel |
| `shield` | Shield / Щит | item | bonus | common | Cancels the next harmful action a rival directs at you. | Excel |
| `treasure_map` | Treasure Map / Карта сокровищ | item | bonus | common | Before the roll: if your next move ends on a bonus cell, the wheel spins twice — through the handout «Поиск сокровищ». | Excel |
| `mirror_shield` | Mirror Shield / Зеркальный щит | item | bonus | rare | Cancels the next harmful directed action and returns it to the sender. | Excel |
| `phoenix` | Phoenix / Феникс | item | bonus | rare | Passive: if an item or effect moves you back, you go 1 cell forward instead; then it vanishes. | Excel |
| `trade_scroll` | Scroll of Trade / Свиток торговли | item | bonus | rare | You and the chosen player swap random bonus items. | replaces Excel «Торговая лицензия» |
| `copy_scroll` | Copying Scroll / Копировальный свиток | item | bonus | rare | Copy of a common bonus item of the chosen player; they keep the original. | Excel |
| `joker` | Joker / Джокер | item | bonus | rare | Works as any common activatable item from the season catalog. | Excel |
| `philosophers_stone` | Philosopher's Stone / Философский камень | item | bonus | rare | Turns your common bonus item into another common one of your choice. | Excel |
| `thief_glove` | Thief's Glove / Воровская перчатка | item | bonus | epic | Take a random bonus item from the chosen player. | Excel |
| `invisibility` | Invisibility / Невидимость | effect | bonus | common | Until your next roll you cannot be targeted. | Excel |
| `chain` | Chain / Цепь | effect | penalty | common | Until your next roll you cannot use items. | Excel |
| `tax` | Tax / Налог | effect | penalty | common | Discard one bonus item of your choice; with none — 1 cell back. | Excel |
| `mark` | Mark / Метка | effect | penalty | common | Until your next roll, directed actions against you pierce ordinary protection. | Excel + «Разбитая броня» |
| `one_chance` | One Chance / Один шанс | effect | penalty | common | If you drop your next game, the penalty wheel spins as well. | Excel |
| `pickpocket` | Pickpocket / Карманник | effect | penalty | rare | A random bonus item of yours goes to a random rival. | Excel + «Обмен судьбой» |
| `curse_of_greed` | Curse of Greed / Проклятие жадности | effect | penalty | rare | Until the end of your next game you may hold one bonus item; the rest burn. | Excel |
| `overload` | Overload / Перегруз | effect | penalty | rare | Choose: discard two bonus items, or your next passed game moves at most 3; it waits through drops. | Excel |
| `curse_echo` | Curse Echo / Эхо проклятия | effect | penalty | rare | The next penalty effect you receive fires twice. | Excel |
| `curse` | Curse / Проклятие | effect | penalty | rare | Until the end of your next game you receive no bonus items. | Excel |

`core` after wave B holds 63 entries: the 59 of the starter set it now covers,
the effect `heavy_boots` kept as «Тяжёлый шаг» / Heavy Step, and three
handouts — `magnet_pull`, `fate_roll` and `treasure_hunt` «Поиск сокровищ» /
Treasure Hunt.

### Wave C — 18

As shipped (session 38): the provisional rarities held — by strength every
entry sits at or below them, and the rarer ones mark what is special. The
items that pick for the next game or open a choice work through handouts, as
«Магнит» and «Карта сокровищ» do: an item acts when it is used, and the next
game is an effect's — one that remembers the pick (§6.16) and lasts the
holder's next game. Each is used at any time; used during a game, it shapes
the game after it. «Старое железо» keeps to games released in 2009 or earlier
— a span's bounds are inclusive, so "before 2010" is "2009 or earlier" — a
parameter (`year`) a season may tune. The six conditions carry
`game_condition`, and so does «Иммунитет»: a season that switches conditions
off switches it off too. The pool's penalties carry `game_pool`, as the items
and their handouts do. «Иммунитет» waits for the first game that would get
conditions and is spent on it (`triggers`, 1): for the next game alone it
would never meet one — a condition comes with a landing and acts on the next
game, as the immunity would (the owner's call at the wave C gate, session
39).

| Slug | Name (en / ru) | Kind | Character | Rarity | Rule | Origin |
| --- | --- | --- | --- | --- | --- | --- |
| `genre_veto` | Genre Veto / Вето жанра | item | bonus | common | Exclude one genre from your next roll — through the handout «Жанр под вето». | Excel |
| `second_chance` | Second Chance / Второй шанс | item | bonus | common | Next roll offers two games — you pick one; through the handout «Выбор из двух». | Excel |
| `favourite` | Favourite / Любимчик | item | bonus | common | The chosen game from the pool gets triple weight in your next roll — through the handout «Любимая игра». | Excel |
| `game_reroll` | Game Reroll / Переролл игры | item | bonus | rare | Drop the current game and get a new one — no judge request, no season limit spent. | Excel |
| `three_doors` | Three Doors / Три двери | item | bonus | rare | Next roll offers three games — you pick one; through the handout «За дверями». | Excel |
| `genre_pick` | Genre Pick / Выбор жанра | item | bonus | rare | Next game is rolled from the chosen genre only — through the handout «Избранный жанр». | Excel |
| `era_pick` | Era Pick / Выбор эпохи | item | bonus | rare | Next game is rolled from the chosen decade only — through the handout «Избранная эпоха». | Excel |
| `postponed_game` | Postponed Game / Отложенная игра | item | bonus | rare | Decline the current game: it returns to you exactly two rolls later. | Excel |
| `immunity` | Immunity / Иммунитет | effect | bonus | common | The next game that would get completion conditions gets none: it waits for that game and is spent on it. | Excel; waits (the owner's call at the gate) |
| `hard_mode` | Hard Mode / Сложный режим | effect | penalty | common | Next game on Normal difficulty or higher. | Excel |
| `no_guides` | No Guides / Никаких гайдов | effect | penalty | common | Next game without walkthroughs, wikis or hints; technical fixes are allowed. | Excel |
| `clean_start` | Clean Start / Чистый старт | effect | penalty | common | Next game from a new save. | Excel |
| `no_dlc` | No DLC / Без DLC | effect | penalty | common | Next game without add-ons. | Excel |
| `main_story` | Main Story Only / Основной сюжет | effect | penalty | common | Next game counts for the main campaign only. | Excel |
| `greedy_explorer` | Greedy Explorer / Жадный исследователь | effect | penalty | common | In the next game — at least three side quests or levels. | Excel |
| `genre_trial` | Genre Trial / Испытание жанром | effect | penalty | common | Next game must not share a genre with your previous passed game. | Excel |
| `old_hardware` | Old Hardware / Старое железо | effect | penalty | rare | Next game released in a set year or earlier (default 2009). | Excel |
| `uncharted_territory` | Uncharted Territory / Незнакомая территория | effect | penalty | rare | Next game from a genre you have not passed a game in this season. | Excel, genre instead of series |

`core` after wave C holds 87 entries: the 77 of the starter set it now covers,
the effect `heavy_boots` kept as «Тяжёлый шаг» / Heavy Step, and nine
handouts — `magnet_pull`, `fate_roll`, `treasure_hunt`, and wave C's
`vetoed_genre` «Жанр под вето» / Vetoed Genre, `pick_of_two` «Выбор из двух» /
Pick of Two, `favoured_game` «Любимая игра» / Favoured Game, `behind_doors`
«За дверями» / Behind the Doors, `chosen_genre` «Избранный жанр» / Chosen
Genre and `chosen_era` «Избранная эпоха» / Chosen Era. On its wheels the six
conditions take 24.1 % of penalty spins.

### Wave D — 4

As shipped (session 42): the provisional rarities held — by strength every
entry sits at or below them: «Мина» (1.9) and «Пружина» (1.0) common,
«Капкан» rare at 1.4 — the rarer one marks what is special, a spin of the
penalty wheel in place of the cell —, «Корона» epic at 6, the most an epic
may be. The three objects are used at any time on a free cell their user
picks (§6.18) and act on whoever enters it first, their owner too, on a move
back as well: there a mine throws the mover 2 cells further back and a spring
carries them 2 further. They carry `board` and `movement`; «Капкан» `wheel`
too, as the items that spin one do. «Корона» is a passive item without
charges: +1 to a passed game's result, as every dice rule since wave A
(§6.8), for as long as it stays with its holder (§6.19); it carries `dice`.
The simulator places no objects, so their worth is held to the play model;
«Корона» is measured — 5.4 cells in play against its power of 6.

| Slug | Name (en / ru) | Kind | Character | Rarity | Rule | Origin |
| --- | --- | --- | --- | --- | --- | --- |
| `mine` | Mine / Мина | item | bonus | common | Board object: stops the move and throws the player 2 cells back. | Excel |
| `spring` | Spring / Пружина | item | bonus | common | Board object: the move continues 2 more cells. | Excel |
| `snare` | Snare / Капкан | item | bonus | rare | Board object: stops the move; the penalty wheel spins instead of the cell. | Excel |
| `crown` | Crown / Корона | item | bonus | epic | While held: +1 to a passed game's result. A rival who ends a regular move on your cell takes it. One in the season. | Excel; on passed games only (§6.8) |

`core` after wave D holds 91 entries: the 81 of the starter set it now covers,
the effect `heavy_boots` kept as «Тяжёлый шаг» / Heavy Step, and the nine
handouts of waves A–C. On its bonus wheel the three objects take 7.4 % of
spins and «Корона» 0.5 % — once: no wheel offers a second (§6.19).

### After events — 2

| Slug | Name (en / ru) | Kind | Character | Rarity | Rule | Origin |
| --- | --- | --- | --- | --- | --- | --- |
| `black_card` | Black Card / Чёрная карта | item | bonus | epic | Cancels the active global event. | Excel |
| `white_card` | White Card / Белая карта | item | bonus | epic | Restarts the last finished global event. | Excel |
