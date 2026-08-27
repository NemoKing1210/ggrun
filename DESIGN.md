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

| Token | Value | Use |
|---|---|---|
| `--hud-bg` | `#1b1b1a` | Page background (with scanline repeat) |
| `--hud-bg-raised` | `#2a2a22` | `hud-card` |
| `--hud-amber` | `#f2a900` | Primary, active, focus |
| `--hud-green` | `#7c8f4a` | Success / military |
| `--hud-red` | `#b0341f` | Danger / penalty |
| `--hud-text` | `#e6e1d3` | Body |
| `--hud-text-dim` | `#9a958a` | Labels, hints |

Tailwind `@theme inline` maps these to `bg-amber`, `border-amber`, `text-military`, `text-danger`, `text-dim`, `bg-raised`.

### Typography

- Display: `var(--font-stencil)` / `font-display` — headings, buttons, badges, stat numbers. `uppercase tracking-widest/wider`.
- Mono: `var(--font-tech-mono)` / `font-mono` — positions, codes, ammo-counter.
- Body: `var(--font-body)` — UI text.

Scale is tight: `xs` for hints, `sm` for labels, `xl`/`3xl` display for page titles.

### Spacing & Borders

- Card padding `p-4`, gap `gap-3 / gap-4`, section gap `gap-6`.
- Borders `1px solid #3d3d34` (card) / `#55554a` (button off) / `#c98f00` (amber active) / `#8a2817` (danger).
- Clip sizes: buttons/cards `8px` or `6px`, inputs/selects/chips/badges/switches `4px` (small switch `3px`, thumb `2px`). Never `rounded`.

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

Headers `SiteHeader.tsx` / `AdminHeader.tsx`: `sticky top-0 z-40 border-b bg-[#151514]/95 backdrop-blur-sm`, nav links `font-display uppercase`, active amber. Tabs in `SeasonSettingsForm`: `border-b-2` `border-amber text-amber bg-amber/10` when active, else `text-zinc-400 hover:text-amber`.

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
- Keyframes live in `app/globals.css` (Motion section). Do not add new animation libraries; CSS keyframes keep the bundle small and match the tactical feel.

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
