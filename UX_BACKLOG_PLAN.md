# UX backlog — analysis and implementation plan

> Six reported items, read against the code before judging. Each one below says
> what is actually there (with file:line), whether it is worth building **as
> asked**, and what to build instead where it is not. Nothing here is
> implemented — this is the decision document.
>
> Written 2026-09-08, against the working tree at `0.5.0`.

---

## Status

**Waves 1 and 2 shipped 2026-09-09** (working tree only, nothing committed) —
see `WORKLOG.md` sessions 16 and 17.

| Item | State |
| --- | --- |
| 1 — finished-season colour | **Done.** One shared map split season/player; `finished` is `neutral` + a check glyph |
| 5 — unclear fine settings | **Done.** 16 wizard hints + 6 IEE advanced-drawer hints, en/ru/uk; two dead stage hints now render |
| 6 — descriptions too small | **Done.** `EntryDescription` owns the two prose tones; an invariant test caught 4 more strays across the tree |
| 3.1 — drop table shows raw keys | **Done.** Names + icon, raw key kept as a `title` |
| 3.2 / 4A — render `heroIcon` | **Done.** `IeeIcon` on six surfaces; a test forces new entries to register theirs |
| 3.3 — untranslated hook names | **Done.** Nine phrases in en/ru/uk |
| 3.4 — tables that scroll sideways | **Done.** Card grid; `/admin/catalog` is now client-rendered (see the size note in WORKLOG 17) |
| 2 — filter bar | **Done.** One shared bar on three lists; predicate extracted to `lib/engine/iee/filter.ts` and unit-tested |
| 3.5 — cross-link related entries | Not done — was marked optional |
| 4B — image upload | **Closed, decided against.** Artwork is a code change instead — see below |

**Item 4 was decided, not deferred.** No upload, no `iee_assets` table: artwork
ships in the repo and changes only in code, which also sidesteps the data-URL
objection above (a blob inlined into every list render, uncacheable). The rule
is that **the file name is the catalog key** —
`public/iee/{items,effects}/<key>.webp` — with the key also registered in
`components/iee/art.ts` so nothing has to guess whether a file exists. Tests
check the registry against the folder in both directions, plus name, case,
extension, squareness, pixel and byte budgets, and that the file really is a
WebP. Recipe: `AGENTS.md` §5. Visual spec: `DESIGN.md`. The registry ships
empty; an entry without art keeps its `heroIcon` glyph.

**Verification status — complete as of session 18.** A container harness runs
the real toolchain (`tsc` clean, `eslint` 0 errors, **471 tests**, `next build`
succeeds, sub-xs scan 0 offenders, en/ru/uk parity), every guarantee is
mutation-checked, **and the pages were opened and measured in a browser against
the live app**: type sizes read from `getComputedStyle`, zero raw catalog keys
or hook identifiers in rendered text, zero unresolved dictionary paths, zero
nested anchors. That pass found one content bug the toolchain could not.

**Decisions taken** (they were left open in items 1 and 4):

- Season `finished` renders **`neutral` + a check glyph**, not `dim` and not
  `sky`. `dim` would give `draft`, `finished` and `archived` three identical
  grey plaques on one page; `military` is `active`, and those two are exactly
  the pair that must stay distinguishable; `sky` is outside the DESIGN.md §2
  palette. The glyph carries the distinction so the palette does not grow.
  Season badges get glyphs, player badges do not — a season badge appears once
  per page, player badges appear thirty at a time on a leaderboard.
- Icons mean **rendering the `heroIcon` every entry already declares** (4A).
  The upload (4B) stays parked until someone commits to drawing artwork.

**Not verified**: `tsc`, `eslint`, `vitest` and `next build` could not run
(`node_modules` does not resolve from Linux). Syntax and en/ru/uk key parity
were checked with the repo's own TypeScript; nothing was rendered.

---

## Verdict summary

