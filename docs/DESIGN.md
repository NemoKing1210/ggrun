# DESIGN — GGRun HUD Design System

> Tactical console for a seasonal gaming run. GoldSrc / Half-Life era: dark charcoal, amber, military green, rust red, bevelled squares, clipped corners, hazard tape.

This is the source of truth for visual language. All new UI **must** follow it. `AGENTS.md` points here.

---

## 1. Principles

1. **Tactical, not cute.** No rounded pills, no soft shadows. Everything is cut, beveled, stamped.
2. **Read at a glance.** Amber is the only accent that means “interactive / active”. Green = success / military, red = danger. Grey = idle.
3. **One cut.** Every surface/control uses the same 4px (inputs) / 8px (buttons/cards) clipped corner `polygon(…)` — never `rounded-*` except for the switch thumb legacy (now also square).
4. **No JSON, no raw.** Admin controls are always visual (templates, chips, switches, ranges) — never a textarea with JSON.
5. **Motion is spare.** 120–200ms ease-out, only `transform` / `opacity` / `border-color`. Respect `prefers-reduced-motion`.

---

## 2. Foundations

### Colors (CSS vars in `app/globals.css`)

| Token             | Value     | Use                                    |
| ----------------- | --------- | -------------------------------------- |
| `--hud-bg`        | `#1b1b1a` | Page background (with scanline repeat) |
| `--hud-bg-raised` | `#2a2a22` | `hud-card`                             |
| `--hud-amber`     | `#f2a900` | Primary, active, focus                 |
| `--hud-green`     | `#7c8f4a` | Success / military                     |
| `--hud-red`       | `#b0341f` | Danger / penalty                       |
| `--hud-text`      | `#e6e1d3` | Body                                   |
| `--hud-text-dim`  | `#9a958a` | Labels, hints                          |

Tailwind `@theme inline` maps these to `bg-amber`, `border-amber`, `text-military`, `text-danger`, `text-dim`, `bg-raised`.

### Typography

- Display: `var(--font-stencil)` / `font-display` — headings, buttons, badges, stat numbers. `uppercase tracking-widest/wider`.
- Mono: `var(--font-tech-mono)` / `font-mono` — positions, codes, ammo-counter.
- Body: `var(--font-body)` — UI text.

Scale is tight: `xs` for hints, `sm` for labels, `xl`/`3xl` display for page titles.

`text-[11px]` and `text-[10px]` are **HUD label sizes** — mono, uppercase,
`tracking-widest`, for counters, kickers and stamped captions. They are not
prose sizes. A sentence a reader has to actually read (what an item does, what
a status does, what a setting means) takes **`base` on player surfaces and `sm`
on admin ones**, via `components/iee/EntryDescription.tsx`.

Two reasons it sits a step above what the tight scale suggests. The body face
is **Barlow Condensed**: a condensed face at a given px carries a visibly
smaller x-height than a normal one, so the nominal size flatters it. And these
sentences _are_ the content of their card — an entry's description is the only
place a player ever learns what a status does. Descriptions were once set at
11px below a `text-sm` name, which inverted the hierarchy outright: the label
carrying no information outranked the sentence carrying all of it.

### Spacing & Borders

- Card padding `p-4`, gap `gap-3 / gap-4`, section gap `gap-6`.
- Borders `1px solid #3d3d34` (card) / `#55554a` (button off) / `#c98f00` (amber active) / `#8a2817` (danger).
- Clip sizes: buttons/cards `8px` or `6px`, inputs/selects/chips/badges/switches `4px` (small switch `3px`, thumb `2px`). Never `rounded`.

### Layout Containers

`components/ui/PageContainer.tsx` is the single source of truth for page content width. The public shell (`app/(public)/layout.tsx`) centers **one** fixed-width container (`max-w-6xl`) that holds both the breadcrumbs row and `<main>` — their edges always align and the vertical rhythm between them is defined exactly once. Every page renders its content through `PageContainer`, which spans the full width of that shared container; pages never write their own `mx-auto max-w-*` wrapper and never narrow their content below the breadcrumb row.

### The Cut

```
[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]
buttons/cards: 8px → polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)
small switch/track: 3px, thumb: 2px
```

---

