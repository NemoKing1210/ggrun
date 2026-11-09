# IEE constructor — implementation plan

> **What** to build: [`IEE_CONSTRUCTOR_SPEC.md`](./IEE_CONSTRUCTOR_SPEC.md)
> (normative). **In which order and how each stage is accepted:** this file.
> **What happened:** [`IEE_CONSTRUCTOR_LOG.md`](./IEE_CONSTRUCTOR_LOG.md).
>
> Approved 2026-10-06. Owner's rule: **after every stage, stop and wait for the
> go-ahead.**

---

## 1. Ground rules

1. **One stage at a time; stop at the gate.** A stage is done when its gate
   holds and `pnpm verify` exits 0. Then the journal and `docs/WORKLOG.md` get
   an entry, and work stops until the owner says to continue.
2. **No data migration.** The project is not deployed: old IEE tables and keys
   are replaced, not migrated (spec D11). Seeds and the demo season are
   re-created.
3. **Old code goes last.** The static catalog, `grant.ts` and the two IEE
   repositories are removed only after the 57 scenarios pass on the new core.
4. **The engine stays pure** (AGENTS.md §2): vocabulary, compiler, dice
   pipeline and interception live in `lib/engine/`; persistence, registry,
   executor and decisions live in `lib/modules/iee/`.
5. **A primitive ships complete**: Zod schema, pure implementation, ru/en/uk
   text template, power cost, unit tests for behaviour and text.
6. **Docs, comments and commits in English** (AGENTS.md §2.6). The design
   discussion stays in the Russian design document.
7. **Workspace.** The Windows checkout's `node_modules` does not resolve from
   Linux (WORKLOG, *Known repo issues*), so every stage is built and verified in
   a clean Linux clone of the same commit (`pnpm install --frozen-lockfile &&
   pnpm verify`). Changed files are then written back into the checkout with
   its CRLF line endings; files under `.gitattributes eol=lf` stay LF. The
   owner's pre-push hook re-runs `pnpm verify` on Windows.
8. **Commits.** Conventional commits, one logical change each, made when the
   owner asks. Until then changes stay in the working tree and the journal
   lists the files. Never `git add -A` while the CRLF churn exists (WORKLOG).
9. **Live checks.** Every stage that changes behaviour (1, 2, 3, A–D) is also
   exercised against `pnpm dev` with a scratch Postgres (AGENTS.md §8); the
   journal records what was exercised.
10. **Invariants become tests.** "One writer of IEE state", "revisions are
    insert-only", "no engine import in client code" go into
    `lib/architecture.test.ts` when they become true.

---

## 2. Stages at a glance

| Stage | Size | Delivers | Gate | Needs |
| --- | --- | --- | --- | --- |
| **0** Spec | S (1–2) | normative spec, data model, DSL v1, text and file formats; ITEMS_EFFECTS_EVENTS §2.1 amended | owner reviewed the spec; verify green | — |
| **1** Core | L (6–8) | DSL runtime (stage-1 vocabulary), compiler, rule text, season registry, executor, `iee_instances`, `iee_journal`, eager lifecycle; the 14 current entries as documents | 57 scenarios green with the same expected results; static catalog and old state tables gone | 0 |
| **2** Library | M (3–4) | packs, entries, revisions, season catalog, icons, `.ggpack`, `core.ggpack` seed; core curated to the starter set's core wave | a season plays on published revisions; export → import → export is identical | 1 |
| **3** Editor | L (5–7) | admin constructor UI: library, pack, entry editor, preview, rule text | «Болото», «Сапоги скорости», «Отравление» built without code and working in a live season | 2 |
| **4** Checks & balance | M (3–4) | entry scenarios, sandbox with bots, power, drop table, 1000-spin simulator | a red scenario blocks publish; sandbox run recorded | 3 |
| **A** | L (5–7) | dice pipeline, out-of-turn moves, cursed and passive items, direction | 37 of 83 entries available | 1, 2 |
| **B** | L (5–7) | item operations, protection and interception, player decisions | 59 of 83 | A |
| **C** | L (5–7) | game-pool hooks, completion conditions | 77 of 83 | 1, 2 |
| **D** | M (3–4) | board objects, «Корона» | 81 of 83 | A, B |

Order: **0 → 1 → 2 → 3 → 4 → A → B → C → D** (spec D10). Sizes are WORKLOG
sessions — one session is one finished and verified piece. MVP (0–4) and the
waves are 18–25 sessions each.

---

## 3. Stage 0 — Spec and contract (S)

