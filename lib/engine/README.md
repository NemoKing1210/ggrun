# lib/engine — Pure Domain

> **Rule:** No `next/*`, `react`, `drizzle-orm`, `pg` imports. Enforced by `eslint.config.mjs`.
> Randomness is injected via `rng: () => number` — the engine never calls `Math.random` directly.

```
lib/engine/
  config/              Zod schemas + DEFAULT_SEASON_CONFIG (split from 161-line monolith)
    defaults.ts        DEFAULT_SEASON_CONFIG
    dice.ts            DiceConfigSchema
    board.ts           BoardConfigSchema
    points.ts          PointsConfigSchema
    rerolls.ts         RerollsConfigSchema
    moderation.ts      ModerationConfigSchema
    rules.ts           RulesConfigSchema
    game-pool/         Filters, Catalog, Config schemas
    index.ts           SeasonConfigSchema (re-exports all)
  types/               Domain contracts (split from 156-line monolith)
    board.ts           BoardDistribution, CellType, CellLike, CellEffectContext
    game-pool.ts       GamePoolConfig, Filters, CatalogOptions, ProviderId
    season.ts          SeasonConfig, RollOutcome
    player.ts          MovementInput/Result, SeasonPlayerState
    index.ts
  dice/                rollDice (pure)
  board/
    movement/          normalizePosition, resolveMovement
    cell-effects/      registry + applyCellEffect (plugin map by cellType/effectKey)
  roll/                RollStatus, nextRollStatus, canReroll, requestReroll
  index.ts             Public barrel — re-exports types/config/dice/board/roll
  *.test.ts            Co-located Vitest suites (pure, rng injected)
```

**Adding a mechanic:**
1. Add type in `types/` if needed
2. Add Zod schema in `config/` + default in `config/defaults.ts`
3. Add pure function in `board/` or `roll/` (takes `rng` if random)
4. Add test next to module (`*.test.ts`)
5. Register cell effect via `registerCellEffect` in `board/cell-effects/registry.ts` if needed

**Checks:**
```bash
pnpm test        # 50 tests, pure, no DB
pnpm exec tsc --noEmit
pnpm build
```
