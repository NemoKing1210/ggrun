# ТЗ и план реализации: веб-платформа для игрового ивента (HPG-подобная механика)

> Этот документ — одновременно техническое задание и инструкция для ИИ-агента (Claude Code / Cursor / любой другой coding-агент), который будет реализовывать проект. Двигайся по фазам последовательно (раздел 9), сверяясь с моделью данных (раздел 5) и спецификацией фич (раздел 6). Если что-то не специфицировано явно — выбирай простое, расширяемое решение и фиксируй допущение в комментарии к коду.

## 0. Как агенту работать с этим документом

1. Не пытайся реализовать всё за один проход. Работай по чек-листам в разделе 9, фаза за фазой, с рабочим состоянием после каждой фазы (проект должен собираться и деплоиться на каждом шаге).
2. Игровая логика (движок) должна быть написана как чистые, не зависящие от фреймворка TypeScript-функции — это ключевое архитектурное требование, не UI-деталь.
3. Все конкретные числа правил (сколько очков, сколько граней у кубика, сколько клеток на поле) — это **конфигурация сезона**, а не константы в коде. Ниже даны разумные дефолты для MVP, их нужно вынести в `season.config` (JSONB) и админку.
4. Схема БД, названия таблиц и код ниже — референс, а не догма. Отклонения допустимы, если они улучшают консистентность и типобезопасность.
5. Всё, что помечено «Backlog / Фаза 8» — не блокирует MVP, но схема должна закладывать для этого место (не делать выбор, который потом придётся полностью переписывать).

---

## 1. Что мы строим

Веб-сайт для командного/соревновательного игрового ивента, где:

- есть один или несколько **сезонов («забегов»)** — ограниченный по времени прогон ивента со своим набором игроков, полем и правилами;
- у каждого сезона есть **игровое поле** — последовательность клеток разного типа (старт, финиш, обычная, штрафная, событие, бонус и т.д.);
- у каждого **игрока** есть позиция на поле, баланс очков, статус;
- игроку **выпадает игра** из общего пула (случайный ролл с фильтрами: платформа, жанр, уже пройденные игры и т.д.);
- игрок отмечает игру как **пройдена / дропнута / реролл**;
- в зависимости от исхода — **бросок кубика(ов)** и перемещение по полю с модификаторами (баланс очков, штрафные клетки и т.п.);
- есть публичный **лидерборд**, лента событий (кто что прошёл/дропнул — в духе стримерских «News»-постов) и профили игроков;
- есть **админка** (роль `admin`/`judge`) для запуска нового забега, редактирования поля, управления пулом игр, ручных корректировок очков, аудита действий.

Дизайн — олдскульный Valve-вайб (Half-Life 1 / Counter-Strike 1.6): HUD-элементы, крупные "ammo counter"-цифры, хазард-полосы, консольная эстетика меню — детали в разделе 8.

Проект должен быть написан так, чтобы через полгода в него было легко добавить инвентарь предметов, дейлики, магазин за внутриигровую валюту, глобальные модификаторы и т.п., не переписывая ядро.

---

## 2. Предметная область (жанр, а не конкретный чужой регламент)

Формат родился в русскоязычном стриминговом комьюнити (HPG, RGG-LAND и похожие ивенты) и в общих чертах устроен так: у каждого участника есть фишка на игровом поле; ход состоит из ролла случайной игры, её прохождения или дропа, и последующего броска кубика для движения по полю; на пути встречаются особые клетки, влияющие на баланс очков и позицию; ведущий/судья следит за соблюдением правил и может вмешиваться вручную.

**Важно:** не нужно копировать чей-то конкретный регламент (там сотни казуистичных правил, специфичных для конкретного комьюнити — «казна», «джейл», особые зоны и т.д.). Твоя задача — реализовать **гибкий движок**, поддерживающий этот общий костяк, а точные цифры и уникальные названия механик пользователь настроит под свой ивент через админку и конфиг сезона. Ниже (раздел 6.2) — разумный набор дефолтных правил для MVP.

---

## 3. Технологический стек


