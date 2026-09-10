# Items, Effects & Events — concept and delivery plan

> Working design document for the IEE feature set (Items / Effects / Events).
> Status: **draft for review** — §12 is a decision menu that must be
> answered before implementation starts; §15 is the tracer-bullet trio to build
> first. Read [`AGENTS.md`](./AGENTS.md) §2 (golden rules) and
> [`DESIGN.md`](./DESIGN.md) before touching code.

---

## 1. Scope and vocabulary

Three new entities enter the game loop. They are **not** three flavours of the
same thing and must not be collapsed into one table or one editor.

| Entity | What it is | Who authors it | Lives in inventory? | Ticks? |
| --- | --- | --- | --- | --- |
| **Item** (artifact) | A thing a player *holds* and later *spends*. Active (used on a target) or passive (works while held). | Developer (code) | Yes | Only while held |
| **Effect** (status) | A condition *applied to* a player. Positive or negative. Fires on game-loop hooks, expires. | Developer (code) | No — it is a status | Yes |
| **Event** (meta-challenge) | A text challenge assigned to a player: "do X, prove it". Resolved by moderation. | **Admin (data)** | No — an assignment | No, but may have a deadline |

The distinction that drives every decision below: **items and effects are
behaviour, events are content.** Behaviour belongs in code. Content belongs in
the database.

Terminology used throughout:

- **polarity** — `positive | negative`. Decides whether a thing can drop from a
  `bonus` cell or a `penalty` cell.
- **catalog** — the full developer-authored set of items/effects (code).
- **season pool** — the subset an admin enabled for one season, with tuning.
- **grant** — the act of putting an item in an inventory / applying an effect.
- **hook** — a named point in the game loop where effects get a say.

---

## 2. Verdict on the proposed approach

### 2.1 What is right

- **Hardcoding items and effects instead of building a constructor.** Correct,
  and not a compromise — it is the better engineering answer. A visual
  rule-builder for game mechanics is a programming language with a worse UI; it
  costs 5× the effort and produces mechanics nobody can unit-test. The codebase
  already proves the pattern works twice over: `CELL_EFFECTS`
  (`lib/engine/board/cell-effects/registry.ts`) and `GAME_POOL_TEMPLATES`
  (`lib/modules/catalog/pool/templates.ts`).
- **Keeping the catalog out of the database.** Right for the same reason: a
  catalog entry is inseparable from the function that implements it. Splitting
  the two across code and a table guarantees they drift.
- **A global admin tab for templates, then a per-season selection step.**
  Correct separation, and it maps onto the existing season wizard
  (`SEASON_STAGES` in `lib/modules/catalog/pool/season-setup.ts`).
- **Polarity deciding bonus-cell vs penalty-cell drops.** Simple, readable by
  players, and it needs no new cell types — `bonus`, `penalty` and `event`
  already exist in `cellTypeEnum`. **Zero enum migration.**
