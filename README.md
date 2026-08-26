# GGRun — платформа игрового забега

Веб-платформа для командного/соревновательного игрового ивента в жанре HPG:
сезоны («забеги»), поле из клеток, ролл случайной игры, исход (пройдено/дроп/реролл),
бросок кубика и движение по полю, лидерборд, лента событий и админка.

ТЗ и план: [PLAN.md](./PLAN.md).

## Стек

- **Next.js 15** (App Router, Server Actions, RSC), TypeScript strict
- **Tailwind CSS v4** + кастомная HUD-тема (вайб GoldSrc-эпохи, оригинальные ассеты)
- **PostgreSQL + Drizzle ORM** (миграции `drizzle-kit`)
- **Собственная cookie-сессии auth** (scrypt-хеши, таблица `sessions`) — без внешних провайдеров
- **Zod** — общие схемы (конфиг сезона валидируется `SeasonConfigSchema` из движка)
- **Vitest** — юнит-тесты доменного движка

## Архитектура

```
presentation   → app/            страницы, тонкие server actions
application    → lib/use-cases/  оркестрация (валидация → домен → запись)
domain         → game-engine/    чистый TS без next/react/drizzle/pg (правила игры)
infrastructure → lib/repositories/, lib/db.ts, lib/auth/
```

Домен (`game-engine/`) не знает ни о БД, ни о HTTP — переиспользуем в боте/CLI без правок.
Случайные числа генерируются только на сервере; клиент не может подделать бросок.

## Запуск локально

1. Postgres 17 (в OSPanel — модуль PostgreSQL-17 слушает `127.127.126.56:5432`,
   БД `ggrun`). Настроить `DATABASE_URL` в `.env`.
2. Установка и миграция:

   ```bash
   pnpm install
   pnpm drizzle-kit push        # применить схему (или pnpm drizzle-kit generate)
   ```

3. Демо-данные (сезон run-1, поле 40 клеток, 8 игр):

   ```bash
   pnpm exec tsx scripts/seed-demo.ts
   ```

4. Первый администратор (берёт BOOTSTRAP_ADMIN_EMAIL/PASSWORD из `.env`):

   ```bash
   pnpm exec tsx scripts/bootstrap-admin.ts
   ```

5. Dev-сервер:

   ```bash
   pnpm dev                      # http://localhost:3000
   ```

## Переменные окружения

См. [.env.example](./.env.example). Секреты не коммитятся.

## Скрипты

| Команда             | Назначение                          |
| ------------------- | ----------------------------------- |
| `pnpm dev`          | dev-сервер Next.js                  |
| `pnpm build`        | прод-сборка                         |
| `pnpm lint`         | ESLint                              |
| `pnpm test`         | Vitest (юнит-тесты движка)          |
| `pnpm drizzle-kit`  | миграции схемы                      |

## Структура

```
app/                  публичные страницы, /dashboard, /admin
components/           HUD-компоненты (board, dice, dashboard, admin, ui)
game-engine/          чистый домен: кубики, движение, FSM ролла, эффекты клеток
lib/db.ts             Drizzle + пул pg
lib/repositories/     доступ к данным
lib/use-cases/        resolve-game-roll, admin, auth (+ *-actions.ts серверные экшены)
db/schema.ts          схема БД (источник правды типов)
drizzle/              SQL-миграции
scripts/              bootstrap-admin.ts, seed-demo.ts
```

## Расширяемость

Новые механики добавляются через plugin-реестр эффектов клеток
(`game-engine/cell-effects.ts`, ключ — тип клетки или `cell.config.effectKey`),
через конфиг сезона (`seasons.config` JSONB, валидируется Zod) и отдельные модули —
без переписывания ядра. См. PLAN.md §6.4.