| Слой                    | Выбор                                                                                                                                                                     | Обоснование                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Фреймворк               | **Next.js 15** (App Router, React Server Components, Server Actions), TypeScript strict                                                                                   | нативный деплой на Vercel, RSC снижает объём JS на клиенте, Server Actions закрывают потребность в отдельном REST/RPC слое для мутаций        |
| UI                      | **Tailwind CSS v4** + **shadcn/ui** (headless-примитивы на Radix) как база, поверх — кастомная HUD-тема                                                                   | быстро строить, легко радикально перекрасить под ретро-стиль без борьбы с чужими готовыми стилями                                             |
| Состояние на клиенте    | React Server Components для данных, **TanStack Query** для realtime-зависимых кусков (лидерборд, лента), **Zustand** для локального UI-состояния (анимации кубика и т.п.) | не тащить Redux ради малого объёма клиентского стейта                                                                                         |
| Валидация               | **Zod**, общие схемы между клиентом и сервером                                                                                                                            | единый источник правды для форм и API                                                                                                         |
| БД / ORM                | **Postgres (Supabase)** + **Drizzle ORM** + `drizzle-kit` для миграций                                                                                                    | Drizzle — SQL-first, лёгкий, отлично работает в edge/serverless окружении Vercel, миграции — обычные `.sql`-файлы, совместимые с Supabase CLI |
| Auth                    | **Supabase Auth**: email magic link + OAuth (рекомендуется Twitch — аудитория ивента почти всегда стримерская/зрительская)                                                | нативная интеграция с RLS, не нужен отдельный auth-сервис                                                                                     |
| Realtime                | **Supabase Realtime** (Postgres Changes + Broadcast)                                                                                                                      | live-обновление доски/лидерборда без вебсокет-инфраструктуры своими руками                                                                    |
| Файлы                   | **Supabase Storage** (аватарки, обложки игр, кастомные ассеты поля)                                                                                                       | тот же провайдер, что и БД, единый биллинг                                                                                                    |
| Внешние данные об играх | Steam Web API / SteamSpy, опционально **IGDB API** (доступ через Twitch Dev Console — удобно, т.к. Twitch OAuth уже в проекте)                                            | автозаполнение обложек, жанров, платформ в каталоге игр                                                                                       |
| Уведомления (Backlog)   | Discord Webhook / Telegram Bot API                                                                                                                                        | трансляция ленты событий в комьюнити-чаты                                                                                                     |
| Тесты                   | **Vitest** + Testing Library (unit/integration), **Playwright** (e2e для критичных сценариев: ролл → исход → движение)                                                    | движок правил — код с высоким риском регрессий, must have unit-тесты                                                                          |
| Линт/формат             | ESLint (typescript-eslint) + Prettier + Husky pre-commit                                                                                                                  | стабильность стиля при развитии агентами/разными людьми                                                                                       |
| CI/CD                   | GitHub Actions → Vercel (preview на PR, prod на merge в main) + прогон Supabase-миграций в CI                                                                             | воспроизводимый, автоматический пайплайн                                                                                                      |
| Package manager         | **pnpm**                                                                                                                                                                  | быстрее npm/yarn, готов к workspace-монорепе, если проект вырастет                                                                            |


> Небольшая заметка по каталогу игр: раз уже есть опыт работы со Steam/SteamDB (DOM-скрапинг для юзерскриптов Комнатушки) и знакомство с IGDB/RAWG/Backloggd как источниками метаданных — для этого проекта нужен уже не DOM-скрапинг, а полноценный API-слой (Steam Web API/IGDB), но логику нормализации названий игр и работы с обложками из того опыта можно переиспользовать почти напрямую.

---

## 4. Архитектура

### 4.1 Принцип слоёв

```
presentation   → app/ (Next.js routes, React-компоненты, Server Actions как тонкие контроллеры)
application    → lib/use-cases/ (оркестрация: провалидировать → вызвать domain → сохранить → залогировать событие)
domain         → packages/game-engine/ (чистый TS, НИКАКИХ импортов из Next.js/Supabase — только правила игры)
infrastructure → lib/supabase/, lib/repositories/ (доступ к БД, внешним API, файлам)

```

Ключевое правило: **domain-слой не должен знать о существовании Supabase, Next.js или HTTP.** Это то, что делает архитектуру «гибкой для развития» — движок можно будет позже переиспользовать в Discord-боте, CLI-инструменте для судьи на стриме или мобильном приложении без модификаций.

Для MVP не обязательно делать это отдельным pnpm-пакетом — достаточно отдельной папки с чистыми модулями и запретом на импорт `next/*` или `@supabase/*` внутри неё (можно закрепить eslint-правилом `no-restricted-imports`). Вынести в отдельный пакет (`packages/game-engine`) стоит на Фазе 8, если появится второй потребитель (бот, мобильный клиент).

### 4.2 Структура репозитория (MVP, single-app)