**Goal.** Freeze the contract so the code stages do not re-open design
questions, and record the reversal of the old "no constructor" verdict.

| # | Task | Output |
| --- | --- | --- |
| 0.1 | Normative spec: decisions, glossary, data model, entry document, vocabulary with stages, execution semantics, registry, executor and journal, library, `.ggpack`, icons, rule text, publish checks, drop weights, starter set with slugs | `docs/IEE_CONSTRUCTOR_SPEC.md` |
| 0.2 | Amend the old design doc: status banner and §2.1 | `docs/ITEMS_EFFECTS_EVENTS.md` |
| 0.3 | Plan and journal; docs map; WORKLOG entry | this file, `IEE_CONSTRUCTOR_LOG.md`, `AGENTS.md` §11, `docs/WORKLOG.md` |
| 0.4 | Gate | `pnpm verify` |

**Out of scope:** any code.
**Gate:** the owner reviewed the spec; `pnpm verify` green.

---

## 4. Stage 1 — Core (L, 6–8 sessions)

**Goal.** The game runs on entry documents instead of TypeScript entries, and
one executor writes all IEE state. Behaviour does not change.

| # | Task | Where |
| --- | --- | --- |
| 1.1 | `EntryDoc` Zod schema (`dslVersion: 1`) and the primitive contract (schema, implementation, text, cost) | `lib/engine/iee/dsl/` |
| 1.2 | Stage-1 vocabulary (spec §6, rows marked 1): triggers `onUse`, `onApply`/`onExpire`, `beforeMovement`, `afterMovement`, `before/afterCellEffect`, `onOutcome`, `onTick`; conditions `outcome`, `cellType`, `chance`, `hasEntry`; actions `steps`, `dice`, `balance`, `skipCellEffect`, `noMove`, `grantEffect`, `grantItem`, `cleanse`; values literal, `param`, `random`; durations `rolls`, `moves`, `passed_games`, `triggers`, `permanent` | `lib/engine/iee/dsl/` |
| 1.3 | Compiler (document → `ItemDef`/`EffectDef`), rule-text generator ru/en/uk, load-time checks | `lib/engine/iee/dsl/` |
| 1.4 | The 14 current entries as documents, **same keys and behaviour**; until stage 2 they are a code fixture | `lib/engine/iee/core-docs/` (temporary) |
| 1.5 | Schema: `iee_instances`, `iee_journal`, enums; drop `player_inventory`, `player_effects` and their enums; one migration | `db/schema/iee.ts`, `drizzle/` |
| 1.6 | Season registry (compile + cache); source = the core fixture until stage 2 | `lib/modules/iee/registry/` |
| 1.7 | Executor: `grant`, `fire`, `tick`, `end`, `balance`, `resetSeason`, `compileFailed`; eager counters; journal; feed projection with the existing event types | `lib/modules/iee/executor/` |
| 1.8 | Switch the writers and readers: `turn.ts`, `iee.ts` (wheel, expiry, hooks), `use-item.ts`, `events.ts`, `iee/service/intervene.ts`, `season/service/seasons.ts` (reset), bots, `iee/service/catalog.ts` | `lib/modules/**` |
| 1.9 | Serializable entry view for the client; switch `InventoryPanel`, `WheelOverlay`, `EffectBadges`, `EntryDescription`, `AutoRulesView`, `board-view`, admin catalog, `IeeStage`; entry texts leave `lib/i18n/dictionaries/*/iee.ts` | `components/**`, `app/**` |
| 1.10 | Scenarios run against the new core: the 57 keep their expected results; live scenarios that read old tables are rewritten to read instances and the journal | `lib/engine/iee/scenarios.ts`, tests |
| 1.11 | Remove `lib/engine/iee/items/*`, `effects/*`, `ITEMS`/`EFFECTS`, `grant.ts`, `repository/{inventory,effects}.ts`; move the counter-play test to a registry-level check; architecture test "one writer" | — |
| 1.12 | Live check on a scratch DB: wheel drops, «Свиток порчи» on a bot, expiry, admin intervention, season reset | journal |

**Gate:** verify green; 57 scenarios green with unchanged expected results; no
reference to `ITEMS`, `EFFECTS`, `player_inventory`, `player_effects` remains;
the live check is recorded.
**Risk:** regression in `turn.ts` — parity first, removal last (1.11 is the
final session of the stage).

---

## 5. Stage 2 — Library and icons (M, 3–4 sessions)