- **Server-side wheel with logging of grants and uses.** Non-negotiable and
  already the house rule (golden rule #3).

### 2.2 What is wrong, or not yet thought through

1. **"Store them in JSON instead of the DB, to avoid migrations" — half right,
   and the wrong half is the format.** If the JSON file lives in the repo,
   changing it still requires a commit and a deploy, so it buys you *nothing*
   over a `.ts` file, while costing you: compile-time type checking, IDE
   autocomplete, refactor safety, and the ability to put a function next to its
   data. An item without its implementation function is useless, and you cannot
   put a function in JSON. **Use TypeScript modules, not JSON.**

2. **"Avoid migrations" is being applied to the wrong layer.** Migrations are
   not avoided by choosing a file format — they are avoided by keeping mutable
   *shapes* out of columns. The correct three-tier split is in §3. Note that
   **player inventory and active statuses cannot avoid tables**: they are
   concurrent, queryable, per-player runtime state with foreign keys and an
   audit trail. Trying to keep them in a JSON blob will produce lost writes the
   first time two requests touch one player.

3. **"Effects fire under different conditions" is the entire difficulty of this
   feature, and the concept does not define it.** "Different conditions" is
   where a hardcoded system either stays sane or turns into the constructor you
   just decided not to build. This must be a **closed, enumerated set of
   hooks** (§6). If it isn't fixed up front, every new effect becomes an
   edit to the game loop.

4. **The wheel is described as a UI element; it is a transaction.** If the
   client spins and then reports the result, a page refresh is a free reroll.
   The outcome must be decided, persisted and returned by the server inside the
   same transaction as the move — the animation replays a decision already
   made. This is exactly how dice already work.

5. **No lifetime model.** Effects need duration, and there is no scheduler in
   this project. Expiry must be **lazy** (evaluated on read/at the next
   resolve), never a cron job.

6. **No stacking rules.** What happens when a player already has the effect
   being applied? Refresh, stack, or reject? Undefined behaviour here is how
   you get a player with 7 shields.

7. **No mid-season mutation policy.** An admin disables an item that is already
   sitting in twelve inventories. What happens to it? (Recommendation in §5.4:
   snapshot on grant; disabling stops future drops only.)

8. **PvP targeting is the highest-risk element in the whole design and is
   described in one sentence.** "Pick any other player" plus negative items is,
   socially, the feature most likely to make participants quit. It needs
   consent boundaries, protection windows, and mandatory public logging (§8.3).

9. **i18n was not budgeted.** Golden rule #6: every UI string goes through
   `en/ru/uk` dictionaries. Thirty items and thirty effects with a name and a
   description each is **~360 dictionary entries**. The catalog therefore stores
   *i18n keys*, not literal text. (`GAME_POOL_TEMPLATES` currently hardcodes
   English labels — do not copy that; it is existing debt, not a pattern.)

10. **Empty-pool cases undefined.** Player lands on a penalty cell and every
    negative entry is disabled, capped out, or on cooldown. What drops? Silent
    failure is unacceptable in a scored competition (§7.4).

11. **Idempotency of item use.** A double-clicked "use" button must not consume
    two charges. Needs a guard, not hope.

---

## 3. Storage: the three-tier answer

This is the central architectural decision. Each tier is chosen so that the
thing most likely to change is the thing cheapest to change.

| Tier | Contents | Where | Cost to change |
| --- | --- | --- | --- |
| **1. Catalog** (behaviour) | Item/effect keys, polarity, default params, implementation functions, icon paths, i18n keys | **TypeScript** in `lib/engine/iee/` | Commit + deploy. No migration. |
| **2. Season tuning** (config) | Which entries are enabled, weights, caps, cooldowns, param overrides, global switches | **JSONB** `seasons.config.iee`, validated by Zod | Admin UI. **No migration, no deploy.** |
| **3. Runtime state** | Inventories, active statuses, event assignments, grant/use history | **Postgres tables** | Migration (once, at Phase 2) |

Consequences worth stating plainly:

- Adding a **new item or effect** = one TS file + 3 dictionary entries + one
  icon. **No migration.** This is what "hardcoded" should mean.
- Retuning a **live season** = editing JSONB through the admin UI. No deploy.
- Existing seasons stay valid because `SeasonConfigSchema` uses `.default()`
  per branch — an old `config` with no `iee` key parses into the default.
  **Verify this in Phase 0**; it is the whole reason tier 2 is free.
- Only **three new tables**, added once, in one migration.

### 3.1 Rejected alternative: inventory as JSONB on `season_players`

Tempting (one fewer table) and wrong:

- Concurrent writes (player uses an item while an admin grants one) do
  read-modify-write on the same blob → lost updates.
- No way to answer "who currently holds a Shield?" without a full scan.
- No foreign keys, no per-row timestamps, no history — but the requirement
  explicitly asks for logs of *when* and *on whom*.

The migration cost is one-time. The blob cost is permanent.

---

## 4. Catalog shape (tier 1)

```
lib/engine/iee/
  types.ts            # Item/Effect definitions, hook contexts, patches
  items/
    registry.ts       # ITEMS: Record<ItemKey, ItemDef>
    <item-key>.ts     # one file per item (definition + implementation)
  effects/
    registry.ts       # EFFECTS: Record<EffectKey, EffectDef>
    <effect-key>.ts
  selection/
    pick.ts           # pure weighted wheel selection (rng injected)
    gates.ts          # eligibility predicates
  resolve/
    hooks.ts          # hook dispatch + patch reduction
```

`lib/engine/` stays pure — no `next/*`, `react`, `drizzle-orm`, `pg` (enforced
by ESLint). That is a feature, not a constraint: it makes the entire drop and
resolution logic unit-testable with an injected `rng`, exactly like `dice/`.

```ts
export interface ItemDef {
  key: ItemKey;                        // stable, never renamed — it is persisted
  polarity: "positive" | "negative";
  rarity: "common" | "rare" | "epic" | "legendary";  // → default weight
  icon: string;                        // "/iee/items/<key>.webp"
  i18n: { name: string; description: string };       // dictionary keys
  usage: {
    mode: "active" | "passive";
    window: "anytime" | "before_roll" | "on_open_roll"; // when it may be used
    target: "self" | "other" | "any" | "none";
    charges: number;                   // default; overridable per season
    consumedOnUse: boolean;
  };
  defaults: Record<string, number | string | boolean>;  // params
  apply(ctx: ItemUseContext): ItemUseResult;           // pure
}

export interface EffectDef {
  key: EffectKey;
  polarity: "positive" | "negative";
  rarity: Rarity;
  icon: string;
  i18n: { name: string; description: string };
  stacking: "unique" | "refresh" | "stack";   // §5.3
  duration:
    | { kind: "permanent" }
    | { kind: "rolls"; value: number }         // N resolved rolls
    | { kind: "charges"; value: number };      // N triggers
  priority: number;                            // hook ordering, low → first
  hooks: Partial<Record<HookName, HookFn>>;    // pure
}
```

**Rule: `key` is a persisted identifier.** Once shipped it is never renamed,
only deprecated (`enabled: false` at catalog level), because inventory rows and
event-log payloads reference it forever.

---

## 5. Runtime model (tier 3)

### 5.1 Tables

```
player_inventory
  id, season_player_id → season_players(id) ON DELETE CASCADE
  item_key text                  -- catalog key, snapshotted
  params jsonb                   -- resolved params at grant time (§5.4)
  charges_left int
  state text                     -- held | used | consumed | expired | revoked
  source text                    -- cell_bonus | cell_penalty | event_reward | item | admin
  source_move_id → moves(id)
  acquired_at, used_at
  idx (season_player_id, state)

player_effects
  id, season_player_id → season_players(id) ON DELETE CASCADE
  effect_key text, params jsonb, polarity text
  charges_left int null
  expires_after_roll_seq int null   -- lazy expiry, see §5.5
  state text                        -- active | expired | cleansed | revoked
  applied_by_season_player_id → season_players(id) ON DELETE SET NULL  -- who cast it
  source text, source_move_id → moves(id)
  applied_at, ended_at
  idx (season_player_id, state)

player_events                       -- assignments of admin-authored challenges
  id, season_player_id → ... CASCADE
  event_template_id → event_templates(id)
  status text                       -- assigned | submitted | approved | rejected | expired
  proof text null, admin_note text null
  assigned_at, due_at null, resolved_at, resolved_by → users(id)

event_templates                     -- global, admin CRUD (tier 3 content)
  id, key text unique, title, description_md,
  reward jsonb                      -- { points?, itemKey?, effectKey? }
  requires_proof bool, default_deadline_hours int null,
  is_active bool, created_by, created_at
```

Four tables, not three, because `event_templates` is admin-authored content.
This is the deliberate asymmetry of the whole design: **items/effects = code,
events = data.**

### 5.2 What needs no migration

- `cellTypeEnum` — `bonus`, `penalty`, `event` already exist.
- `event_log` — `event_type` is `text`; new types need only the `EventType`
  union, feed rendering and three dictionaries (`AGENTS.md` §7).
- `seasons.config` — JSONB, guarded by Zod defaults.
- `ledger_entries` — reuse for any point change an item/effect causes. **Do not
  invent a second currency path.**

### 5.3 Stacking policy (per effect)

- `unique` — already active → the new grant is rejected; the wheel re-picks (or
  falls through to the `nothing` slice — decide once, §12 Q6).
- `refresh` — duration/charges reset to full; no second row.
- `stack` — a second row is created; params accumulate at hook time.

### 5.4 Snapshot-on-grant

At grant time, resolve `catalogDefaults → seasonParamOverrides → params` and
**write the result into the row**. Consequences:

- An admin disabling or retuning an entry mid-season affects **future drops
  only**. Items already held keep the deal the player was given.
- A catalog `key` that disappears in a later release leaves readable history.
- Add `revoked` as an explicit admin action when a genuine takeback is needed —
  visible in the audit log, never silent.

### 5.5 Lazy expiry

There is no scheduler. Introduce a monotonic **per-player roll sequence**
(count of resolved rolls; derivable from `game_rolls`, or a counter column) and
store `expires_after_roll_seq`. Every read of "active effects" filters expired
rows and, inside the resolve transaction, marks them `expired` and emits a feed
event. Time-based deadlines (events) use `due_at` with the same lazy check.

---

## 6. Hook model — how effects actually fire

The current turn flow (`AGENTS.md` §5) is:

```
rollAction → rollNewGame → resolveAction → resolveGameRoll
           → resolveMovement (engine) → applyCellEffect + normalizePosition
```

Effects get a say at a **closed set of named hooks**. Adding an effect must
never mean editing the loop; only adding a hook does.

| Hook | Fires in | An effect may |
| --- | --- | --- |
| `beforeGameRoll` | `rollNewGame`, before `rollRandomGame` | bias/constrain the game pool (forced genre, min metacritic) |
| `onRollCreated` | after the game is picked | annotate the roll (double-or-nothing) |
| `beforeMovement` | `resolveGameRoll`, before `resolveMovement` | change dice count/sides, force outcome multipliers |
| `afterMovement` | after `resolveMovement` | add/subtract steps, invert direction, clamp |
| `beforeCellEffect` | before `applyCellEffect` | **veto** or replace the landing effect (shield) |
| `afterCellEffect` | after | scale the balance delta (double bonuses) |
| `onOutcome` | on `passed` / `dropped` | reactive grants (lose an item on drop) |
| `onTick` | end of the resolve transaction | decrement durations, expire, cleanse |
| `passive` | read-time, any of the above | contribute a static modifier |

### 6.1 Composition — the part that breaks if left implicit

Multiple effects hit one hook. Resolution must be deterministic:

1. Sort by `priority`, then `applied_at`, then `id`. Never rely on query order.
2. Each hook returns a **patch**, never a mutation:
   - **additive** fields (`stepsDelta`, `balanceDelta`, `diceCountDelta`)
     accumulate;
   - **override** fields (`forcedPosition`, `forcedOutcome`) are taken from the
     highest-priority patch that sets them, and a conflict is logged;
   - **veto** fields (`skipCellEffect`, `immune`) are boolean-OR.
3. Reduce, clamp (`normalizePosition`, `balance ≥ 0`), then persist.

This reducer is pure and belongs in `lib/engine/iee/resolve/hooks.ts` with unit
tests. It is the single most important thing to get right.

### 6.2 Signature impact

`resolveMovement` currently takes `MovementInput`. It gains an optional
`modifiers` field (defaulted) rather than being called differently — old call
sites and existing engine tests keep compiling.

---

## 7. Drops and the wheel

### 7.1 Server-authoritative sequence

Inside the **existing** `resolveGameRoll` transaction, after the landing cell is
known:

1. Landing cell is `bonus` → positive pool; `penalty` → negative pool.
2. `pickWheelOutcome({ pool, polarity, playerState, seasonState, rng })` — pure,
   in the engine.
3. Persist the grant (`player_inventory` / `player_effects`), the `moves` row,
   the ledger delta and the `event_log` entries — **one transaction**.
4. Return `{ outcome, slices[] }` to the client.
5. The client animates a wheel that lands on the already-decided result.

Returning `slices[]` (the real weighted slice list) lets the UI render an
**honest** wheel showing true odds instead of a decorative one.

### 7.2 Selection algorithm

```
candidates = pool entries where enabled && polarity matches
           filtered by gates (§7.3)
if candidates is empty          → fallback (§7.4)
weight(e) = e.weight                       // rarity-derived, admin-overridable
          × catchUpMultiplier(playerRank)  // optional, §9.5
slices = candidates + { kind: "nothing", weight: pool.nothingWeight }
pick    = weighted choice using injected rng()
```

### 7.3 Gates (evaluated per candidate, per drop)

`minPosition` · `unlockAfterMove` · `maxPerSeason` · `maxPerPlayer` ·
`cooldownRolls` · duplicate policy (§5.3) · target-availability (an
"apply to another player" item is pointless in a one-player season).

### 7.4 Empty pool — must be explicit

Priority order, decided once and documented in the rules page:

1. Fall back to the cell's legacy numeric behaviour (`config.amount` — today's
   `bonus`/`penalty` effect). **Recommended**: nothing regresses.