```
hpg-platform/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                 # лендинг / текущий сезон
│   │   ├── board/page.tsx           # визуализация игрового поля
│   │   ├── leaderboard/page.tsx
│   │   ├── players/[slug]/page.tsx  # профиль игрока
│   │   ├── feed/page.tsx            # лента событий
│   │   └── rules/page.tsx
│   ├── (player)/
│   │   └── dashboard/page.tsx       # личный кабинет игрока: текущая игра, кнопки passed/dropped, инвентарь
│   ├── (admin)/
│   │   └── admin/
│   │       ├── seasons/             # список сезонов + создание нового забега
│   │       ├── seasons/[id]/board   # редактор поля
│   │       ├── seasons/[id]/players
│   │       ├── games-catalog/
│   │       ├── audit-log/
│   │       └── settings/
│   ├── api/
│   │   └── webhooks/                # входящие вебхуки (Steam, Discord — Backlog)
│   └── layout.tsx
├── components/
│   ├── ui/                          # shadcn примитивы + HUD-тема
│   ├── board/                       # BoardCanvas, PlayerToken, CellTooltip
│   ├── dice/                        # DiceRoller (анимация)
│   └── admin/
├── lib/
│   ├── use-cases/
│   │   ├── resolve-game-roll.ts     # passed/dropped → движок → запись хода
│   │   ├── start-new-season.ts
│   │   └── ...
│   ├── repositories/
│   │   ├── seasons.repo.ts
│   │   ├── players.repo.ts
│   │   ├── games.repo.ts
│   │   └── ledger.repo.ts
│   ├── supabase/
│   │   ├── server.ts                # server client (service role, только в Server Actions)
│   │   ├── client.ts                # browser client (anon key, под RLS)
│   │   └── middleware.ts            # refresh сессии
│   └── validation/                  # общие Zod-схемы
├── game-engine/                     # чистый домен (см. 4.1)
│   ├── dice.ts
│   ├── movement.ts
│   ├── ledger.ts
│   ├── roll-state-machine.ts
│   └── types.ts
├── drizzle/
│   ├── schema.ts
│   └── migrations/
├── supabase/
│   ├── config.toml
│   ├── migrations/                  # .sql, синхронизированы с drizzle-миграциями
│   └── seed.sql
├── tests/
├── .github/workflows/ci.yml
├── next.config.ts
├── vercel.json                      # опционально: заголовки, редиректы, cron
└── package.json

```

---

## 5. Модель данных

### 5.1 Обзор сущностей

```
profiles ──< season_players >── seasons ──< board_cells (via boards)
   │                                │
   │                                ├──< game_rolls >── games_catalog
   │                                ├──< moves
   │                                ├──< ledger_entries
   │                                └──< event_log
   └──< admin_audit_log

```

### 5.2 SQL-схема (стартовая миграция)