| # | Item | Verdict | Effort | Risk |
| --- | --- | --- | --- | --- |
| 1 | Finished-season badge is aggressive red | **Build** — and fix the three divergent copies behind it | XS | Low |
| 2 | Filters in the items/effects/events catalog | **Build, scoped down** — filters earn their keep on Events; on 14 catalog rows a filter bar is theatre. Ship one shared bar, use it where it pays | S | Low |
| 3 | Catalog UI more user-friendly | **Build — highest value of the six.** Four concrete defects found, one of them bug-grade | M | Low |
| 4 | Upload images for items/effects from admin | **Answer: possible, infrastructure already exists — but not the right first move.** Two phases; do phase A now, decide phase B later | A: XS · B: M | B: Medium |
| 5 | Season fine settings are unclear | **Build.** Best ratio of the six: 19 numeric fields, **zero** explanations | S | Low |
| 6 | Status/item descriptions too small | **Build.** It is a 6-line fix, not a design-system change — see the warning | XS | Low |

Suggested order: **5 → 6 → 1 → 3 → 2 → 4A**, then decide on 4B.
Rationale below in "Sequencing".

---

## 1. Finished-season status renders in aggressive red

### What is actually there

`app/admin/seasons/page.tsx:33`

```ts
const statusVariant: Record<string, "dim" | "military" | "amber" | "danger"> = {
  draft: "dim", active: "military", paused: "amber",
  finished: "danger",   // ← the complaint
  archived: "dim",
};
```

`Badge` variant `danger` is `bg-danger text-[#ffe8de] border-danger` with
`--hud-red: #b0341f` — a solid saturated red block. `DESIGN.md` §1.2 states the
rule this breaks outright:

> Amber is the only accent that means "interactive / active". Green = success /
> military, **red = danger**. Grey = idle.

A finished season is not a danger. So this is not a taste question — it is
off-policy against the project's own design doc.

### The real finding: three divergent copies

The same mapping exists three times and they **disagree**:

| Source | `finished` |
| --- | --- |
| `app/admin/seasons/page.tsx:33` | `danger` (red) |
| `components/ui/status.tsx:7` (`StatusBadge`, used on ~20 public pages) | `amber` |
| `app/admin/seasons/[id]/players/page.tsx:36` | `amber` |

So the identical season renders red in `/admin/seasons` and amber on
`/seasons/[slug]`, `/board`, `/leaderboard`, `/feed`, `/rules`, `/dashboard`,
the landing page and the user detail page. The bug is the duplication; the
colour is the symptom.

### And a latent bug worth fixing in the same pass

`components/ui/status.tsx` takes a `SeasonStatus | PlayerStatus` union and looks
the status up in **one** map. Both enums contain the key `finished`
(`db/schema/enums.ts`: `seasonStatusEnum` and `playerStatusEnum`), and it means
opposite things:

- season `finished` → the run is over (neutral / idle)
- player `finished` → this player completed the run (an achievement)

`StatusBadge` cannot tell them apart and paints both the same. Any colour picked
for one is wrong for the other.

### Recommendation

1. Create `lib/shared/constants/status-variants.ts` (leaf, per `AGENTS.md` §2)
   with **two** exported maps: `SEASON_STATUS_VARIANT` and
   `PLAYER_STATUS_VARIANT`.
2. `StatusBadge` gains a required `kind: "season" | "player"` prop and picks the
   map. A required prop means TypeScript names every one of the ~20 call sites
   rather than letting one be missed.
3. Delete the two local copies in the admin pages; both import the shared map.
4. Season `finished` → **`dim`** (grey = idle, per DESIGN.md). Player
   `finished` → keep `amber` (it is an accomplishment).

**Open decision.** With `finished` → `dim`, three season statuses (`draft`,
`finished`, `archived`) all render grey and are distinguished only by their
label text, which is legible but flat. Two alternatives:

- (a) `finished` → `dim`, and add a small `CheckCircleIcon` inside the badge.
  Stays inside the documented palette; the icon carries the distinction.
  **Recommended.**
- (b) `finished` → `sky`. Visually cleanest, but `sky` is not in the DESIGN.md
  colour table (it is an ad-hoc `Badge` variant used for genres and the `rare`
  rarity) — using it as a status colour means either extending §2 of DESIGN.md
  or knowingly going off-doc.

**Effort:** XS. ~1 new file, 3 edited, ~20 call sites touched mechanically.
**Verification:** `tsc` catches every call site by construction. Add a unit test
asserting both maps cover their full enum (`seasonStatusEnum.enumValues` /
`playerStatusEnum.enumValues`) so a future status cannot land unmapped.