## 3. Surfaces

### `hud-card`

`position: relative; border: 1px solid #3d3d34; background: var(--hud-bg-raised)` with corner brackets `::before`/`::after` (`12×12`, `2px` amber). Use for every panel, form section, table wrapper.

### `hazard-tape`

`height: 12px; background: repeating-linear-gradient(45deg, #111 0 12px, var(--hud-amber) 12px 24px); border-y: 1px solid #000;` — separator under page titles.

### Scrollbars

Firefox `thin`, track `#151514`, thumb `#3d3d34` → `amber` on hover. Chromium `::-webkit-scrollbar` flat rectangle, no rounding, same palette.

---

## 4. Controls

All controls live in `components/ui/*` and `app/globals.css` base styles.

### Button `.hud-btn`

`font-display uppercase tracking-widest; clip-path 8px; background #33332b; border #55554a; box-shadow inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.35); transition filter 120ms`. `:hover` `brightness(1.15)`, `:disabled` `opacity 0.45`. Variants: `.hud-btn-primary` (`bg-amber, text #171713, border #c98f00`), `.hud-btn-danger` (`bg-danger`). Never rounded.

### Switch `components/ui/Switch.tsx`

Square, not pill. Track `h-6 w-11` (sm `h-5 w-9`), clip `4px`/`3px`, border + inset shadows like button, `bg-[#33332b]` off → `bg-amber`/`bg-danger`/`bg-military` on, hazard stripe overlay `opacity 0.10` when on, thumb square `18px` clip `2px` `bg-[#e6e1d3] border #9a958a` translating `2px → 20px`. Label `font-display uppercase text-sm` (amber when on). Use `Switch` for **every** boolean — never raw `input[type=checkbox]`.

### Input / Textarea / Select — HUD square

Base in `globals.css` + wrappers `Input.tsx / Select.tsx / Textarea.tsx / Field.tsx`:

- `bg-[#1a1a1a] border #3d3d34, clip 4px, px-3 py-2 text-sm, placeholder:text-zinc-500`
- Focus `border-amber ring-1 ring-amber/30`
- `Field` renders `label` as `font-display uppercase text-[11px] tracking-widest text-zinc-400` + optional `hint/error`.
- `Select` is `appearance-none` with custom `▾` and top highlight line. Never native rounded select.
- All `input,textarea,select` site-wide inherit this clip — even raw elements look HUD.

### Range `components/ui/Range.tsx`

`h-2 bg-[#1a1a1a] border #3d3d34 clip 4px`, thumb `h-4 w-4 bg-amber border #c98f00` clip `2px` + amber glow `shadow-[0_0_6px_rgba(242,169,0,0.4)]`. Track is not rounded.

### Chip / Multi-select `components/ui/Chip.tsx`

Square chips, clip `4px`, `px-2.5 py-1 text-xs font-medium border`, off `bg-[#1a1a1a] text-zinc-300 border-zinc-700 hover:border-amber/50`, on `bg-amber text-black border-amber shadow-[0_0_6px_rgba(242,169,0,0.35)]` (military/danger variants). Used for genres/platforms/tags/esrb multi-select. Wrap in `flex flex-wrap gap-1.5`.

### Badge `components/ui/Badge.tsx` / `status.tsx`

Square `clip 4px`, `border font-display uppercase`, sizes `sm: px-2 py-0.5 text-[11px]` / `md`. Variants `amber | military | danger | dim | sky | violet | emerald | neutral`. Replaces all pill badges. Use for tags, genres, metacritic, status.

### Item & effect artwork

Optional square `.webp` per catalog entry, **256×256** (512 px ceiling), ≤ 24 KB.
It replaces the entry's Heroicon glyph on every surface that shows the entry:
the wheel result, the inventory and status panels, the rules page, the admin
catalog, and the season wizard's pools and drop table. An entry with no artwork
keeps its glyph, so the catalog is never half-drawn while art is in progress.

What draws an entry, first match wins (spec §12, `iconSource`): its uploaded
**icon** (any pack; PNG or WebP, square, 64–512 px) → the **shipped artwork**
above (system pack only) → its **glyph** → its **pack's icon** → the kind's
glyph (`CubeIcon` / `BoltIcon`). Icons and artwork sit in the same frame, so
the square/hexagon rule below holds for both.