```sql
-- 0001_init.sql

create type user_role      as enum ('admin', 'judge', 'player', 'viewer');
create type season_status  as enum ('draft', 'active', 'paused', 'finished', 'archived');
create type cell_type      as enum ('start', 'finish', 'normal', 'penalty', 'event', 'bonus', 'teleport', 'custom');
create type roll_status    as enum ('rolled', 'in_progress', 'passed', 'dropped', 'rerolled');
create type player_status  as enum ('active', 'finished', 'eliminated', 'withdrawn');

-- Профиль поверх auth.users
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  twitch_login  text,
  role          user_role not null default 'viewer',
  created_at    timestamptz not null default now()
);

create table seasons (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  status      season_status not null default 'draft',
  config      jsonb not null default '{}'::jsonb,   -- правила: кубики, очки, поле (см. 6.2)
  started_at  timestamptz,
  finished_at timestamptz,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table boards (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  name       text not null default 'Основное поле',
  created_at timestamptz not null default now()
);

create table board_cells (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards(id) on delete cascade,
  position   int not null,
  cell_type  cell_type not null default 'normal',
  label      text,
  config     jsonb not null default '{}'::jsonb,     -- специфичные параметры клетки
  unique (board_id, position)
);

create table season_players (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references seasons(id) on delete cascade,
  player_id      uuid not null references profiles(id),
  position       int not null default 0,
  balance_points int not null default 0,
  status         player_status not null default 'active',
  streak_pass    int not null default 0,
  streak_drop    int not null default 0,
  joined_at      timestamptz not null default now(),
  unique (season_id, player_id)
);

create table games_catalog (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  platform      text,                                 -- 'steam', 'nes', 'custom', ...
  external_ids  jsonb not null default '{}'::jsonb,    -- { steam_appid, igdb_id, rawg_id }
  cover_url     text,
  genres        text[] not null default '{}',
  is_blacklisted boolean not null default false,
  created_at    timestamptz not null default now()
);

create table game_rolls (
  id                uuid primary key default gen_random_uuid(),
  season_player_id  uuid not null references season_players(id) on delete cascade,
  game_id           uuid references games_catalog(id),
  status            roll_status not null default 'rolled',
  hours_spent       numeric,
  difficulty_level  int,
  notes             text,
  rolled_at         timestamptz not null default now(),
  resolved_at       timestamptz
);

create table moves (
  id                uuid primary key default gen_random_uuid(),
  season_player_id  uuid not null references season_players(id) on delete cascade,
  game_roll_id      uuid references game_rolls(id),
  from_position     int not null,
  to_position       int not null,
  dice_results      int[] not null,
  cell_landed_type  cell_type,
  created_at        timestamptz not null default now()
);

create table ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  season_player_id  uuid not null references season_players(id) on delete cascade,
  delta             int not null,
  reason            text not null,                     -- 'game_pass_bonus', 'penalty_cell', 'admin_adjustment', ...
  related_move_id   uuid references moves(id),
  created_by        uuid references profiles(id),       -- заполняется только для ручных корректировок
  created_at        timestamptz not null default now()
);

create table event_log (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references seasons(id) on delete cascade,
  season_player_id  uuid references season_players(id),
  event_type        text not null,                      -- 'game_rolled', 'game_passed', 'game_dropped', 'moved', 'season_started', ...
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create table admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references profiles(id),
  action_type text not null,
  target_type text not null,
  target_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index on game_rolls (season_player_id, status);
create index on event_log (season_id, created_at desc);
create index on season_players (season_id, position);

```

### 5.3 RLS (Row Level Security) — базовый паттерн

Публичные данные сезона (доска, лидерборд, лента) читаются анонимно; все мутации идут только через Server Actions с сервисным ключом (либо через RLS-политики, проверяющие роль в `profiles`).

```sql
alter table seasons enable row level security;
alter table season_players enable row level security;
alter table event_log enable row level security;
alter table admin_audit_log enable row level security;

create policy "public read seasons" on seasons for select using (true);
create policy "public read season_players" on season_players for select using (true);
create policy "public read event_log" on event_log for select using (true);

-- helper: текущий пользователь — admin/judge
create function is_staff() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'judge')
  );
$$ language sql stable;

create policy "staff write seasons" on seasons for all
  using (is_staff()) with check (is_staff());

create policy "staff write season_players" on season_players for all
  using (is_staff()) with check (is_staff());

create policy "no public access to audit log" on admin_audit_log for select
  using (is_staff());

```

Игровые действия самого игрока (отметить passed/dropped, крутить кубик) **не** должны идти напрямую из браузера в таблицы через RLS — это провоцирует читерство (клиент может подделать результат кубика). Все такие мутации обязаны проходить через Server Action/route handler, который:

1. проверяет, что `auth.uid()` = владелец соответствующего `season_players.player_id`;
2. сам генерирует случайные числа на сервере (не доверяет клиенту);
3. вызывает domain-функции из `game-engine/`;
4. пишет результат сервисным ключом.

---

## 6. Функциональная спецификация

### 6.1 Публичная часть

- **Главная / текущий сезон** — статус активного забега, краткий лидерборд (топ-5), последние 5 событий ленты, CTA на полные разделы.
- **Игровое поле** — визуализация клеток (SVG/Canvas), фишки игроков на позициях, hover/click по клетке показывает её тип и описание. Обязательно работает на мобильных (зрители часто заходят со смартфона во время стрима).
- **Лидерборд** — сортировка по позиции на поле (и/или по балансу очков — сделать конфигурируемым), статус игрока (в игре/финишировал/выбыл).
- **Профиль игрока** — аватар, история пройденных/дропнутых игр, статистика (сколько пройдено, сколько дропнуто, текущий стрик).
- **Лента событий** — хронологический фид всех событий сезона (ролл, прохождение, дроп, ход, вступление в сезон, ручные корректировки от судьи) — realtime-обновляемый.
- **Правила** — статическая/CMS-редактируемая страница с текстом правил текущего сезона (админ должен уметь её редактировать без деплоя — простое markdown-поле в БД).