---

## 2. Filters in the items / effects / events catalog

### What is actually there

`/admin/catalog` has three tabs (`app/admin/catalog/page.tsx`):

| Tab | Rows today | Source | Grows? |
| --- | --- | --- | --- |
| Items | **6** | `lib/engine/iee/items/` — code | Only on deploy |
| Effects | **8** | `lib/engine/iee/effects/` — code | Only on deploy |
| Events | *n* | `event_templates` table — admin-authored CRUD | **Yes, unbounded** |

None has a filter, a search box or a sort.

### Verdict: build it, but not everywhere it was asked for

Be blunt about the arithmetic: **a filter bar over a 6-row table is furniture,
not a feature.** It costs a control, a piece of state, an empty-state and three
translations to narrow a list the eye already takes in whole. Adding it to Items
and Effects *today* makes the page busier, not more usable.

Where filtering genuinely pays:

- **Events tab — yes, now.** Admin-authored and unbounded. It already needs
  active/inactive tabs (the column exists and is rendered but cannot be filtered
  on), a text search over title and key, and "has reward / no reward".
- **`IeeStage` pool sections** (`components/admin/IeeStage.tsx:380+`) — **yes,
  now, and this is the one that was not asked for but matters most.** This is
  where an admin arms 14 entries across two polarity sections while tuning a
  season, with an "Advanced" drawer per row. Filtering by *armed / not armed*
  and by rarity is real work being done by hand today.
- **Items / Effects browser — yes, but as a by-product.** Build the filter bar
  once as a shared component; wiring it into these two tabs then costs nothing
  and it is already there when the catalog reaches 30 entries.

### How to build it

The precedent already exists and should be copied, not reinvented:
`components/admin/GamesCatalogManager.tsx:554-592` — `useState` for the query,
`useState` for the tab, one `useMemo` filter, live counts rendered as
`{filtered.length} / {games.length}`. `UsersManager.tsx:45` and
`AddSeasonPlayer.tsx:27` use the same shape.

New: `components/admin/IeeFilterBar.tsx` — text query + chip groups (kind,
polarity, rarity, armed) + a result counter, driven entirely by props so each
host decides which groups to show.

**The one architectural question.** `IeeItemsBrowser` / `IeeEffectsBrowser` are
`async` **server** components (`getT()`, `listItems()`). Client-side filtering
needs client state. Two routes:

- **(a) Client component.** Convert the two browsers to `"use client"`.
  *Normally* this would mean serialising `ItemDef`, which is impossible —
  it carries `apply()` — but the flattening is already written twice
  (`IeeStage.tsx:100` builds exactly this `CatalogRow` shape), and critically
  **the engine catalog is already in the client bundle anyway**: `InventoryPanel`
  (client) imports `getItem`/`getEffect`, `IeeStage` (client) imports
  `listItems`/`listEffects`, `WheelOverlay` (client) imports both. So a client
  browser can call `listItems()` directly at zero marginal bundle cost.
  Instant filtering, no round-trip. **Recommended.**
- **(b) URL search params.** Server-side, no client JS, shareable and
  bookmarkable, matches the existing `?tab=` convention on the same page. But
  every keystroke is a server round-trip, so the text search has to become a
  submitted form rather than a live filter — worse for the main use.

Recommend (a), and extract the `CatalogRow` mapper into one place
(`lib/engine/iee/` or a shared view-model module) so `IeeStage` and the browsers
stop building it separately — they already drift on which fields they carry.

**Effort:** S. One new component, three hosts wired, i18n keys in en/ru/uk.

---

## 3. Make the catalog interface and its elements friendlier

This is the vaguest of the six and the one with the most real substance. Four
concrete defects, in descending order of how much they cost a user:

### 3.1 The drop-table preview shows raw catalog keys — bug-grade

`components/admin/IeeStage.tsx:600`

```tsx
<span className="w-40 shrink-0 truncate font-mono text-zinc-300">
  {slice.key ?? s.nothingSlice}     // ← "hex_scroll", "heavy_boots"
</span>
```

