# RUNBOOK — event day

A step-by-step guide for the host/admin: how to launch a new season on event
day.
## 0. The day before

1. Make sure migrations are applied: `pnpm drizzle-kit push`.
2. Fill the game catalog: `/admin/games-catalog` → "Add a game manually".
   Blacklisted games never come up in rolls. A game can be deleted only if it
   has never been rolled for anyone (FK protects the history).
3. Check the rules: `/admin/seasons/<id>` → the rules text (Markdown) is saved
   and immediately visible at `/rules`.

## 1. Creating a season

1. `/admin` → "New season": title, slug (`run-2`), optionally clone the board
   from a previous season.
2. The new season is created in the `draft` status. Open "Board" and adjust
   the cells: position, type (normal/start/finish/penalty/bonus/event/
   teleport/custom), name, amount for penalty/bonus.

## 2. Season rules config

`/admin/seasons/<id>` → the `season.config` JSON. Default:

```json
{
  "dice": { "sides": 6, "passDiceCount": 1, "dropDiceCount": 2, "dropStreakMultiplier": true },
  "points": { "startingBalance": 0, "bonusAddsToRollOnPass": true, "resetBalanceAfterUse": true },
  "board": { "size": 40, "loop": false },
  "rerolls": { "allowed": true, "limitPerGame": 1 }
}
```

Saving is validated by the Zod schema — invalid JSON never reaches the DB.

## 3. Participants

1. Every player registers (`/register`) and logs in on their own.
2. The admin adds participants: `/admin/seasons/<id>/players` → pick a user →
   "Add".

## 4. Start

1. `/admin` → the season's `active` status button.
   On start, all participants' positions/balances are reset to zero (the
   start snapshot) and `season_started` is written to the feed.
2. Players open `/dashboard`, hit "Roll a game", play, and mark the outcome.

## 5. During the run

- **Manual adjustment** (position/balance/status):
  `/admin/seasons/<id>/players` → the form under the player. The reason is
  **required** — the adjustment lands in the audit log and the public event
  feed.
- **Audit**: `/admin/audit` — who changed what and when.
- **Leaderboard**: sorted by position; finishers on top. Player statuses are
  changed via the same adjustment form (`finished` — the player reached the
  finish).

## 6. Finish

1. `/admin` → status `finished` (the end time is recorded).
2. After the awards — `archived` (irreversible; the data remains in history).

## Season status transitions

```
draft → active → paused → finished → archived
```

Invalid transitions are blocked with an error.

## User management

`/admin/users` (admin role only): search by email/username/name, create
users, edit profiles/roles/passwords, block and delete accounts. A blocked
user loses access immediately and cannot log in. You cannot block, demote, or
delete yourself.

## Troubleshooting

- **"The season is not active"** on roll — the season is draft/paused;
  switch the status.
- **"Reroll limit reached"** — `rerolls.limitPerGame` for this game is
  exhausted; the referee can grant a new game via a manual adjustment (see
  above).
- **DB unavailable** — check that the OSPanel Postgres module is running
  (listening on `127.127.126.56:5432`), then restart the dev server.