| # | Task |
| --- | --- |
| 2.1 | Schema: `iee_packs`, `iee_pack_dependencies`, `iee_entries`, `iee_entry_revisions`, `season_catalog` (FK `RESTRICT`); remove `seasons.config.iee.entries`; add the season-wide limits (spec §4.5) |
| 2.2 | `lib/modules/iee/library/`: admin-only CRUD, draft → publish (number, content hash, `dsl_version`), archive, dependency maintenance, `logAdminAction` everywhere |
| 2.3 | `.ggpack` export/import (UUID-preserving, hash-deduplicated, publish checks); `seed/iee/core.ggpack` loaded by seed/boot; core read-only unless `IEE_CORE_EDITABLE=1` |
| 2.4 | Curate `core` to the starter set's core wave: `speed_boots` (absorbs `lodestone`), `swamp` (absorbs `slowed`), `toll` (was `taxed`), `ward` (was effect `shield`), new `acceleration` and `poison` (needs the `passed_games` unit); scenario keys follow the renames |
| 2.5 | Season catalog: attach revisions, auto-attach dependencies, per-entry tuning; registry reads catalog + live-instance revisions; limits and stacking per entry |
| 2.6 | File category `iee_icon`; icon fallback chain in `IeeIcon`/`IeeArtTile` |
| 2.7 | Season wizard stage picks packs and revisions, then tuning; wheel selection reads `season_catalog` |

**Gate:** a season plays on published revisions (live); export → import into an
empty DB → export gives the same manifest; deleting a pinned revision is refused
by the database; verify green.

---

## 6. Stage 3 — Editor (L, 5–7 sessions)

| # | Task |
| --- | --- |
| 3.1 | `/admin/catalog`: tabs Library, Pack, Entry editor; admin-only guard |
| 3.2 | Entry editor blocks: basics, usage, rules, duration and stacking, limits, interaction. A rule is a card "When · If · Do"; every field is a typed dropdown; incompatible options are not offered |
| 3.3 | Right panel: card preview (square or hexagon), generated rule text ru/en/uk, power, check errors and warnings |
| 3.4 | Publish, export, import; diff before switching a season to a newer revision |
| 3.5 | i18n en/ru/uk for every label; DESIGN.md compliance; component tests |

**Gate:** «Болото», «Сапоги скорости» and «Отравление» are assembled in the UI
without code, published, attached to a live season and work (live check).

---

## 7. Stage 4 — Checks and balance (M, 3–4 sessions)

| # | Task |
| --- | --- |
| 4.1 | Entry scenarios (Given / When / Then) stored in the revision document, run on publish; a red one blocks |
| 4.2 | Sandbox: temporary season, 2–4 bots, N turns, trace from the journal |
| 4.3 | Power estimate per primitive, suggested rarity, season `powerCeiling` |
| 4.4 | Drop table and 1000-spin simulator in the season wizard |
| 4.5 | `pnpm scenarios:doc` generates `ITEMS_EFFECTS_SCENARIOS.md` from `core` |

**Gate:** a red scenario blocks publish; a sandbox run is recorded; simulated
shares match the analytical ones within tolerance.

---

## 8. Wave A — dice, moves, cursed and passive items (L)

| # | Task |
| --- | --- |
| A.1 | Split `resolveMovement` into the seven steps (spec §7.2): composition, roll, automatic rerolls, (window placeholder), result modifiers (add → cap → min 1, sign), signed step modifiers that never reverse, path and cell. Hook `afterDice` |
| A.2 | Out-of-turn moves (spec §7.3) and their primitives; finish still counts |
| A.3 | Cursed and passive items: `whileHeld`, auto-firing, uniqueness, removal, bonus-only counting |
| A.4 | Duration unit `next_game`; conditions and value sources of wave A |
| A.5 | Add the 23 wave-A entries to `core` with scenarios; `heavy_boots` becomes a cursed item, `lead_weights` plants it (shipped as `cursed_boots`: an entry keeps its kind, so the effect stays as «Тяжёлый шаг») |

**Gate:** 37 of 83 entries available; live check of a backward «Сломанный
компас» move and of «Свинцовые грузы».

---

## 9. Wave B — items, protection, decisions (L)