### Square is carried, hex is inflicted

The catalog pairs items and effects almost one to one — `lead_weights` grants
`heavy_boots`, `speed_boots` grants `tailwind`, `spare_die` grants `lucky`,
`jinx` grants `unlucky`. Any "heavy object" drawn for one reads identically as
the other, so the distinction cannot be left to the artwork. It is structural,
in `components/iee/IeeArtTile.tsx`:

|                                 | Frame                                                                            | Tint                         |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| **Item** — a thing in your bag  | 4px clipped square, the house cut used by every other control: an inventory slot | amber; danger when cursed    |
| **Effect** — a state you are in | **hexagon**                                                                      | polarity (danger / military) |

The hexagon is the one shape in the interface that is deliberately _not_ the
house cut, because its whole job is to not look like a slot. It stays angular,
so §1.3 still holds — this is the single documented exception, and it exists to
carry meaning rather than decoration.

**Consequence for the artwork: keep content inside the central ~75%.** An
effect's image is hex-cropped, so anything in the corners is lost. This is the
usual icon safe-area rule; it is not optional here.

**Items that are never used** (wave A). A cursed item is carried but
inflicted: in the inventory its card takes the penalty's frame and stripe
(`border-danger/40 bg-danger/10`, `bg-danger`), its square tile the danger
tint, a `danger` "Cursed" badge and a `FireIcon` "Works by itself" meta — and
no Use button. A passive item keeps the amber card with a `military`
"Passive" badge and a `BoltIcon` "Works while you hold it". An item that asks
the player to pick (spec §6.10, «Амулет очищения») opens the same modal as the
target picker, listing the player's own statuses and items it may take — each
a row with its `sm` tile (hexagon or square) and name; an item with a target
filter lists only the players the filter allows. A status that lasts until
the next game shows its meter full, labelled "Until your next game is over".

**The next game** (wave C). An item that asks for a pick for the next game
opens the same modal: a genre or a decade as a grid of rows — genre names as
the catalog spells them, decades as `1990–1999` in the counter face — and a
game as a search box over a list of titles, searched as the player types,
from what the season's pool could hand them. A choice of games (spec §7.12)
is a `hud-card` panel of its own above the inventory, `CubeIcon` and the count
in its heading: one card per game — the cover (128px tall; a `PhotoIcon`
placeholder without one), the title in the display face, the platform,
`GameMetaBadges` and `GameCategoryChips` as on the roll card — and a
full-width primary "Take this one". While it waits, the roll card's button is
disabled and its hint, in amber, points at the panel.

**Completion conditions** (wave C, spec §6.17) are one block wherever a game
is shown with what it must be passed with — the roll card under the game's
chips, each game of the history, the judge's completion request: an
amber-ruled aside, `FlagIcon` and "Completion conditions" in the display face
at 10px, then one line per condition in the reader's language (Russian where
the entry has none) and, in the counter face, "from «Entry»". The roll card
adds the one-line hint that the game counts as passed only with them; the
history and the request show the list alone.

**Objects on the board** (wave D, spec §6.18) are drawn where the cell is: on
the grid tile a 20px marker — the item's glyph in a clipped square frame,
amber, red for a cursed item — sits at the top right, before the occupants
count; the list row shows it at 24px before the avatars, and the dashboard's
track at 16px in the cell's top-left corner, its tooltip naming the object
and its owner. The marker is the
one place `IeeIcon` appears outside the tuning surfaces: a board cell has no
room for a tile, and the marker only says something stands there. The cell's
modal introduces it properly — `MapPinIcon` and "Object on the cell" in the
counter face, `IeeArtTile` `sm`, the name, the rule text and "Placed by …"
linking the owner's profile, then the one-line hint that a move meets it
first.

### Sizes: discovery vs tuning

`IeeArtTile` — the picture leads, the text follows. Used where a reader is
meeting the entry: `lg` (96px) on the wheel result, `md` (56px) in the
inventory, the status panel and the catalog card, `sm` (40px) on the rules
page.

`IeeIcon` — the bare 16–20px glyph, for the _tuning_ surfaces only: the season
wizard's pool rows and drop table, where a dozen entries are scanned to adjust
numbers and a picture per row would be noise.