The odds table an admin tunes a season against labels its rows with database
keys, while the switch rows six inches above show the same entries by their
translated names. The admin sets `lead_weights` to legendary in one list and
reads `heavy_boots: 12.4%` in the other, with nothing connecting them. The
dictionary lookup is one call — `dictText(t, def.i18n.name)` — and `rows` is
already in scope in the same component.

**Fix: resolve the name, keep the key as a `title=` for debugging.** Small, and
it removes a genuine trap.

### 3.2 `heroIcon` is declared on all 14 entries and rendered nowhere

Every `ItemDef` and `EffectDef` carries a `heroIcon` (`lib/engine/types/iee.ts:129`
and `:220`) — `"BeakerIcon"`, `"ShieldCheckIcon"`, `"BoltIcon"` … Session 11
deliberately changed the field from an artwork path to a Heroicon name so that
*"every entry renders today"*.

Nothing renders it. `grep heroIcon components app` returns exactly one hit, and
it is for game-pool templates, not IEE. The catalog browser, the inventory
panel, the wheel, the rules page and the season wizard are all pure text.

**Fix:** an icon map exactly like `SeasonSettingsForm.tsx:61`'s `TEMPLATE_ICONS`,
in a shared module, plus a small `<IeeIcon entryKey>` component. Roughly 40
lines, no schema change, no new data — and it makes five surfaces scannable at
once. **This is also the honest first answer to item 4.**

### 3.3 Hook names leak developer identifiers into the staff UI

`components/admin/IeeCatalogBrowser.tsx:187`

```tsx
{Object.keys(def.hooks).map((hook) => (
  <Badge key={hook} variant="neutral">{hook}</Badge>   // "afterMovement", "beforeCellEffect"
))}
```

Raw camelCase hook identifiers, untranslated, in a column headed "Hooks". They
violate `AGENTS.md` §7 (every UI string is i18n) and they mean nothing to a
non-developer staff member.

