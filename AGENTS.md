# Repository Guidelines

## Project Overview

GGRun — веб-платформа сезонного игрового ивента (HPG-жанр): сезоны («забеги»), поле из клеток, ролл случайной игры, исход (passed/dropped/rerolled), бросок кубика и движение по полю, лидерборд, лента событий, админ-консоль. Спецификация — `PLAN.md` (источник требований для агентов).

## Architecture & Data Flow

Четыре слоя, направление импортов строго вниз:

```
app/ (route groups)  +  thin "use server" actions   ← presentation
lib/use-cases/          zod-validate → domain → tx  ← application
game-engine/            чистый TS, правила игры     ← domain
lib/repositories/, lib/db.ts, lib/auth/             ← infrastructure
```

- **Инвариант домена**: `game-engine/` не импортирует `next/*`, `react`, `drizzle-orm`, `pg`. Закреплено конвенцией (doc-комментарии в `game-engine/index.ts`, `types.ts`), ESLint-правила нет — не добавляй такие импорты.
- **Случайность только на сервере**: движок принимает `rng: () => number` (DI для тестов); use-cases передают `Math.random` — клиент не может подделать кубик.
- **Ошибки как коды**: use-cases бросают `GameLoopError(code)` / `AdminError(code, params)` / `AuthError(code)`; `"use server"`-экшены ловят их и переводят через `errorText(t.core.errors, code, params)` (`lib/i18n/errors.ts`). Домен не знает о языках UI.
- **Аудит двухуровневый**: `logAdminAction` → `admin_audit_log` (каждая мутация staff, просмотр в `/admin/audit`); `logEvent` → `event_log` (публичная лента). Пишутся внутри тех же транзакций в use-cases.

Поток хода: `rollAction` → `rollNewGame` (random из каталога, исключая блэклист и сыгранное) → игрок отмечает исход → `resolveAction` → `resolveGameRoll` → `resolveMovement` (движок) → `applyCellEffect` + `normalizePosition` → транзакция: `game_rolls` + `moves` + `ledger_entries` + `event_log`.

## Key Directories

| Путь | Назначение |
| --- | --- |
| `app/(public)/` | Публичный shell: лендинг, `/board`, `/leaderboard`, `/feed`, `/rules`, `/players/[username]`, `/login`, `/register`, `/dashboard` |
| `app/admin/` | Админ-консоль (свой layout-guard): дашборд, `seasons/` + `seasons/[id]/{board,players}`, `users`, `games-catalog`, `audit` |
| `game-engine/` | Домен: `dice.ts`, `movement.ts`, `roll-state-machine.ts`, `cell-effects.ts`, `config.ts`, `types.ts` + колокационные `*.test.ts` |
| `lib/use-cases/` | Бизнес-логика: `resolve-game-roll.ts`, `admin.ts`, `users.ts`, `auth.ts` + `*-actions.ts` (серверные экшены) |
| `lib/repositories/` | Доступ к БД: `seasons.repo.ts`, `players.repo.ts`, `games.repo.ts`, `events.repo.ts` |
| `lib/auth/` | `session.ts` (cookie-сессии, sha256-токены), `password.ts` (scrypt), `actions.ts`, `dev-login.ts` (dev-only) |
| `lib/i18n/` | `config.ts`, `server.ts` (`getT()`), `client.tsx` (`useI18n`), `format.ts`, `widen.ts`, `errors.ts`, `dictionaries/{en,ru,uk}/` |
| `db/schema.ts` | Drizzle-схема — источник правды типов (12 таблиц, 5 pg-enum'ов) |
| `drizzle/` | Сгенерированные SQL-миграции |
| `scripts/` | `bootstrap-admin.ts`, `seed-demo.ts` (tsx + dotenv) |

## Development Commands

```bash
pnpm install
pnpm dev                        # next dev --turbopack, порт 3000
pnpm build                      # next build --turbopack
pnpm lint                       # eslint (flat config)
pnpm test                       # vitest run (домен)
pnpm drizzle-kit generate       # SQL-миграция в drizzle/ после правки db/schema.ts
pnpm drizzle-kit push           # применить схему к БД
pnpm exec tsx scripts/seed-demo.ts        # демо-сезон run-1, поле 40 клеток, 8 игр (идемпотентен)
pnpm exec tsx scripts/bootstrap-admin.ts  # первый админ из BOOTSTRAP_ADMIN_* в .env
```

БД: PostgreSQL 17 (OSPanel) на `127.127.126.56:5432`, база `ggrun`. Переменные — см. `.env.example` (`DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`; Steam/IGDB — backlog).

## Code Conventions & Common Patterns

- **Где что писать**: бизнес-логика — только `lib/use-cases/*`. Файлы `*-actions.ts` с `"use server"` — тонкие адаптеры FormData: parse → try/catch use-case → `{error?}`/`{ok?}` (форма для `useActionState`, первый аргумент `_prev`) → `revalidatePath` при успехе. Простые экшены (`logoutAction`, `blockUserAction`) — void-хендлеры `<form action={...}>` без useActionState.
- **i18n обязательна для UI-строк**: серверные компоненты — `const { t, locale } = await getT()` → `t.namespace.key`; клиентские — `useI18n()` (провайдер в `app/layout.tsx`). Интерполяция — только `format("шаблон {x}", { x })` (`lib/i18n/format.ts`). Новый язык: скопировать `lib/i18n/dictionaries/en/*.ts` в новую папку, аннотации `Widen<typeof EnNs.ns>`, зарегистрировать в `LOCALES` (`config.ts`) и `dictionaries/index.ts`.
- **Словари RSC-сериализуемы**: значения — только строки, никаких функций; `pickCore()` в `dictionaries/index.ts` собирает plain-object из экспортов core. `Widen<T>` (`lib/i18n/widen.ts`) расширяет as-const литералы en до `string`, чтобы ru/uk требовали ту же структуру, но не те же литералы.
- **Confirm в серверных формах**: клиентский `components/admin/ConfirmButton.tsx` (onClick → `window.confirm` → `preventDefault` при отмене). Серверный компонент не может передать `onSubmit` — не пытайся.
- **Гварды**: `app/admin/layout.tsx` редиректит не-staff; `requireAdmin` (`lib/use-cases/users.ts`) строже `requireStaff` — судья не управляет пользователями. Самоблок/самоудаление/саморазжалование запрещены (коды `adminSelf*`).
- **Статусы сезона**: явная карта переходов `draft→active→paused→finished→archived` (`lib/use-cases/admin.ts`); переход в `active` сбрасывает позиции/балансы участников. Ролл-FSM `rolled→in_progress→passed|dropped|rerolled`; use-case считает `rolled` → `in_progress` в момент отметки исхода (`effectiveStatus`).
- **Форматирование**: Prettier (double quotes, semi, 100 cols), ESLint `next/core-web-vitals` + `next/typescript` + prettier. Коммиты — conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `style:`).