Full-bleed illustrations with their own background work at `md` and `lg`;
below that they collapse into a coloured square. Transparent, flat art in the
glyph idiom works at every size. Mixing the two styles across one catalog looks
accidental, so pick one and finish the set.

The recipe and the naming rule are in `AGENTS.md` §5; the rule is enforced by
tests, not by convention.

**Status colours are not a per-page choice.** They live in
`lib/shared/ui/status-variants.ts` and are rendered only through `StatusBadge`,
which takes `kind="season" | "player"` because both enums contain `finished`
and it means opposite things — a finished season is over, a finished player
completed the run. Season statuses carry a glyph, player statuses do not: a
season badge appears once per page or once per admin row, while player badges
appear thirty at a time down a leaderboard where a repeated glyph is noise.

| Season     | Variant                 | Why                                                                     |
| ---------- | ----------------------- | ----------------------------------------------------------------------- |
| `draft`    | `dim`                   | idle, not started                                                       |
| `active`   | `military`              | live                                                                    |
| `paused`   | `amber`                 | needs attention                                                         |
| `finished` | `neutral` + check glyph | over, nothing to act on — **never `danger`**, which is reserved for 1.2 |
| `archived` | `dim` + archive glyph   | idle                                                                    |

The glyph, not a sixth hue, is what separates the three idle statuses. Adding a
status colour outside 1.2 dilutes the four that already carry meaning.

### Season catalog rows (wizard, "Items & Effects")

One row per library entry, in the pool it drops from. The `Switch` means
**drops from the wheel**; an entry attached only because another hands it out
stays switched off and says so on a `text-dim` mono line with a `LinkIcon`
("Handed out by … — attached, does not drop"). Badges after the name, in this
order: kind (`emerald` item / `violet` effect), the pack (`dim`, only when the
library offers more than one pack — the pack filter chips appear with it), the
pinned revision (`neutral` mono `r{n}`, only for an entry with several), and
an over-power warning (`danger` with `ExclamationTriangleIcon`, a warning, not
a block). A newer revision is offered under the rule text as an
`border-l-2 border-amber/40` block: the label in amber mono caps, what changes
(below), and a small `hud-btn` with `ArrowPathIcon` to switch — the old text stays
visible above it until the admin does. An entry the library no longer offers
keeps its row with a `text-dim` note; once detached, its switch is disabled.
The season-wide limits sit in their own `hud-card` above the pools.

Switching a pinned revision is never silent: the newer-revision block lists
**what changes** — name, rule text, flavor, character, rarity, usage, duration,
stacking, tags, power — each as `old` (dim, struck through) → `new`
(`components/admin/RevisionDiff.tsx`), and the revision picker in the advanced
row opens the same list in a `Modal` before anything is switched.

Under each pool, the **drop table**: one line per slice — the entry's icon and
name, an amber bar, its share as an `ammo-counter`, and after "Simulate 1000
spins" the observed share beside it in `text-dim`. The mono line under the
table says how many spins ran and the largest gap from the table, `military`
"within chance" when every slice is within four standard deviations of its
share and `danger` when chance does not explain it.

### Constructor (`/admin/catalog`, admin only)

Three screens behind the catalog tabs — **Library**, **Pack**, **Entry** — the
last two appearing as tabs only while one is open (`Pack: <name>`,
`Entry: <name>`), separated from the browse tabs by a 1px rule.