### 6.2 Игровой движок (домен)

Дефолтная конфигурация для MVP (пример `season.config`):

```json
{
  "dice": {
    "sides": 6,
    "passDiceCount": 1,
    "dropDiceCount": 2,
    "dropStreakMultiplier": true
  },
  "points": {
    "startingBalance": 0,
    "bonusAddsToRollOnPass": true,
    "resetBalanceAfterUse": true
  },
  "board": {
    "size": 40,
    "loop": false
  },
  "rerolls": {
    "allowed": true,
    "limitPerGame": 1
  }
}

```

Базовая логика хода (reference-реализация, агент волен уточнять по мере тестирования):

1. Игроку роллится игра из `games_catalog` с учётом фильтров сезона (платформа, исключить уже сыгранные в этом сезоне, исключить блэклист).
2. Игрок помечает исход: `passed`, `dropped` или `rerolled`.
3. При `rerolled` — новый ролл, позиция не меняется, счётчик рероллов по этой игре растёт (лимит из конфига).
4. При `passed` — бросок `passDiceCount` кубиков `d{sides}`, движение вперёд на сумму; если `balance_points > 0`, прибавить к результату и обнулить баланс; сбросить `streak_drop`, увеличить `streak_pass`.
5. При `dropped` — бросок `dropDiceCount` кубиков (умножается, если `dropStreakMultiplier` и есть `streak_drop`), движение назад на сумму; аналогично обработать баланс; сбросить `streak_pass`, увеличить `streak_drop`.
6. Применить эффект клетки, на которую игрок приземлился (см. типы клеток ниже).
7. Записать `moves`, `ledger_entries` (если были), `event_log`.

Типы клеток для MVP (`cell_type`), с местом для расширения через `config` jsonb:

- `start` / `finish` — особая логика входа/выхода (не даёт дропать/рероллить, доступна только через штатное движение — по аналогии с общепринятым в жанре подходом).
- `normal` — без эффекта.
- `penalty` — модификатор очков/позиции (величина в `config`).
- `bonus` — положительный модификатор.
- `event` — триггерит случайное событие из настраиваемого списка (задел под будущее «колесо событий», Фаза 8).
- `teleport` — телепорт на клетку/группу клеток по правилу в `config`.
- `custom` — «люк» для будущих механик без миграции схемы: логика читается из `config` и обрабатывается через plugin-реестр в движке (см. 6.4).

Все эти конкретные числа и включение/выключение типов клеток должны настраиваться из админки — это то, что делает архитектуру «гибкой».

### 6.3 Личный кабинет игрока

- Текущая наролленная игра (обложка, платформа, ссылка на Steam/IGDB-страницу).
- Кнопки «Пройдено» / «Дроп» / «Реролл» (с подтверждением — необратимое действие).
- Индикатор фазы хода (ролл → в процессе → нужно отметить исход → анимация броска кубика → новая позиция).
- Личная статистика и история.
- (Backlog) инвентарь предметов/эффектов, если включены модули Фазы 8.

### 6.4 Расширяемость («и многое другое» без слома ядра)

Заложить в архитектуру, но не обязательно реализовывать в MVP:

- **Plugin-реестр эффектов клеток**: `Record<string, (ctx) => EffectResult>`, ключ — `cell.config.effectKey`, чтобы добавлять новые эффекты, не трогая ядро state machine.
- **Инвентарь предметов** — отдельная таблица `inventory_items` + `player_inventory` (many-to-many с состоянием), не проектируется в MVP, но название зарезервировать.
- **Дейлики / квесты** — отдельный модуль, независимый от основного движка перемещения.
- **Внутренняя валюта / магазин** — отдельная таблица транзакций по аналогии с `ledger_entries`, но с своим `currency_type`.
- **Глобальные события-модификаторы** — временные (`starts_at`/`ends_at`) записи, влияющие на конфиг сезона поверх базового — читать как оверлей поверх `season.config` в момент резолва хода.

### 6.5 Админка

Ключевой раздел, явно приоритетный для пользователя.

- **Управление сезонами («забегами»)**:
  - создать новый сезон (черновик) с возможностью клонировать поле/конфиг из предыдущего;
  - редактировать `config` через удобную форму (не сырой JSON — Zod-схема → авто-сгенерированная форма или ручная форма с валидацией);
  - перевести статус `draft → active → paused → finished → archived`;
  - при старте — снапшот списка игроков и обнуление позиций/баланса.