**Fix:** a `t.iee.admin.hooks.*` block mapping each of the nine `HookName`s to a
phrase ("before the dice are rolled", "after the move", "instead of the cell's
effect"). Type the record as `Record<HookName, string>` so a new hook is a
compile error rather than a blank badge.

### 3.4 Both browsers are `min-w-[52rem]` tables that scroll sideways

`IeeCatalogBrowser.tsx:76` sets `min-w-[52rem]` inside `overflow-x-auto`, for
6 and 8 rows. On a laptop the operator scrolls horizontally through a page that
is otherwise mostly empty space, and the description column is capped at
`max-w-md` while the viewport has room to spare.

**Fix:** a responsive card grid (`grid sm:grid-cols-2 xl:grid-cols-3`) instead of
a table — icon, name, polarity/rarity badges, the full description at a readable
size (see item 6), and the mechanical facts (duration, stacking, hooks, target,
charges) as a small definition list. 14 entries is a gallery, not a spreadsheet.

### 3.5 Optional, if there is appetite

Entries reference each other and the UI never says so: `lodestone` grants
`tailwind`, `jinx` grants `unlucky`, `lead_weights` grants `heavy_boots`,
`cleansing_salve` clears every negative. Cross-linking an item card to the
effect it applies would let a staff member see the counter-play structure that
`iee-catalog.test.ts` already enforces as an invariant. Nice-to-have; skip on a
first pass.

**Effort:** M for 3.1–3.4 together. 3.1 alone is 15 minutes and should not wait.

---

## 4. Can images be uploaded from the admin UI, or must they be hardcoded?

### Short answer

**Uploading is possible with no new dependency and no object storage — the
project already does exactly this for avatars. But it should not be the next
thing built,** and if it is built it must not be built the way avatars are.

### What exists

- **`components/ui/ImageCropper.tsx`** — client-side crop and rasterise to a
  JPEG data URL, with a size ceiling (`MAX_OUTPUT_BYTES = 600_000`) and quality
  step-down. Already used by `components/settings/SettingsForm.tsx:484`.
- **Storage = a `text` column.** `db/schema/users.ts:13,15` (`avatar_url`,
  `banner_url`), validated server-side at
  `lib/modules/player/service/settings.ts:29-30`:
  `z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/).max(300_000)`.
- **No object storage, no upload route, no `public/uploads`.** The only route
  handler in the app is `app/api/chat/route.ts`.

### The constraint that decides it

`compose.yaml` mounts exactly one volume — `pgdata` for Postgres. The app
container has **no persistent volume**, and `Dockerfile` copies the built tree
into a fresh image on every deploy. So anything written to `public/` at runtime
is destroyed on the next deploy. That is presumably why avatars are data URLs in
the database in the first place.

**Therefore: disk storage is not an option; the database is the only durable
store available.**

### Why the avatar pattern must not simply be copied here

An avatar is one blob attached to one user row, rendered a handful of times. An
item image is different in kind:

- 14 entries are listed *together* on `/rules`, in the catalog browser, in the
  season wizard's pool sections, in the inventory panel and in the wheel strip.
- A data URL is inlined into the HTML/RSC payload and **cannot be cached
  separately by the browser** — it is re-sent in full on every render of every
  page that lists entries.
- 14 × 300 KB ≈ **4 MB of markup** on the rules page alone, re-downloaded on
  every visit.

That is the real objection, and it is not hypothetical.

### Recommendation — two phases

**Phase A (do this now, it is item 3.2):** render the `heroIcon` every entry
already declares. Zero schema change, zero upload, zero bytes on the wire,
~40 lines. It delivers most of the visual benefit of "items should have
pictures" today.

**Phase B (only if real artwork is actually wanted):**

1. New table `iee_assets(key text primary key, mime text, bytes bytea,
   updated_at, updated_by)`. Purely additive migration.
   **The engine may not touch it** (`AGENTS.md` §2: `lib/engine/` stays pure) —
   the catalog stays code, the asset is looked up by the service layer and
   passed into components as a prop.
2. Upload through the existing `ImageCropper` (fixed square aspect, output
   128×128, target < 40 KB) → a new server action under `lib/modules/iee/actions/`
   → `requireStaff` + `logAdminAction`, like every other staff mutation.
3. **Serve via a route handler**, not a data URL:
   `app/api/iee/[key]/image/route.ts`, returning the bytes with
   `Cache-Control: public, max-age=31536000, immutable` and a content hash in
   the query string for cache-busting. Pages then carry a ~30-byte URL instead
   of a 300 KB blob.
4. Fall back to `heroIcon` whenever no asset row exists, so the catalog never
   renders a hole and phase A is not wasted.

**Do not** reintroduce hardcoded paths such as `icon: "/iee/hex_scroll.webp"`.
That field existed and was deliberately removed in session 11 for the stated
reason that *"a path to a missing file is worse than no field at all"* — nothing
about that has changed.

**Effort:** A = XS. B = M (migration + table + action + route + cropper wiring +
cache strategy + tests), and it is the only item on this list carrying real
architectural risk. Worth doing only if someone is actually going to draw 14
icons.

---

## 5. Season fine settings are unclear

### What is actually there — the numbers make the case

In `components/admin/SeasonSettingsForm.tsx` (1032 lines, the season wizard):

| Control | Count | With an explanation |
| --- | --- | --- |
| `<Switch>` | 13 | **13** (`description={t...}`) |
| `<Field>` (number / select inputs) | 19 | **0** |

Every toggle was explained. Not one numeric or dropdown field was. And the
unexplained ones are precisely the unguessable ones:

`sidesPerDieLabel`, `diceOnPassLabel`, `diceOnDropLabel`, `startingBalanceLabel`,
`rerollsLimitLabel`, `boardSizeLabel`, `distributionLabel`, `providerLabel`,
`orderingLabel`, `metaMinLabel`, `metaMaxLabel`, `ratingMinLabel`,
`ratingMaxLabel`, `yearMinLabel`, `yearMaxLabel`, `playersLabel`,
`searchQueryLabel`, `maxCandidatesLabel`, `cacheTtlLabel`.

`Cache TTL` — in what unit? `Max candidates` — of what, and what happens at the
limit? `Distribution` — what do the options do to a board? `Ordering` — orders
what, and does it interact with the filters above it?

`components/ui/Field.tsx` already renders a `hint` under the label. The prop
exists, the styling exists, and it is used **zero** times in this file.

The same gap is in `components/admin/IeeStage.tsx`: the top-level fields have
hints (`inventorySizeHint`, `nothingWeightHint`, `pvpProtectionHint`), but every
field inside the per-entry "Advanced" drawer — `weight`, `maxPerSeason`,
`maxPerPlayer`, `cooldownRolls`, `minPosition`, `unlockAfterMove` — has none, or
only a bare `hint={s.unlimited}`. Those are the actual fine settings, and
`cooldownRolls` in particular is measured in *season-wide* resolved rolls rather
than the player's own — a distinction that cost a bug in session 3 and is
documented nowhere in the UI.

### Recommendation

1. **A `hint` on every `Field`** in `SeasonSettingsForm` and in `IeeStage`'s
   advanced drawer. One sentence: what it does, the unit, and what the extreme
   value means. New `*Hint` keys in `lib/i18n/dictionaries/{en,ru,uk}/admin.ts`
   and `iee.ts`.
   The `Widen` conformance type makes a key missing from `ru` or `uk` a
   **compile error** (proven in session 4), so this cannot half-ship.
2. **Units in the labels themselves** — "Cache TTL (minutes)", "Protection
   window (moves)" — since a hint can be skimmed past but a label cannot.
3. **A stage-level intro paragraph on every stage.** Three already exist and are
   good (`diceHint`, `boardHint`, `poolHint`); `templates` and `iee` have one,
   `rules` does not. Render them consistently at the top of each stage.
4. **Live value echo on ranges.** `IeeStage`'s catch-up multiplier already does
   this (`×{maxMultiplier.toFixed(1)}`); the `Range` controls in
   `SeasonSettingsForm` should too.
5. *Optional:* a "what a player will see" preview line under the riskiest
   settings. The rules page (`AutoRulesView`) is already generated from the same
   config — that machinery could be reused rather than written twice.

**Effort:** S, but wide: ~35 new dictionary keys × 3 locales. Almost all of the
work is writing good copy, not code. Highest value-per-hour of the six.

---

## 6. Status and item descriptions are too small

### What is actually there — and what the fix is *not*

The description of what an item or status **does** renders at `text-[11px]` in
`text-dim` (`#9a958a`) on five surfaces:

| File | Line | What |
| --- | --- | --- |
| `components/dashboard/InventoryPanel.tsx` | 104 | held item description |
| `components/dashboard/InventoryPanel.tsx` | 194 | active status description |
| `components/rules/AutoRulesView.tsx` | 318 | catalog entry on `/rules` |
| `components/admin/IeeStage.tsx` | 432 | catalog entry in the season wizard |
| `components/dashboard/ChallengesPanel.tsx` | 102 | challenge description |

Plus `components/admin/IeeCatalogBrowser.tsx:47` at `text-xs`.

**Contrast is not the problem** — `#9a958a` on `#1a1a1a` measures **5.83:1**,
which passes WCAG AA comfortably. The problems are size and hierarchy. The
screenshot in `Claude outputs/inventory-panel.png` shows it plainly: the name
`HEX SCROLL` is `text-sm uppercase` in near-white, while *"Single use. Slows
another player: their next two moves are one step shorter"* — the only text that
tells the player anything — is 11px grey. The hierarchy is inverted: the label
that carries no information is prominent, the sentence that carries all of it is
a footnote.

It is also off the project's own type scale. `DESIGN.md` §2 Typography:
*"Scale is tight: `xs` for hints, `sm` for labels."* `text-[11px]` is not on that
scale at all.

### Warning — do not generalise this fix

`grep` finds **261** uses of `text-[11px]` and **188** of `text-[10px]` across
`components/` and `app/`. The overwhelming majority are
`font-mono uppercase tracking-widest` **labels** and counters — the HUD idiom,
correct as-is, and a blanket find-and-replace would destroy the visual language.

**The fix is the six prose lines listed above, not a sweep.**

### Recommendation

1. Promote entry descriptions on **player-facing** surfaces (inventory,
   statuses, challenges, `/rules`) to `text-sm leading-relaxed text-zinc-300` —
   on the documented scale, 11.78:1 contrast, and visibly the primary content of
   the row.
2. On dense **admin** surfaces (catalog browser, `IeeStage` rows) use
   `text-xs leading-relaxed text-zinc-400` — a floor of 12px, still compact.
3. Extract a single `<EntryDescription>` component so these six copies cannot
   drift apart again. This is the same lesson `lib/i18n/dict-text.ts` recorded in
   session 12, where the identical nine-line walker existed five times byte for
   byte.
4. **`EffectBadges` has no description at all.** `components/iee/EffectBadges.tsx:52`
   exposes the effect name only through a native `title=` attribute, which does
   not exist on touch devices. A player on the leaderboard sees a red chip
   reading `HEAVY BOOTS` with no way to find out what it does. Either link the
   chip to the rules section or give it a tap-through popover.
5. Record the decision in `DESIGN.md` §2 so "prose gets `sm`/`xs`, HUD labels get
   `[11px]` mono uppercase" is written down rather than re-litigated.

**Effort:** XS for 1–3. S if 4 is included.

---

## Found while looking — not requested, worth knowing

- **`components/ui/status.tsx` cannot distinguish a finished season from a
  finished player.** See item 1. Latent, and any colour choice is wrong for one
  of the two until it is split.
- **`heroIcon` is dead data on all 14 catalog entries.** See 3.2.
- **The drop-table preview labels its rows with database keys.** See 3.1.
- **Nine hook identifiers render untranslated in the staff UI.** See 3.3, and it
  is a live `AGENTS.md` §7 violation.
- **The `CatalogRow` flattening exists twice already** (`IeeStage.tsx:100` and
  implicitly in `IeeCatalogBrowser`) and the two carry different fields. Item 2
  would add a third unless it is extracted first.

---

## Sequencing

**Wave 1 — copy and constants, no structural change.** Items **5**, **6**, **1**.
All three are dictionary keys, class names and a shared map. They can ship as one
commit, carry near-zero regression risk, and address the two complaints that cost
a user the most per day.

**Wave 2 — catalog rework.** Item **3** (3.1 first and separately, it is a
15-minute trap removal), then 3.2/3.3/3.4 together, then item **2**'s filter bar
on top of the reworked surfaces. Doing 2 before 3 means building filters over a
table that is about to be replaced by cards.

**Wave 3 — decision required.** Item **4B**, only after someone confirms artwork
will actually be produced. **4A ships inside wave 2 as 3.2.**

### Constraints this repo imposes on all of the above

From `WORKLOG.md` → *Known repo issues*, all still open:

1. **332 files show as modified with pure CRLF/LF churn.** `git add -A` would
   produce a 332-file line-ending commit. Stage explicitly by path, or land
   `git add --renormalize .` as one dedicated commit **before** any of this work.
2. **A stale `.git/index.lock`** blocks every write operation until removed.
3. **`node_modules/` does not resolve from a Linux shell** (pnpm links created on
   Windows). `pnpm lint` / `tsc` / `vitest` must be run from Windows, or
   `pnpm install` re-run.
4. Every UI string is i18n in **en + ru + uk**, enforced at compile time.
5. Every staff mutation goes through `requireStaff` + `logAdminAction`
   (relevant only to item 4B).
6. `DESIGN.md` is law; items 1 and 6 should update it rather than diverge from it.

### Verification, matching the house standard

- **Items 1, 5:** `tsc` proves completeness by construction (required prop; the
  `Widen` conformance type). Add the enum-coverage unit test from item 1.
- **Item 3.2:** a unit test that every `heroIcon` resolves in the icon map — the
  existing `iee-catalog.test.ts:61` already asserts the *format* of the name;
  extend it to assert the map actually contains it, or a valid-looking name that
  is missing from the map still renders nothing.
- **Items 2, 3, 6:** these are the class of change `tsc` cannot see. The project's
  own record is unambiguous on this — session 7's single-outcome wheel, session 8's
  "from a cell" placeholder and session 12's "1 CHALLENGES" were all found by
  **looking at the rendered page**, and none of them by a checker. Add assertions
  to `probe/public-surfaces.mjs`: the drop table renders no `[a-z]+_[a-z]+` key,
  no rendered description is below 12px computed, and every browser row renders
  an icon element.
- Note the recurring trap recorded four times in `WORKLOG.md`: `innerText`
  returns CSS-transformed text and this design uppercases titles — **compare
  case-insensitively** in any new probe assertion.