- **Library.** Pack cards (`hud-card hud-lift`, a `PackTile`: the house square,
  amber, the pack's icon or `Square3Stack3DIcon`) and one dense row per entry
  (`IeeArtTile sm`, name, mono slug, the rule text at `dense`), badges in this
  order: kind (`emerald`/`violet`), character (`military`/`danger`), rarity,
  pack (only with several), **state** — `dim` "Not published", `amber`
  "Changed since rN", `neutral` mono `rN` — then errors (`danger`). Filters are
  the shared `IeeFilterBar`.
- **Pack.** A header card (large `PackTile` with upload/remove, name, slug,
  badges; Publish pack as the primary button, Export with a "Full history"
  switch, Archive as `hud-btn-danger` behind a confirmation). Left column:
  entries with their revisions, then **what publishing would do** — ready
  entries, and blocked ones with the checks' sentences in `danger`. Right
  column: the metadata form, "Attach to a season" (opens the wizard on the IEE
  stage filtered to the pack), dependencies as small link buttons.
- **Entry editor.** Forms on the left, one `hud-card` block each with an
  anchor (`block-basics`, `-usage`, `-rules`, `-duration`, `-limits`,
  `-interaction`, `-scenarios`, `-sandbox`) and an error count badge in its heading. A **rule** is a card
  with the 6px cut: rows **When · If · Do** with amber labels; every field is a
  typed control (select, chips, number, the `Number | Parameter | Random`
  chips of a value, an entry picker grouped by pack). Where the rule text can
  list it (an out-of-turn move) a fourth chip, **Die table**, turns the value
  into a die and its rows: "Die: d" with a mono number, then one row per
  stretch of faces — "up to" a mono number (the last row's follows the die and
  is disabled), `→`, the value — with a `TrashIcon` per row past the second
  and "Add a row" (`PlusIcon`, small `hud-btn`) under them. Where a number
  may read the game (wave A: the distance, points, the dice result, an
  out-of-turn move) and the moment knows something, a chip **From the game**
  turns it into a select of what it reads — the dice result, items held, the
  chosen player's last roll — and, for items held, a select of which (all,
  bonus, cursed) and a mono "per item" number. An **instant**
  duration hides the count and the stacking chips behind one `zinc-400` line
  ("an instant effect keeps nothing…"), and its rules offer only "When
  applied"; **Until the next game** hides the count only. What a moment cannot
  hold is never offered; what no longer fits after a change stays, marked: a
  `danger` left border on the condition or action and the check's sentence
  under it. Each card ends with **Reads** — the rule's generated sentence, or an
  `amber` note while it does not check. On the right, sticky: the preview — the
  dashboard's own card (`PlayerEntryCard`), square for an item, hexagon for an
  effect, with a RU/EN/UK switch — the rule text in all three languages, power
  (`font-display` number, then "By power alone: Rare" and, when the power is
  more than the entry's rarity carries, an `amber` badge; rarity also marks
  what is unique, so nothing flags an entry weaker than its rarity), checks (`military` "no errors", `danger` errors,
  `amber` warnings, each a button that scrolls to its field), revisions and
  seasons. Save and Publish sit in the header and on top of the panel; unsaved
  work shows an `amber` badge.
- **Scenarios** (`block-scenarios`, last on the left). The block's heading
  carries **Run scenarios** (`PlayIcon`, plain `hud-btn`, enabled in read-only
  too — running reads nothing back) and the mono count "N of M green"
  (`military` when all are, `danger` when any is red). Each scenario is a card
  with the 6px cut, its border `military/40` when green and `danger/50` when
  red; the header holds "Scenario N", a status `Badge` — `military` Green,
  `danger` Red, `dim` Not run, `amber` Changed since the run — the mono code
  input and duplicate / up / down / remove. Under the promise (three inputs)
  and the optional note come two amber-labelled rows: **Given** — the holder
  and the rival side by side (cell, points, last roll, the two switches, what each
  carries as entry + copies rows) above the season's three settings — and
  **When · Then**, a list of steps with the rules' left border (`danger` when
  a check misses, `military/60` when all hold). A turn's step is five inputs in
  a row — who rolls, the game, the dice total, **Then the dice draw** (a text
  input of faces, "1, 4": the dice thrown again and a second throw, in order;
  empty means none) and the cell. A step's checks include where each player
  stands after it ("The holder stands on cell", "The rival stands on cell",
  0–39) — what shows an out-of-turn move. Each check is a row: label,
  typed control, and under it the last run's word — `military`
  `CheckCircleIcon` "Holds", or `danger` "Expected X, got Y" with **Take what
  happened** as an underlined text button. A step that could not run says why
  in `danger` with `XCircleIcon`; **What happened** is a closed `<details>`
  listing everything the step did, the material for its next check. The card
  ends with **Reads**, the scenario as sentences. The verdicts are re-read
  against the form as it changes: editing an expectation never needs a run,
  editing Given, When or the rules turns the card to Not run / Changed. The
  panel's checks add a "Scenarios" line with the same count, and say in
  `danger` that scenarios are red instead of "no errors".