- **Редактор поля**: список клеток с drag-n-drop переупорядочиванием, добавление/удаление клеток, назначение типа и параметров.
- **Управление игроками сезона**: добавить/убрать участника, вручную скорректировать позицию/баланс (с обязательной записью в `admin_audit_log` и `event_log` — прозрачность для зрителей и участников), сменить статус.
- **Каталог игр**: импорт из Steam (по apphash/списку appid или по Steam-профилю), обогащение через IGDB/RAWG, ручное добавление, блэклист/анблэклист, массовое исключение по жанру/тегу.
- **Судейские действия**: принудительный реролл конкретному игроку, ручной бросок кубика с указанием причины, разрешение спорных ситуаций (лог таймстампов — по аналогии с тем, как это принято решать в жанре: кто сделал действие раньше, у того приоритет).
- **Аудит-лог**: полный список административных действий, кто/когда/что изменил.
- **Настройки правил (тексты)**: markdown-редактор страницы «Правила».

### 6.6 Роли и доступ


| Роль     | Права                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin`  | Полный доступ: сезоны, поле, каталог игр, игроки, аудит, настройки, назначение ролей                                                                               |
| `judge`  | Судейские действия внутри активного сезона (оверрайды, ручные броски), без доступа к назначению ролей и созданию новых сезонов (настраивается — можно и разрешить) |
| `player` | Личный кабинет, действия только над своей записью `season_players`                                                                                                 |
| `viewer` | Публичные страницы, без действий                                                                                                                                   |


### 6.7 Аутентификация

- Основной способ входа для игроков — **Twitch OAuth** (естественно для стримерского формата), плюс email magic link как запасной вариант.
- После первого входа — триггер на создание записи `profiles` (Postgres trigger `on auth.users insert`).
- Назначение роли `admin`/`judge` — вручную через Supabase Studio или отдельный защищённый эндпоинт для владельца проекта на этапе бутстрапа (нельзя давать себе права через публичный UI).

---

## 7. Инфраструктура: Vercel + Supabase

### 7.1 Окружения

Рекомендуется два Supabase-проекта — `staging` и `production` — и соответствующие Vercel environments (`preview`/`production`) с разными `.env`.

### 7.2 Переменные окружения (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # только на сервере, никогда не светить на клиенте
STEAM_WEB_API_KEY=
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
NEXT_PUBLIC_SITE_URL=

```

### 7.3 `supabase/config.toml` (референс)

```toml
project_id = "hpg-platform"

[api]
enabled = true
port = 54321

[db]
port = 54322

[auth]
enabled = true
site_url = "https://your-domain.example"

[auth.external.twitch]
enabled = true
client_id = "env(TWITCH_CLIENT_ID)"
secret = "env(TWITCH_CLIENT_SECRET)"

```

### 7.4 Миграции

- Держать `drizzle/schema.ts` как источник правды типов, генерировать `.sql` через `drizzle-kit generate`, применять через `supabase db push` (или `supabase migration up` в CI).
- В CI: шаг `supabase db push --dry-run` на PR (проверка, что миграция валидна) и реальный push при мердже в `main` на staging/production по ветке.

### 7.5 `next.config.ts` — заметки