2. Grant the `nothing` slice and log it.
3. Never: silently do nothing with no log.

---

## 8. Player-facing behaviour

### 8.1 Inventory

Lives on `/dashboard`, mirrored read-only on the public profile. Each entry:
icon, name, description, charges, source, acquired-at. Actions: **Use**
(opens target picker when `target !== "self"`), **Details**.

### 8.2 Statuses

A strip of active effects with icon, remaining duration and origin ("cast by
@player"). Positive and negative are visually distinct — `DESIGN.md` accent
rules, not colour alone (accessibility).

### 8.3 Targeting another player — guardrails

The socially dangerous part. Minimum set:

- Target list = **active** participants of the same season only. Finished,
  eliminated, withdrawn and blocked users are not targetable.
- `pvpProtectionMoves` — new participants are untargetable for their first N
  moves.
- Every use is **public** in the feed: who, what, on whom, when. No anonymous
  hits. This is both the requested logging and the main deterrent to abuse.
- A season master switch `allowTargetingOthers` so a host can run a PvE season.
- Design rule, not code: **every negative effect ships with a counter** (a
  cleanse item, a shield, or a natural expiry short enough to survive). A
  negative-only catalog is a frustration generator.

### 8.4 Idempotency

`useItem` takes the inventory row id and updates it with a state guard in the
`WHERE` clause (`state = 'held' AND charges_left > 0`). Zero rows updated →
`GameLoopError("itemAlreadyUsed")`. Never read-then-write.

---

## 9. Per-season tuning surface (tier 2)

Stored at `seasons.config.iee`, Zod-validated, defaulted.

### 9.1 Global switches

| Key | Meaning |
| --- | --- |
| `enabled` | master switch for the whole IEE subsystem |
| `inventorySize` | max held items (0 = unlimited); overflow policy §12 Q7 |
| `allowTargetingOthers` | PvP master switch |
| `pvpProtectionMoves` | immunity window for new participants |
| `revealDropsInFeed` | public feed vs. private-until-used |
| `nothingWeight` | weight of the "nothing" wheel slice |
| `wheelSlices` | visual slice count (cosmetic only) |
| `catchUp` | `{ enabled, maxMultiplier }` — §9.5 |

### 9.2 Per-entry tuning (the requested fine-grained control)

For **each** enabled item/effect:

| Key | Purpose |
| --- | --- |
| `enabled` | the activity flag from the brief |
| `weight` | relative drop weight within its polarity pool |
| `polarityOverride` | move an entry to the other pool for this season |
| `maxPerSeason` | hard cap on total drops across all players |
| `maxPerPlayer` | cap per participant (stops shield-hoarding) |
| `cooldownRolls` | not eligible again for N global resolved rolls |
| `minPosition` | only drops past cell N (late-game entries) |
| `unlockAfterMove` | no drops before the season's Nth move (quiet opener) |
| `paramOverrides` | numeric overrides (`amount`, `steps`, `charges`, …) |
| `durationOverride` | override effect duration |
| `targetOverride` | tighten `self`/`other`/`any` |

### 9.3 UX: rarity first, numbers second

Do **not** put thirty weight inputs on a screen. Default UI = a rarity picker
per entry (`common → 100`, `rare → 40`, `epic → 15`, `legendary → 5`); an
"Advanced" disclosure exposes the raw number and the gates. Rarity is a
presentation shortcut over `weight`, not a second concept in the data model.

### 9.4 Probability preview (high value, low cost)

Because selection is a pure function, the admin screen can render the **live
computed drop table** (`Shield — 12.4 %`) and a "simulate 1 000 spins" button
that runs the real picker with a seeded rng. This is the single cheapest
feature in this document and it prevents shipping a mis-tuned season. Build it
in Phase 4, not "later".

### 9.5 Catch-up weighting (optional, recommended)

Multiply weights by a factor derived from the player's rank: the trailing
player draws better positives, the leader draws better negatives. Bounded by
`maxMultiplier`, off by default. Keeps a long season competitive without any
new mechanic. Must be disclosed on the rules page — hidden rubber-banding is
worse than none.

### 9.6 Season presets

Mirror `GAME_POOL_TEMPLATES`: `Chaos` / `Light touch` / `PvE only` /
`Hardcore`. One click fills the whole IEE block. Same
`applyTemplate` / `revertTemplate` / snapshot mechanics as
`lib/modules/catalog/pool/season-setup.ts` — reuse that code, do not rewrite it.

---

## 10. Admin surfaces

### 10.1 Global catalog tab (`/admin/catalog` or a new top-level nav entry)

Three sub-tabs:

- **Items** — read-only browser of the code catalog: icon, key, polarity,
  rarity, usage mode, target, description, and "used in N seasons". Read-only
  is correct and should be stated in the UI, so nobody files a bug about the
  missing Edit button.
- **Effects** — same.
- **Events** — **full CRUD**, because events are content: title, markdown
  description, reward, proof requirement, deadline, active flag. Every mutation
  → `logAdminAction` (golden rule #5).

### 10.2 Season wizard stage

`SEASON_STAGES` becomes `["templates", "dice", "board", "pool", "iee", "rules"]`.

One stage, three sections (items / effects / events), not three stages — the
existing stage machinery (confirm, reset-to-defaults, dirty tracking,
`localStorage` progress) is per-stage, and splitting into three multiplies that
bookkeeping for no user benefit. Inside the stage: bulk enable/disable per
polarity, per-entry rows with the rarity picker, the probability preview from
§9.4, and pointed additions from the catalog list.

**`resetStage(cfg, "iee")` must be implemented** in `season-setup.ts` alongside
the others, with tests — the switch statement is exhaustive (`never` guard), so
this is compiler-enforced anyway.

---

## 11. Logging

Two tiers, per golden rule #5, written **inside** the same transactions.

New `EventType` members (union + feed rendering + en/ru/uk `feed.ts`):

```
item_granted · item_used · item_expired · item_revoked
effect_applied · effect_expired · effect_cleansed
event_assigned · event_submitted · event_approved · event_rejected
wheel_spun            (optional; drop if the feed gets noisy)
```

`item_used` payload carries `{ itemKey, targetSeasonPlayerId, targetUsername }`
— the "when and on whom" requirement.

Admin audit (`logAdminAction`): event-template CRUD, manual grants and
revocations, mid-season IEE retuning. Add `audit-meta.ts` entries so the audit
viewer renders them.

**Feed filters**: `AGENTS.md` §10 warns the public feed filter tabs are fixed
(rolls/passes/drops/moves/joins). New types land under "All" until a filter is
added — add an "Items & effects" tab in Phase 10 or accept the dilution
knowingly.

---

## 12. Decisions — answer sheet

Every line below changes a schema, a contract or a rule, so guessing is
expensive. Pick one option per decision.

- **★** = recommendation, with the reason on the same line.
- **`P<n>`** = the phase this blocks (§14). Anything marked `P0`–`P3` must be
  answered before implementation starts.
- Fill in the answer sheet at the end (§12.9) and commit it — it becomes the
  changelog of *why* the system looks the way it does.

### 12.1 Block A — Architecture

**A1 — Catalog format.** `P0`
- **(a) ★ TypeScript modules under `lib/engine/iee/`** — compile-time types,
  autocomplete, refactor safety, and the implementation function sits next to
  its data. An item without its function is not an item.
- (b) JSON files + a Zod loader — loses all of the above and still needs a
  commit and a deploy. Only wins if non-developers edit the catalog, which
  is not the case here.
- (c) DB table with admin CRUD — rejected in §2.1.

**A2 — Where inventories and statuses live.** `P3`
- **(a) ★ Dedicated tables** — foreign keys, indexes, per-row history, and no
  lost updates when two requests touch one player.
- (b) JSONB column on `season_players` — one fewer table, but read-modify-write
  races, no "who currently holds X?" query, no per-item timestamps.

**A3 — One table or two for items and effects.** `P3`
- **(a) ★ Two tables** — different lifecycles (held-and-spent vs applied-and-
  ticking) and genuinely different columns.
- (b) One polymorphic `player_modifiers` + `kind` — fewer joins, but half the
  columns become nullable and every query grows a `kind` filter.

**A4 — Icon pipeline.** `P0`
- **(a) ★ Static `.webp` under `public/iee/…`, committed with the catalog** —
  cacheable, versioned with the code, no upload UI to build.
- (b) base64 in a column (the `users.avatarUrl` pattern) — does not scale to a
  catalog and bloats every row that reads it.
- (c) Admin upload to disk/S3 — needs storage configuration; defer past v1.

**A5 — Where grant logic lives.** `P6`
- **(a) ★ Pure selection + hooks in `lib/engine/iee/`, DB writes in a new
  `lib/modules/game/service/iee.ts`** — keeps `resolveGameRoll` from growing.
- (b) Inline in `resolveGameRoll` — that function is already ~250 lines and is
  the highest-risk file in the repo.

### 12.2 Block B — Wheel and drops

**B1 — When does the wheel spin?** `P6`
- **(a) ★ On every landing on a `bonus` / `penalty` cell** — no new cell flag,
  and the legacy numeric `amount` behaviour survives as the empty-pool fallback.
- (b) Only on cells flagged `wheel: true` in `config` — finer control, one more
  field in the board editor and in the generator.
- (c) Season-level switch `wheelOn: "all" | "flagged"` — both, more code.

**B2 — One pool or two?** `P1`
- **(a) ★ One mixed pool per polarity** — a bonus cell may yield an item *or* an
  effect; the season tuning decides the mix through weights.
- (b) Items from bonus cells, effects from penalty cells only — very readable
  for players, but halves the design space and makes positive effects
  unreachable.
- (c) Per-cell choice — most flexible, most UI.

**B3 — Can one spin yield two things?** `P1`
- **(a) ★ No — exactly one outcome per spin.** Keeps the wheel honest and the
  transaction simple.
- (b) Yes, "jackpot" slices — needs a compound slice type everywhere.

**B4 — A "nothing" slice?** `P1`
- **(a) ★ Yes, weight configurable per season, default 0** — lets a host thin
  out drops without disabling individual entries.
- (b) No, every spin drops something.

**B5 — Empty-pool fallback.** `P1`
- **(a) ★ Fall back to the cell's legacy numeric `amount`** — nothing regresses,
  and a mis-tuned season still plays.
- (b) Grant "nothing" and log it.
- (c) Raise an error — never; it breaks a live turn.

**B6 — A `unique` effect drops on a player who already has it.** `P1`
- **(a) ★ Re-pick once, then "nothing"** — one retry, bounded, no loop.
- (b) Straight to "nothing".
- (c) Treat as `refresh`.

**B7 — What does `polarity` actually mean?** `P0` — *the one that is easy to get
wrong.*
- **(a) ★ Polarity = which cell pool the thing drops from**, plus a design
  convention: items lean positive, effects carry most of the negative pool.
  A penalty cell that hands you a usable weapon is not a penalty — the
  punishment is a status applied to *you*.
- (b) Polarity = good/bad for the holder, drop pool derived from it — breaks on
  the first offensive item (bad for the target, good for the holder).
- (c) Two independent fields (`dropPool` + `holderBenefit`) — honest, but
  doubles the config surface and the admin has to reason about both.

### 12.3 Block C — Items

**C1 — Passive items.** `P8`
- **(a) ★ Work automatically while held.** No extra UI, no rules to explain.
- (b) Equipment slots (N per player) — creates real decisions, but adds a slot
  UI, slot rules and a migration field.

**C2 — Item lifetime.** `P3`
- **(a) ★ Survive to the end of the season.**
- (b) Expire after N rolls — adds a second expiry system for little gain.

**C3 — Inventory cap.** `P3`
- **(a) ★ Configurable, default 6; an overflowing drop is blocked and logged** —
  the player sees why they got nothing.
- (b) Unlimited — hoarding, and an unbounded UI list.
- (c) Overflow auto-discards the oldest — silent loss of something earned;
  expect complaints.

**C4 — When may an active item be used?** `P8`
- **(a) ★ Declared per item in the catalog (`usage.window`), default
  `anytime`** — a "+2 steps" item can be restricted to `before_roll` so it
  cannot be used after the dice are visible.
- (b) Always anytime — opens the after-the-dice exploit.
- (c) Only between rolls — safe, but kills reactive counter-play.

**C5 — May an item declared `target: "other"` be used on yourself?** `P8`
- **(a) ★ No — enforced server-side, not just hidden in the UI.**
- (b) Yes.

### 12.4 Block D — Effects

**D1 — Duration unit.** `P0`
- **(a) ★ Resolved rolls, or charges** — both are lazily evaluated; no scheduler
  exists in this project and none should be introduced for this.
- (b) Wall-clock time — requires a job runner you do not have.
- (c) Board moves — nearly the same as rolls; pick one and only one.

**D2 — Default stacking policy.** `P0`
- **(a) ★ Declared per effect, catalog default `unique`** — the safe default;
  `refresh` and `stack` are opt-in per entry.
- (b) Always `refresh`.

**D3 — Hook set.** `P0` — *freeze this before writing any item.*
- **(a) ★ Declare all nine hooks now (§6), implement only what the tracer
  needs.** Adding a hook later is an edit to the game loop; adding an effect
  to an existing hook is not.
- (b) Start with three or four and extend as needed — guarantees rework, and
  the rework lands in the riskiest file in the repo.

**D4 — What happens to effects on season reset?** `P3`
- **(a) ★ Wiped with participants (cascade)** — consistent with the existing
  reset semantics in `AGENTS.md` §5.
- (b) Preserved across resets.

**D5 — Who can remove a negative effect?** `P9`
- **(a) ★ A counter-item, natural expiry, and a judge (audited).**
- (b) Natural expiry only — no counter-play, and no recourse when something
  goes wrong on event day.

### 12.5 Block E — PvP targeting

**E1 — Default for `allowTargetingOthers`.** `P8`
- **(a) ★ Off for the first season, switched on deliberately** — ship the
  mechanic, choose when to expose it.
- (b) On by default.

**E2 — Protection window for new participants.** `P8`
- **(a) ★ N moves, default 3.**
- (b) None.
- (c) Time-based — no scheduler.

**E3 — Visibility of a hostile use.** `P8`
- **(a) ★ Always public in the feed** — it is the requested log *and* the main
  deterrent against griefing.
- (b) Anonymous — do not.
- (c) Season option — an option to hide who hit you is an option to make the
  season unpleasant.

**E4 — Who is targetable?** `P8`
- **(a) ★ Active participants of the same season only** — finished, eliminated,
  withdrawn and blocked users are excluded.
- (b) Anyone in the season.

**E5 — Repeat-targeting limits.** `P8`
- **(a) ★ None in v1; revisit after one real season** — do not pre-solve a
  social problem you have not observed.
- (b) Cooldown on hitting the same player twice.

### 12.6 Block F — Events

**F1 — Does an assigned event block the player?** `P10`
- **(a) ★ Parallel, with an optional deadline** — the game loop never stalls
  waiting on moderation.
- (b) Blocks rolling until resolved — strong pressure, but one unresponsive
  judge freezes a participant's whole season.

**F2 — Reward shape.** `P3`
- **(a) ★ `reward` jsonb: `{ points?, itemKey?, effectKey? }`** — one column,
  covers every combination, no migration when a new reward kind appears.
- (b) Points only.

**F3 — How is an event assigned?** `P10`
- **(a) ★ Randomly from the season pool on an `event` cell, plus manual
  assignment by staff.**
- (b) Random only.
- (c) Manual only — turns every event cell into an admin task.

**F4 — Proof and moderation.** `P10`
- **(a) ★ Own table `player_events`, reusing the `completion_requests`
  *pattern* and the existing moderation queue UI and pending badge.**
- (b) Reuse the `completion_requests` *table* — it is bound to `game_rolls` by
  a non-null FK; do not force events through it.

**F5 — Deadlines.** `P3`
- **(a) ★ Optional per template, lazily checked on read.**
- (b) Always required.
- (c) None.

**F6 — May the same event be assigned twice?** `P10`
- **(a) ★ Once per player per season.**
- (b) Unlimited repeats.

### 12.7 Block G — Admin surface

**G1 — Wizard layout.** `P5`
- **(a) ★ One `iee` stage with three sections (items / effects / events)** —
  the stage machinery (confirm, reset, dirty tracking, `localStorage`
  progress) is per-stage; one stage means one set of bookkeeping.
- (b) Three separate stages — triples that bookkeeping for no user benefit.

**G2 — Retuning an active season.** `P5`
- **(a) ★ Applies to future drops only; already-granted rows keep their
  snapshot** (§5.4).
- (b) Retroactive — silently rewrites deals players already made.
- (c) Locked once the season is active — safe, but you will want to fix a
  mis-tuned weight on day two.

**G3 — Manual grant / revoke by staff.** `P4`
- **(a) ★ Yes, fully audited** — you will need it the first time something goes
  wrong during a live event.
- (b) No.

**G4 — Tuning UI.** `P5`
- **(a) ★ Rarity picker by default; raw weight and gates behind "Advanced"** —
  thirty number inputs on one screen is not a usable form.
- (b) Raw numbers everywhere.

**G5 — Catch-up weighting (§9.5).** `P1`
- **(a) ★ Implement, default off, disclosed on the rules page when on.**
- (b) Do not build it.
- (c) Build it and default it on — hidden rubber-banding; worse than none.

### 12.8 Block H — Logging and i18n

**H1 — Feed granularity.** `P6`
- **(a) ★ Log grants, uses and expiries; not individual spins.**
- (b) Log everything including `wheel_spun` — drowns the feed.

**H2 — Feed filter tab.** `P12`
- **(a) ★ Add an "Items & effects" tab** — otherwise new types dilute "All"
  (`AGENTS.md` §10).
- (b) Leave everything under "All".

**H3 — Catalog text.** `P0`
- **(a) ★ i18n keys in the catalog; text in `en/ru/uk` dictionaries** — golden
  rule #6.
- (b) English literals, as `GAME_POOL_TEMPLATES` does today — that is existing
  debt, not a pattern to copy.

### 12.9 Answer sheet

```
A1 __   A2 __   A3 __   A4 __   A5 __
B1 __   B2 __   B3 __   B4 __   B5 __   B6 __   B7 __
C1 __   C2 __   C3 __   C4 __   C5 __
D1 __   D2 __   D3 __   D4 __   D5 __
E1 __   E2 __   E3 __   E4 __   E5 __
F1 __   F2 __   F3 __   F4 __   F5 __   F6 __
G1 __   G2 __   G3 __   G4 __   G5 __
H1 __   H2 __   H3 __
```

Taking every ★ gives a coherent, shippable v1 — the recommendations were chosen
to be consistent with each other, so mixing in an alternative may invalidate a
neighbouring one (notably B7 ↔ B2, and A2 ↔ A3).

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Hook set proves too narrow after 20 items are written | Loop edits per effect; the constructor you avoided, rebuilt badly | Write the **five most complex** items on paper before Phase 0 freezes `HookName` |
| Wheel outcome decided client-side or in a second request | Refresh = free reroll; scoring integrity gone | Decide + persist + return in the existing transaction (§7.1) |
| PvP griefing | Participants quit mid-season | §8.3 guardrails; `allowTargetingOthers` default **off** for the first season |
| Balance is wrong and nobody notices until week 3 | Season is ruined, not fixable retroactively | Probability preview + simulator (§9.4); presets (§9.6) |
| i18n backlog (~360 strings) | Ships English-only, violates golden rule #6 | Dictionary keys from day one; catalog stores keys, never literals |
| `resolveGameRoll` grows into an unmaintainable function | It is already ~250 lines and is the highest-risk file in the repo | Extract grant/hook logic into `lib/modules/game/service/iee.ts`; the engine stays pure and tested |
| Scope creep (trading, crafting, sets, marketplaces) | Never ships | Everything not in §1 is explicitly out of scope for v1 |

---

## 14. Delivery plan

**Principle: tracer bullet first.** Phases 0–6 carry exactly **one item**
(`shield`, passive, positive, vetoes the next penalty) and **one effect**
(`slowed`, negative, −1 die for 2 rolls) end-to-end through engine, DB, admin,
wheel and UI. Only after that vertical slice works is the catalog filled out in
bulk. Do not author thirty items against an unproven contract.

| # | Phase | Deliverable | Depends on | Done when |
| --- | --- | --- | --- | --- |
| **0** | Contracts | `lib/engine/iee/types.ts`: `ItemDef`, `EffectDef`, `HookName`, patch types. `IeeConfigSchema` + defaults wired into `SeasonConfigSchema`. i18n namespace `iee.ts` × en/ru/uk. | — | `pnpm test` green; an **existing** season's config still parses (regression test) |
| **1** | Engine: selection | `selection/pick.ts`, `gates.ts` — pure, injected rng. Weights, gates, caps, `nothing` slice, empty-pool fallback. | 0 | Unit tests: determinism with a seeded rng, distribution sanity, every gate, empty pool |
| **2** | Engine: hooks | `resolve/hooks.ts` reducer (priority, additive/override/veto). `MovementInput.modifiers`. Tracer item + effect implemented. | 0 | Unit tests incl. conflicting overrides and multi-effect stacking |
| **3** | Persistence | Migration: `player_inventory`, `player_effects`, `player_events`, `event_templates`. Repositories under `lib/modules/iee/`. Lazy expiry helper. | 1,2 | `pnpm db:generate` + `db:push` clean; `db:seed` grants the tracer item |
| **4** | Admin: global catalog | New nav entry; Items/Effects read-only browsers; **Events CRUD** + audit. | 3 | An admin can create an event template; it appears in the audit log |
| **5** | Admin: season stage | `iee` in `SEASON_STAGES`; selection + tuning UI; rarity picker; **probability preview + simulator**; `resetStage` case + tests; presets. | 3 | Tuning a season writes valid JSONB; preview matches the engine's real distribution |
| **6** | Wheel: server | Grant logic inside `resolveGameRoll` (extracted to `service/iee.ts`); transaction covers move + grant + ledger + feed; returns `{ outcome, slices }`. | 2,3,5 | Landing on bonus/penalty grants the tracer item; refresh cannot re-spin |
| **7** | Wheel: client | HUD wheel component per `DESIGN.md`, animating to the server result; reduced-motion fallback; result card. | 6 | Visually verified against a live dev server |
| **8** | Player UI | Inventory + statuses on `/dashboard`; use flow; target picker with §8.3 guardrails; read-only mirror on the public profile. | 6 | Using the tracer item on another player logs who/what/whom/when |
| **9** | Hooks live in the loop | Wire all nine hooks into `rollNewGame` / `resolveGameRoll`; `onTick` expiry + feed events. | 2,6 | `slowed` demonstrably removes a die; expiry fires and is logged |
| **10** | Events lifecycle | Event-cell assignment, submission, moderation reuse of the `completion_requests` pattern, rewards, deadlines, pending badge. | 4,3 | Full assign → submit → approve → reward path works |
| **11** | Catalog fill | Author the real item/effect set with icons and all three dictionaries. Balance pass with the simulator. | 2,5 | Every entry has a counter (§8.3) and a rarity |
| **12** | Public surfaces & polish | Feed filter tab, board/leaderboard badges, rules-page generation, `README`/`AGENTS.md`/`CHANGELOG` updates. | 8,9,10 | `pnpm lint` → `tsc --noEmit` → `test` → `build` all green |

Phases 0–2 are pure engine work and are safely parallelisable with 3–5 (DB and
admin), because the contracts are frozen at Phase 0. Phases 6+ are strictly
serial.

### 14.1 Definition of done, every phase

`pnpm lint` → `pnpm exec tsc --noEmit` → `pnpm test` → `pnpm build`, plus a
manual pass against a live dev server for anything user-visible (`AGENTS.md`
§8). New engine code without colocated tests is not done.

---

## 15. Tracer bullet — three reference entries

These are the entries Phases 0–9 carry end-to-end. They are deliberately
trivial: the point is to prove the plumbing, not the mechanic. **Do not author
the real catalog until this trio works from wheel to feed.**

They are chained on purpose — the item grants the effect, the event grants the
item — so one manual run exercises every path that matters:

```
bonus cell → wheel → item in inventory → active use on another player
           → effect applied to the target → hook fires on their next roll
           → duration ticks → lazy expiry → feed entries at every step
event cell → assignment → proof → judge approves → reward grants the item
```

What this trio does **not** cover: passive items and the `beforeCellEffect`
veto. Add a fourth entry (`shield`: passive, positive, vetoes the next negative
cell effect) in Phase 11, once the contract has proven itself.

### 15.1 Effect — `slowed` («Замедление»)

Negative, drops from `penalty` cells. Subtracts one step from the next two
moves. Chosen because it is always observable, always safe (no zero-dice edge
case), and exercises the additive-patch path plus `normalizePosition` clamping.

```ts
// lib/engine/iee/effects/slowed.ts
import type { EffectDef } from "../types";

export const slowed: EffectDef = {
  key: "slowed",
  polarity: "negative",
  rarity: "common",
  icon: "/iee/effects/slowed.webp",
  i18n: {
    name: "iee.effects.slowed.name",
    description: "iee.effects.slowed.description",
  },
  stacking: "refresh",                 // re-applying resets the counter
  duration: { kind: "rolls", value: 2 },
  priority: 100,
  defaults: { steps: 1 },
  hooks: {
    afterMovement: (ctx) => ({
      stepsDelta: -Math.abs(Number(ctx.params.steps ?? 1)),
      reason: "effect:slowed",
    }),
  },
};
```

Note: §4's `EffectDef` gains a `defaults` field, mirroring `ItemDef`.

### 15.2 Item — `hex_scroll` («Свиток порчи»)

**Positive** polarity — it drops from `bonus` cells, because receiving a usable
weapon is a reward (decision **B7-a**). Active, single charge, targets another
player, applies `slowed` to them.

`apply()` is pure and returns an **intent**, not a database write — the engine
may not touch `drizzle`. The service in `lib/modules/game/service/iee.ts`
executes the intent inside a transaction.

```ts
// lib/engine/iee/items/hex-scroll.ts
import type { ItemDef } from "../types";

export const hexScroll: ItemDef = {
  key: "hex_scroll",
  polarity: "positive",
  rarity: "common",
  icon: "/iee/items/hex-scroll.webp",
  i18n: {
    name: "iee.items.hexScroll.name",
    description: "iee.items.hexScroll.description",
  },
  usage: {
    mode: "active",
    window: "anytime",
    target: "other",                   // server-enforced, see C5-a
    charges: 1,
    consumedOnUse: true,
  },
  defaults: { effectKey: "slowed" },
  apply: (ctx) => ({
    grantEffects: [
      { effectKey: String(ctx.params.effectKey), to: ctx.targetSeasonPlayerId },
    ],
    feed: {
      eventType: "item_used",
      payload: {
        itemKey: "hex_scroll",
        effectKey: ctx.params.effectKey,
        targetSeasonPlayerId: ctx.targetSeasonPlayerId,
      },
    },
  }),
};
```

### 15.3 Event — `screenshot_of_the_day` («Скриншот дня»)

Admin-authored content, so it is a **row**, not code. Created through the
global catalog tab (§10.1) or seeded by `scripts/seed-demo.ts`. Its reward
grants the tracer item, which closes the loop.

```ts
// scripts/seed-demo.ts — event template seed
{
  key: "screenshot_of_the_day",
  title: "Screenshot of the day",
  descriptionMd:
    "Post a screenshot from your current game with one sentence " +
    "about why that moment mattered. Attach the link as proof.",
  reward: { points: 2, itemKey: "hex_scroll" },
  requiresProof: true,
  defaultDeadlineHours: 48,
  isActive: true,
}
```

Lifecycle to verify: `assigned → submitted (proof) → approved → reward granted`,
plus the `rejected` and `expired` branches. Moderation reuses the
`completion_requests` pattern and the existing admin queue (decision **F4-a**).

### 15.4 i18n entries

Six keys across three languages — `lib/i18n/dictionaries/{en,ru,uk}/iee.ts`,
all three added in the same change (`AGENTS.md` §7). English is the source of
truth; `ru`/`uk` must match the structure via `Widen<typeof EnNs.iee>`.

```ts
// en/iee.ts
export const iee = {
  items: {
    hexScroll: {
      name: "Hex Scroll",
      description:
        "Single use. Slows another player: their next two moves are one step shorter.",
    },
  },
  effects: {
    slowed: {
      name: "Slowed",
      description: "Your next two moves are one step shorter.",
    },
  },
} as const;
```

`ru`: «Свиток порчи» / «Одноразовый. Замедляет другого игрока: его следующие
два хода короче на одну клетку.» · «Замедление» / «Ваши следующие два хода
короче на одну клетку.»

### 15.5 Season configuration for the test run

```jsonc
// seasons.config.iee
{
  "enabled": true,
  "inventorySize": 6,
  "allowTargetingOthers": true,   // ON for the test; default OFF per E1-a
  "pvpProtectionMoves": 0,        // 0 for the test; default 3
  "revealDropsInFeed": true,
  "nothingWeight": 0,             // guarantee a drop while testing
  "catchUp": { "enabled": false, "maxMultiplier": 1 },
  "entries": {
    "hex_scroll": { "enabled": true, "weight": 100, "maxPerPlayer": 2 },
    "slowed":     { "enabled": true, "weight": 100 }
  },
  "events": ["screenshot_of_the_day"]
}
```

With `nothingWeight: 0` and one entry per polarity, every bonus cell yields
`hex_scroll` and every penalty cell yields `slowed` — deterministic enough to
test by hand, while still going through the real weighted picker.

### 15.6 Manual acceptance scenario

Run against a live dev server with two accounts in one active season.

| # | Action | Expected |
| --- | --- | --- |
| 1 | Player **A** resolves a roll and lands on a `bonus` cell | Wheel spins, stops on Hex Scroll; item appears in A's inventory with 1 charge; feed shows `item_granted` |
| 2 | **Reload the page mid-animation** | Result is unchanged — the outcome was persisted before the animation started (§7.1) |
| 3 | A opens the inventory, uses Hex Scroll, picks player **B** | Charge consumed, item state `used`; B's status strip shows Slowed (2 rolls); feed shows `item_used` with A, the item and B |
| 4 | **Double-click Use** | Exactly one charge spent; the second call fails with `itemAlreadyUsed` (§8.4) |
| 5 | A tries to target themselves | Rejected server-side, not merely hidden (C5-a) |
| 6 | B resolves a roll | B moves one step fewer than the dice show; `moves.diceResults` records the raw dice; the ledger is untouched |
| 7 | B resolves a second roll | Still slowed; counter reaches 0 |
| 8 | B resolves a third roll | Movement is normal; effect row is `expired`; feed shows `effect_expired` |
| 9 | B lands on a `penalty` cell | Wheel yields Slowed directly; because stacking is `refresh`, no second row appears — the counter resets to 2 |
| 10 | B lands on an `event` cell | Event assigned with a 48 h deadline; visible on the dashboard and in the moderation queue after submission |
| 11 | B submits proof, a judge approves | +2 points via `ledger_entries`; Hex Scroll granted to B; feed shows `event_approved` |
| 12 | Admin disables `hex_scroll` mid-season | B keeps the granted scroll and can still use it; no new ones drop (§5.4, G2-a) |
| 13 | Admin resets the season | Inventories, statuses and assignments are gone (cascade, D4-a) |

Steps 2, 4, 5 and 12 are the ones that actually matter — they are where a naive
implementation fails.

### 15.7 Engine tests to write alongside

Colocated in `lib/engine/iee/`, pure, injected `rng`, no DB and no DOM
(`AGENTS.md` §8):

- `pick.test.ts` — seeded rng is deterministic; weights produce the expected
  distribution over 10 000 draws; each gate excludes correctly; an empty pool
  returns the fallback; `nothingWeight` is honoured.
- `hooks.test.ts` — two effects on one hook reduce in `priority` order;
  additive deltas accumulate; conflicting overrides resolve by priority and log
  the conflict; a veto beats every additive patch.
- `slowed.test.ts` — patch shape; `refresh` does not create a second row;
  expiry fires on the correct roll sequence; the result never drives a position
  below zero after `normalizePosition`.