- **Sandbox** (`block-sandbox`, after Scenarios). One row of controls — bots
  (select 2–4), rounds (mono number, 1–50), seed (mono input with an
  `ArrowPathIcon` "new seed" button that empties it), two small switches
  (start with the entry, `core` on the wheels) — and **Play** as the primary
  button on the right. After a run: a mono line "Seed · bots · rounds played",
  then two tables side by side on wide screens (Bots: cell, points, status,
  holds; Entries: dropped, handed out, used, fired, ran out, cells — numbers in
  mono, right-aligned, the entry under test in `amber`), then **Turns**: one
  `<details>` per round with the rules' left border, the first three open,
  each turn a line — the bot, a `military`/`danger` passed/dropped badge, mono
  dice and "from → to", the cell type, the wheel in `amber`, the points — with
  its item uses under it (`danger` when refused) and its journal rows in small
  mono `zinc-500`. A switch shows only the turns the entry took part in (on by
  default). A change to what the entry plays shows an `amber` "Changed since
  the run" badge in the block's heading; the seed stays in its box, so Play
  repeats the run.
- **Read-only** (the system pack in production, anything archived): the same
  screens, controls disabled, an `amber` notice strip with `LockClosedIcon`,
  and "Copy to my pack" as the way to change it.

A player card shows the entry's hand-written **flavor** line under its rule
text, `italic text-zinc-400`; it is never the rule text and never says what the
entry does.

---

## 5. Data Display

### Tables

`hud-card p-4 overflow-x-auto` wrapper, `thead text-dim text-left border-b border-[#3d3d34]`, rows `border-b border-[#2a2a22]`, cells `p-2`, mono for numbers (`ammo-counter`). Badges inside cells use `Badge`.

### Board

Cells `w-8 h-8 border [clip-path:polygon(4px_0,…)]` with `typeBg` (`bonus emerald`, `penalty red`, `teleport violet`, `event sky`, `start zinc-600 border-amber`). Strip bar `h-2 flex clip 3px`.

### Stat

`StatTile` / `hud-card` with `font-display` value, `text-dim` label.

---

## 6. Navigation

Headers `SiteHeader.tsx` / `AdminHeader.tsx`: `sticky top-0 z-40 border-b bg-[#151514]/95 backdrop-blur-sm`, nav links `font-display uppercase`, active amber. Tabs in `SeasonSettingsForm`: `border-b-2`, solid `border-amber bg-amber text-black` when active (bright amber = the current selection), else `text-zinc-400 hover:text-amber`. The wizard progress bar below follows the same rule: the current stage is solid amber, confirmed stages pale (`bg-amber/35`), unsaved edits hazard-striped, pending `zinc-800`.

---

## 7. Feedback

Loaders `hud-loader-*` (blink, pulse). Alerts use `hud-card` with `border-danger/30 bg-danger/10` or `border-emerald-800 bg-emerald-950/30` and clip `4px`. `FormShell` shows `state.error` (danger) / `state.ok` (military).

## 8. Motion & Accessibility

- Durations `120–240ms ease-out`, only composited props (`opacity` / `transform` / `clip-path` / `filter`).
- `focus-visible: 2px solid amber, offset 2px` (see `globals.css`).
- Switch `role="switch" aria-checked`, keyboard `Space/Enter`.
- `prefers-reduced-motion: reduce` kills scanline, loader and all `animate-hud-*` animations and press/lift transforms.

### Page transitions

- `components/ui/PageTransition.tsx` wraps `{children}` in `app/layout.tsx`. Keyed by `pathname`, replays `hud-page-in` (fade + `translateY(-8px)` + `clip-path` reveal, `240ms`) on every client-side route change. First load is not animated (no SSR/hydration flash). Use this wrapper everywhere — do not add per-page entrance animations. The slide offset must stay **negative**: a downward offset would momentarily extend the document's scrollable overflow and flash a vertical scrollbar during the animation. The final keyframe must end at `transform: none` — `fill-mode: both` retains it forever, and a retained transform would turn the wrapper into the containing block for every `position: fixed` descendant.

### Modal