## Important Files

- `db/schema.ts` — все таблицы/enums/типы (`$inferSelect`); правка схемы → `drizzle-kit generate` + `push`.
- `game-engine/config.ts` — `DEFAULT_SEASON_CONFIG` + `SeasonConfigSchema` (Zod, парсит частичный JSONB из `seasons.config`).
- `game-engine/cell-effects.ts` — plugin-реестр `CELL_EFFECTS` (ключ — cellType или `config.effectKey`; penalty/bonus читают `config.amount`, teleport — `config.target`; неизвестный ключ → no-op). Точка расширения механик без миграций.
- `game-engine/roll-state-machine.ts` — `nextRollStatus` бросает `RangeError` на нелегальных переходах; `canReroll` / `requestReroll` — чистые хелперы.
- `lib/db.ts` — pg Pool (max 10, кэш на globalThis в dev) + drizzle со схемой.
- `lib/auth/session.ts` — `getCurrentUser()` (React `cache()`, фильтрует `isBlocked`), `isStaff` = admin|judge.
- `app/admin/layout.tsx`, `app/(public)/layout.tsx` — два shell'а с разными шапками.

## Runtime/Tooling Preferences

- **Пакетный менеджер — pnpm** (lockfile v9). Node ≥ 20.
- Next 15.5 App Router, React 19, Turbopack в dev и build. TS strict, `@/*` → корень репо.
- Tailwind v4 через `@tailwindcss/postcss` (отдельного конфига нет; HUD-тема — CSS-переменные и классы `hud-*`/`ammo-counter`/`hazard-tape` в `app/globals.css`).
- Windows/OSPanel-окружение: БД стартуется модулем OSPanel; абсолютные пути в коде не хардкодить.
- CI отсутствует; husky/lint-staged в devDeps, но pre-commit хуки не подключены — не рассчитывай на них.

## Testing & QA

- **Vitest**, файлы колокационны: `game-engine/<module>.test.ts`. Запуск: `pnpm test`.
- Покрыты все ветки домена: кубики (грани/валидация), движение (passed/dropped, расход баланса, множитель стрика, clamp vs wrap), FSM (легальные/нелегальные переходы, лимит рероллов), эффекты клеток (все типы + plugin-роутинг по `effectKey`), Zod-конфиг (дефолты/отклонения). Стиль: чистые детерминированные функции с инжектируемым `rng`, без моков/БД/DOM.
- Тестов вне `game-engine/` нет; при добавлении UI-тестов держи их рядом с тестируемым модулем и не тяни в них БД.
- Перед сдачей изменений: `pnpm lint` + `pnpm exec tsc --noEmit` + `pnpm test` + `pnpm build`; поведенческие правки проверять на живом dev-сервере.