- `images.remotePatterns` — разрешить домены обложек (Steam CDN [`cdn.akamai.steamstatic.com`](http://cdn.akamai.steamstatic.com), [`images.igdb.com`](http://images.igdb.com), Supabase Storage).
- Включить `typedRoutes` для типобезопасной навигации.

### 7.6 Vercel

- Проект подключается напрямую к GitHub-репозиторию, zero-config для Next.js.
- `vercel.json` нужен только если требуются кастомные заголовки/редиректы/крон (например, Vercel Cron для будущих дейликов на Фазе 8):

```json
{
  "crons": [
    { "path": "/api/cron/daily-reset", "schedule": "0 5 * * *" }
  ]
}

```

---

## 8. Дизайн-система: вайб Half-Life 1 / CS 1.6

Цель — вызвать узнаваемое ощущение эпохи (2000-е, HUD шутеров на GoldSrc), не копируя чужие защищённые товарные знаки и ассеты. Строим **оригинальный** визуальный язык, вдохновлённый этой эстетикой:

### 8.1 Что делать

- **Палитра**: тёмный фон (угольно-серый `#1b1b1a`, тёмная олива `#2a2a22`), акцент — тёплый янтарно-оранжевый (`#f2a900`) и тускло-military-зелёный (`#7c8f4a`), критичные состояния — ржаво-красный (`#b0341f`). Текст — тёплый оффвайт (`#e6e1d3`), не чистый белый — так HUD-элементы старых игр не выглядят «вебовыми».
- **Типографика**: крупные заголовки — плотный «стенсильный»/военный шрифт (свободные варианты: *Big Shoulders Stencil*, *Black Ops One*, *Rajdhani* с большим tracking); для чисел (счётчики очков, позиция на поле) — моноширинный технический шрифт с табличными цифрами (*Share Tech Mono*, *JetBrains Mono*); для основного текста — читаемый гротеск (*Barlow Condensed*, *Inter*), чтобы длинные описания правил не превращались в нечитаемую стилизацию.
- **HUD-мотивы**: угловые скобки-«рамки» у карточек, полосы «hazard tape» (чёрно-жёлтая диагональная штриховка) для предупреждений/опасных админ-действий, счётчики очков в стиле ammo-counter, толстые скошенные кнопки с лёгким bevel/inset, тонкий CRT-scanline оверлей (обязательно с `prefers-reduced-motion` фолбэком и без потери контраста), псевдо-консоль (чёрный фон, моноширинный зелёный/янтарный текст) для админ-панели как отсылка к консоли разработчика в HL1.
- **Звук (опционально)**: короткие технологичные UI-блипы на клик/успех/ошибку — **собственного сочинения или из royalty-free библиотек**, не вырезки из игр Valve.
- **Иконки**: геометричный, «военно-технический» набор (подойдут Lucide/Phosphor с толстым stroke-width), не пиксель-арт спрайты из самих игр.

### 8.2 Чего не делать (юридически и по вкусу)

- Не использовать логотипы Valve/Half-Life/Counter-Strike, оригинальные шрифты игр (они не редистрибутируемы свободно) и вырезанные текстуры/спрайты из файлов игр — это чужая интеллектуальная собственность.
- Не копировать один в один HUD конкретной игры пиксель-в-пиксель — цель referencing «вайба», а не форк ассетов.
- Обложки самих роллящихся игр (Steam capsule images и т.п.) — использовать официальные CDN-ссылки через API, это стандартная практика для игровых каталогов/трекеров.

---

## 9. План реализации по фазам

Каждая фаза должна заканчиваться рабочим деплоем на Vercel (пусть даже с заглушками там, где функциональность ещё не готова).

**Фаза 0 — Инициализация**

- [ ] `pnpm create next-app` (TS, App Router, Tailwind), базовый ESLint/Prettier/Husky.
- [ ] Создать проект Supabase (staging), подключить CLI, `supabase init`.
- [ ] Подключить репозиторий к Vercel, настроить env vars для preview/production.
- [ ] Настроить GitHub Actions: lint + typecheck + unit-тесты на каждый PR.

**Фаза 1 — Данные и Auth**

- [ ] Написать `drizzle/schema.ts`, сгенерировать и применить первую миграцию (раздел 5.2).
- [ ] RLS-политики (5.3).
- [ ] Supabase Auth: email + Twitch OAuth, триггер создания `profiles`.
- [ ] Механизм назначения первой `admin`-роли (бутстрап-скрипт/ручная операция).

**Фаза 2 — Игровой движок (домен)**

- [ ] `game-engine/dice.ts` — генерация бросков с учётом конфига.
- [ ] `game-engine/movement.ts` — расчёт новой позиции с учётом баланса очков и типа исхода.
- [ ] `game-engine/roll-state-machine.ts` — переходы `rolled → in_progress → passed/dropped/rerolled`.
- [ ] Юнит-тесты на все ветки (включая edge-cases: отрицательный баланс, финишная клетка, лимит рероллов).

**Фаза 3 — Публичный MVP**

- [ ] Страницы: лендинг текущего сезона, доска (статичный рендер без анимаций), лидерборд, профиль игрока, лента событий, правила.
- [ ] Базовая realtime-подписка на `event_log`/`season_players` для лидерборда и ленты.

**Фаза 4 — Игровой цикл игрока**

- [ ] Личный кабинет: текущий ролл, кнопки исхода.
- [ ] Server Action `resolveGameRoll`, вызывающий use-case → domain → repositories, с серверной генерацией случайных чисел.
- [ ] Анимация броска кубика на клиенте (визуал, финальное значение — от сервера).

**Фаза 5 — Админка**

- [ ] CRUD сезонов + смена статусов + клонирование конфига/поля из прошлого сезона.
- [ ] Редактор поля (список клеток, типы, drag-n-drop порядок).
- [ ] Управление игроками сезона + ручные корректировки с обязательным логированием.
- [ ] Каталог игр: ручное добавление + импорт через Steam/IGDB API.
- [ ] Аудит-лог (read-only вьюха над `admin_audit_log`).

**Фаза 6 — Полировка и дизайн**

- [ ] HUD-тема (раздел 8) поверх shadcn-компонентов, тёмная тема как единственная/дефолтная.
- [ ] Адаптивность под мобильные (зрительский трафик).
- [ ] Доступность: контраст, `prefers-reduced-motion`, фокус-стейты.

**Фаза 7 — Деплой, мониторинг, документация**

- [ ] Production Supabase-проект, миграции применены, RLS проверена.
- [ ] Vercel Analytics/Sentry (по желанию).
- [ ] [`README.md`](http://README.md) с инструкцией по запуску, [`RUNBOOK.md`](http://RUNBOOK.md) — как стартовать новый сезон в день ивента.

**Фаза 8 — Бэклог/расширения (после MVP)**

- [ ] Инвентарь предметов и эффектов (plugin-реестр, раздел 6.4).
- [ ] Дейлики/квесты.
- [ ] Внутренняя валюта и магазин.
- [ ] Глобальные события-модификаторы.
- [ ] Discord/Telegram-трансляция ленты событий.
- [ ] Мультисезонная статистика и «зал славы».
- [ ] Вынос `game-engine` в отдельный pnpm-пакет, если появится второй потребитель (бот и т.п.).

---

## 10. Иллюстративные TypeScript-контракты домена

```ts
// game-engine/types.ts
export interface SeasonConfig {
  dice: {
    sides: number;
    passDiceCount: number;
    dropDiceCount: number;
    dropStreakMultiplier: boolean;
  };
  points: {
    startingBalance: number;
    bonusAddsToRollOnPass: boolean;
    resetBalanceAfterUse: boolean;
  };
  board: { size: number; loop: boolean };
  rerolls: { allowed: boolean; limitPerGame: number };
}

export type RollOutcome = "passed" | "dropped" | "rerolled";

export interface MovementInput {
  currentPosition: number;
  balancePoints: number;
  outcome: Exclude<RollOutcome, "rerolled">;
  streakPass: number;
  streakDrop: number;
  config: SeasonConfig;
  rng: () => number; // внедряется извне для тестируемости и серверной генерации
}

export interface MovementResult {
  diceResults: number[];
  newPosition: number;
  newBalancePoints: number;
  newStreakPass: number;
  newStreakDrop: number;
}

export function resolveMovement(input: MovementInput): MovementResult {
  // референс-реализация: см. правила в разделе 6.2
  throw new Error("not implemented");
}

```

```ts
// lib/use-cases/resolve-game-roll.ts (эскиз)
export async function resolveGameRoll(params: {
  gameRollId: string;
  outcome: RollOutcome;
  actorUserId: string;
}) {
  // 1. загрузить game_roll + season_player + season.config через repositories
  // 2. проверить, что actorUserId владеет этим season_player (или staff)
  // 3. если outcome === 'rerolled' -> просто новый ролл игры, без движка
  // 4. иначе -> game-engine.resolveMovement(...) с server-side rng
  // 5. сохранить moves/ledger_entries/game_rolls.status в одной транзакции
  // 6. записать event_log
  // 7. вернуть результат для realtime-broadcast
}

```

---

## 11. Открытые вопросы (нужно решить до/во время реализации)

Эти пункты не блокируют старт разработки — движок и схема проектируются так, чтобы ответ на них можно было дать позже через конфиг, — но их стоит прояснить до Фазы 5:

1. Точные стартовые правила: сколько граней у кубика, сколько клеток на поле, штрафы/бонусы конкретных клеток — предлагается взять дефолты из раздела 6.2 и подправить по факту первого тестового прогона.
2. Нужен ли явный «судья» как отдельная роль с первого дня, или на старте достаточно одной роли `admin`.
3. Источник каталога игр: только Steam-библиотека конкретных участников, или произвольный список платформ (ретро-консоли и т.п., как в жанре RGG).
4. Нужна ли интеграция с Twitch (OAuth для входа, оверлей для OBS) уже в MVP, или добавить позже.
5. Монетизация/донаты — не проектировать в MVP, но если понадобится (донат-триггеры модификаторов и т.п.), закладывается как отдельная таблица транзакций по аналогии с `ledger_entries`.