- `components/ui/Modal.tsx` — controlled `open`/`onClose`; rendered through a portal to `document.body` (a `position: fixed` overlay is positioned relative to the nearest ancestor with a transform/filter, so it must escape the React tree to be sized against the real viewport); centered on all breakpoints by a dedicated inner wrapper (`flex min-h-full items-center justify-center p-4`) inside the scrollable overlay — this keeps the panel fully scrollable when it is taller than the viewport (a bare `items-center` on the scroll container would clip the unreachable top); entrance `hud-backdrop-in` (fade `160ms`) + `hud-panel-in` (scale `0.96→1` + `translateY(12px)`, `200ms`), exit `hud-panel-out`/`hud-backdrop-out` (`160ms ease-in`) before unmount, with the last non-null `children` kept rendered so the panel does not collapse mid-animation. Escape, backdrop click, body scroll lock with scrollbar-gap compensation (`padding-right` on `<body>` equal to the scrollbar width, so the page does not shift when the scrollbar disappears), initial focus. Always animate new modals through this component (board cell details, dialogs).

### Press & lift

- `.hud-btn:active` → `translateY(1px)` (press). `.hud-lift:hover` → `translateY(-2px)` + `brightness(1.06)` on interactive cards (SeasonCard, template cards). Chip `active:translate-y-px`, Switch track `active:brightness-90`.
- Keyframes live in `app/globals.css` (Motion section). The only animation library is `framer-motion`: shared primitives in `components/ui/motion.tsx` (`Reveal`, `Stagger`/`StaggerItem`, `FadeSwitch` — all `160–200ms ease-out`, opacity + `translateY(8px)` only, always under `MotionConfig reducedMotion="user"`) drive client compositions — board grid/linear switch (`AnimatePresence mode="wait"`), cell stagger, roster enter + `layout`, keyed cell-modal content, archive filter switch, games history, feed filter tabs (active pill via shared-`layoutId`, list via `FadeSwitch`) — plus the board token flight (`0.55s ease-out`, the one deliberate exception: a token crossing the board must read as movement). Server-rendered lists stay CSS: `animate-hud-rise` for cards/rows (stagger via inline `animation-delay`, 30ms steps capped ~300ms) and `animate-hud-fade` for table rows (transforms on `<tr>` are unreliable — opacity only). Live client data goes through React Query (`components/feed/feed-explorer.tsx` is the reference: scoped `QueryClient`, per-filter keys, `keepPreviousData`, `initialData` from the server paint so mounting never refetches, 30s poll for live surfaces).

---

## 9. Rules — Do / Don't

- Do: use `Input / Select / Textarea / Chip / Badge / Switch / Range / Field` from `components/ui`.
- Do: square clipped corners, `hud-card`, `hud-btn`, `Badge`/`Chip` square.
- Don't: `rounded-full`, `rounded-md`, pill chips, native checkbox, soft `shadow-lg`, pastel colors, `rounded` inputs.
- Don't: write raw `input type="checkbox"` — use `Switch`.
- Don't: add new colors outside amber/military/danger/dim/sky/violet/emerald.
- Don't: introduce new rounding or blur that breaks the tactical feel.

---

## 10. Implementation Map

- Theme tokens & base: `app/globals.css` (`:root`, `@theme inline`, `body`, `input,textarea,select`, `hud-card`, `hud-btn`, `hazard-tape`, scrollbars).
- Switch: `components/ui/Switch.tsx` — square, variants default/danger/military.
- Inputs: `components/ui/Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Field.tsx`, `Range.tsx` — all `clip 4px`.
- Chips/Badges: `Chip.tsx`, `Badge.tsx`, `status.tsx` — square, clip `4px`.
- Season settings: `components/admin/SeasonSettingsForm.tsx` — templates (Badge), dice/points (Range/Input/Switch), board (Range/Select/Switch/Input + bar), pool (Chip multi-select, Select, Input, Switch).
- Catalog: `components/admin/GamesCatalogManager.tsx` — Field/Input/Select, result cards `clip 6px`, Badge for genres/tags/meta.
- Auth: `app/(public)/login|register/page.tsx` — Field/Input.

When adding a new screen, start from these components — do not invent new input/badge shapes.
