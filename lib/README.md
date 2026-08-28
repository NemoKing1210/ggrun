# lib — Application Architecture

> See `AGENTS.md` — 4 layers, imports point **strictly downward**.

```
app/ (routes)  +  thin "use server" actions        ← presentation
lib/modules/*/  (repository + service + actions)   ← application (vertical slices)
lib/engine/                                       ← domain (pure TS, no next/react/drizzle)
lib/infrastructure/{db,auth,http,logger,events}   ← infrastructure
lib/shared/{ui,utils,constants,types,stores}      ← leaf, no deps on app
```

Cross-cutting: `lib/config/` (env), `lib/errors/` (AppError), `lib/use-cases/`
(cross-module action adapters only), `lib/i18n/`.

## Folder Guide

| Path | Role | Imports |
|------|------|---------|
| `lib/modules/*/` | Vertical slices: `auth`, `season`, `player`, `game`, `catalog`, `moderation`, `site-settings` — each: `repository/` (drizzle queries), `service/` (business logic), `actions/` (thin `"use server"` adapters), `index.ts` barrel | `engine`, `infrastructure/*`, `shared`, `i18n` |
| `lib/engine/` | Pure domain: `types/`, `config/`, `dice/`, `board/{movement,cell-effects}`, `roll/` — `rng` injected | Nothing (leaf) |
| `lib/infrastructure/` | `db/` (drizzle pool + health), `auth/` (`session`, `password`, `dev-login`), `http/` (`external-fetch` + proxy), `events/` (`logAdminAction`, `logEvent`), `logger/` | `shared`, `config` |
| `lib/shared/` | `types/{action-state,pagination}`, `ui/`, `utils/`, `constants/`, `stores/` | Nothing from `lib/*` (leaf) |
| `lib/use-cases/` | Only cross-module adapters: `admin/actions/{helpers,types}` (`toError`, `revalidateAdmin`, `AdminFormState`), `shared/action-error` (`makeToError`, `ActionState`) | `modules/*`, `infrastructure/*`, `i18n`, `shared` |
| `lib/config/` | `env.ts` — zod-validated `getEnv()` | `process.env` only |
| `lib/errors/` | `app-error.ts` — `AppError` base + `ErrorCode` union; `AdminError`/`GameLoopError`/`AuthError` extend it | `shared` |
| `lib/i18n/` | `getT()`, `useI18n()`, `format()`, `errors.ts`, `dictionaries/{en,ru,uk}` | `shared` |

## Rules

- **Domain pure**: `lib/engine/` never imports `next/*`, `react`, `drizzle-orm`, `pg` — enforced by `eslint.config.mjs` (`no-restricted-imports`).
- **Randomness server-only**: engine takes `rng: () => number` (DI), use-cases pass `Math.random`.
- **Errors as codes**: use-cases throw `AppError(code)` / `AdminError` / `GameLoopError`; `"use server"` actions catch → `errorText(t.core.errors, code)` via `lib/i18n/errors.ts`.
- **Barrel boundaries**: `modules/*/index.ts` is the public API; components import `"use server"` actions from concrete files (barrel `export *` cannot re-export from `"use server"` files), types from `actions/types`.
- **No shims**: flat re-export files are forbidden — import canonical paths (`@/lib/shared/ui/accent`, `@/lib/infrastructure/db`, `@/lib/infrastructure/logger`, `@/lib/modules/*`).
- **Env**: use `getEnv()` from `lib/config/env.ts`, not `process.env` directly.

## Vertical vs Horizontal

Structure is **vertical** (`lib/modules/*` co-locate `repo + service + actions`).
Horizontal leftovers are gone: `lib/repositories/` and flat `lib/use-cases/*`
were deleted; `lib/infrastructure/` keeps only framework/DB adapters.

## Adding a feature

1. Add pure rule in `lib/engine/` + `*.test.ts`
2. Add `repository/` (drizzle queries) in `lib/modules/<feature>/`
3. Add `service/` (zod → domain → `db.transaction`) in `lib/modules/<feature>/`
4. Add thin `"use server"` action in `lib/modules/<feature>/actions/*.ts` (parse `FormData` → try/catch → `revalidatePath`), using `makeToError`/`AdminFormState` from `lib/use-cases/`
5. Export via `lib/modules/<feature>/index.ts` barrel
6. Wire in `app/` — server component calls `getT()` + service, client calls `useActionState(action)`

## Checks

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```