| # | Task |
| --- | --- |
| B.1 | Item operations: steal, transfer, discard, copy, transform, extra spin (shipped as `stealItem`, `transferItem`, `swapItems`, `copyItem`, `grantChosen` and `extraSpin`, spec §6.12; a discard is wave A's `remove`, a transformation `remove` and `grantChosen` in one rule) |
| B.2 | `onIncoming` for everything received; harm on actions; tier vs pierce; block, reflect, amplify, replace; chain depth ≤ 2; «Невидимость», «Цепь» (shipped as the moments `onIncoming` and `whileActive`, the condition `incoming`, the answers `block`, `reflect`, `amplify`, `replace` and the standing states `untargetable`, `forbidItems`, `pierce`, spec §6.13) |
| B.3 | Decisions: `iee_decisions`, two-phase turn with the reaction window, victim choice with defaults applied when the next game starts, judge resolution, dashboard panel, realtime event (`lib/api/realtime.ts` + `pnpm api:doc`), bot policy (split in two: session 32 the table, the victim's choice — `victimChoice`, `holdLimit`, spec §6.14 — with its default, the judge, the panel, the event and the bots; session 33 the two-phase turn with the reaction window — reaction items as active items used `after_dice`, the new action `reroll`, the window as an `iee_decisions` row replayed on its recorded draws, spec §6.15, §7.4) |
| B.4 | Add the 22 wave-B entries to `core` with scenarios (shipped in session 34 with the handout `treasure_hunt` for «Карта сокровищ»; the pack-read play model re-derived from the new `core`) |

**Gate:** 59 of 83; live check of «Золотая монета» in the window and of the
«Налог» default.

---

## 10. Wave C — game pool and completion conditions (L)

| # | Task |
| --- | --- |
| C.1 | `beforeGameRoll` / `onRollCreated` in `pickGameForRoll` / `rollNewGame`: exclude or require genre, year range, rating; favour a game; choose 1 of N; free reroll; postpone for exactly two rolls (split in two: session 35 the pool rules — `beforeGameRoll`, `poolExclude`, `poolRequire`, `poolFavor`, the user's pick on use remembered by what the use hands them, the pick honouring the rules and setting them aside when nothing is left, spec §6.16, §7.12; session 36 the choice of N (`game_choice`), «Переролл игры» and «Отложенная игра» on an open roll, the dashboard's pickers and the choice panel, bots, a game pool in the simulator for scenarios) |
| C.2 | Completion conditions held by the roll; immunity; `disabledTags` (shipped in session 37: `onRollCreated`, `addCondition`, `conditionImmunity`; each condition a `roll_condition` instance held by the roll, shown on the game card, in the completion request and in the history; an entry that adds them carries `game_condition`, which `disabledTags` switches off) |
| C.3 | Add the 18 wave-C entries to `core` with scenarios (shipped in session 38 with six handouts for the items that pick or offer a choice — «Жанр под вето», «Выбор из двух», «Любимая игра», «За дверями», «Избранный жанр», «Избранная эпоха»; the pack-read play model re-derived from the new `core`, the conditions' arrival read off it) |

**Gate:** 77 of 83; live check of «Три двери» and «Сложный режим».

---

## 11. Wave D — board objects and «Корона» (M)

| # | Task |
| --- | --- |
| D.1 | Objects held by cells: placement rules, trigger on pass or stop (first regular move, owner included), one per cell, `boardObjectsPerPlayer`, shown on the board (shipped in session 40: `usage.pick: "cell"`, `placeObject`, `onObjectEntered`, `stopMove`, `push`, `extend`, `spinInstead`; a `board_object` instance held by the cell; the move's walk in `playTurn`; the journal's `place` and `trigger_object`, the feed's `object_placed` and `object_triggered`; the board's markers and the cell's details, the dashboard's cell picker, bots, the scenarios' Given objects, spec §6.18, §7.7) |
| D.2 | `onSameCell` and «Корона» (shipped in session 41: the trigger `onSameCell` for effects and held items, `takeEntry`, `usage.unique: "season"` — the grant's refusal and the wheel's gate `unique_season` —, the executor's `sameCell` after the move's objects, the feed's "took … landing on the cell of …", `PLAY_MODEL.sameCell` 0.1, the constructor's switch «Один на сезон», spec §6.19) |
| D.3 | Add the 4 wave-D entries to `core` with scenarios (shipped in session 42: «Мина», «Пружина», «Капкан» and «Корона», sixteen scenarios; three new glyphs — `ChevronDoubleUpIcon`, `StopCircleIcon`, `TrophyIcon`; the objects held to the play model, «Корона» measured; the pack-read play model re-derived from the new `core`) |

**Gate:** 81 of 83; live check of each object.

---

## 12. Every stage, every time

- en/ru/uk for every new string; DESIGN.md for every new UI.
- `logAdminAction` for every staff mutation; feed types filed under a tab.
- `lib/api` + `pnpm api:doc` when routes or realtime events change.
- The coverage ratchet never goes down.
- The journal entry lists: goal, done, decisions, verification (test counts),
  files, what is next.
