/**
 * Pure helpers for the season settings wizard.
 *
 * Kept free of React and of the `@/` alias so the logic can be unit-tested
 * directly (vitest runs without the Next path alias).
 *
 * Two responsibilities:
 *  - applying / reverting a game-pool template without leaving orphan filters
 *    behind (a template writes more than `templateId`, so clearing only the id
 *    used to strand its genres, tags and board hints in the config);
 *  - resetting one wizard stage back to `DEFAULT_SEASON_CONFIG` without
 *    touching the other stages.
 */
import { DEFAULT_SEASON_CONFIG } from "../../../engine/config/defaults";
import type { SeasonConfig } from "../../../engine/types/season";
import type { GamePoolTemplate } from "./templates";

/** Filter keys a template is allowed to overwrite. */
export const TEMPLATE_FILTER_KEYS = [
  "genres",
  "tags",
  "platforms",
  "esrb",
  "yearMin",
  "yearMax",
  "ordering",
] as const;

/** Board keys a template's `boardHint` is allowed to overwrite. */
export const TEMPLATE_BOARD_KEYS = ["bonusCount", "penaltyCount", "eventCount"] as const;

type TemplateFilterKey = (typeof TEMPLATE_FILTER_KEYS)[number];
type TemplateBoardKey = (typeof TEMPLATE_BOARD_KEYS)[number];

/**
 * The slice of a config a template can overwrite. Captured before applying a
 * template so deselecting it restores exactly what the admin had before.
 */
export interface TemplateSnapshot {
  filters: Pick<SeasonConfig["gamePool"]["filters"], TemplateFilterKey>;
  board: Pick<SeasonConfig["board"], TemplateBoardKey>;
}

/** Snapshot of the template-owned fields of `cfg`. */
export function captureTemplateSnapshot(cfg: SeasonConfig): TemplateSnapshot {
  const f = cfg.gamePool.filters;
  const b = cfg.board;
  return {
    filters: {
      genres: [...f.genres],
      tags: [...f.tags],
      platforms: [...f.platforms],
      esrb: [...f.esrb],
      yearMin: f.yearMin,
      yearMax: f.yearMax,
      ordering: f.ordering,
    },
    board: {
      bonusCount: b.bonusCount,
      penaltyCount: b.penaltyCount,
      eventCount: b.eventCount,
    },
  };
}

/** Template-owned fields as they look in a pristine config. */
export function defaultTemplateSnapshot(): TemplateSnapshot {
  return captureTemplateSnapshot(DEFAULT_SEASON_CONFIG);
}

/** Applies a template's filters and board hint on top of `cfg`. */
export function applyTemplate(cfg: SeasonConfig, tpl: GamePoolTemplate): SeasonConfig {
  return {
    ...cfg,
    gamePool: {
      ...cfg.gamePool,
      templateId: tpl.id,
      filters: {
        ...cfg.gamePool.filters,
        genres: tpl.filters.genres ?? cfg.gamePool.filters.genres,
        tags: tpl.filters.tags ?? cfg.gamePool.filters.tags,
        platforms: tpl.filters.platforms ?? cfg.gamePool.filters.platforms,
        esrb: tpl.filters.esrb ?? cfg.gamePool.filters.esrb,
        yearMin: tpl.filters.yearMin ?? cfg.gamePool.filters.yearMin,
        yearMax: tpl.filters.yearMax ?? cfg.gamePool.filters.yearMax,
        ordering: tpl.filters.ordering ?? cfg.gamePool.filters.ordering,
      },
    },
    board: tpl.boardHint
      ? {
          ...cfg.board,
          bonusCount: tpl.boardHint.bonusCount,
          penaltyCount: tpl.boardHint.penaltyCount,
          eventCount: tpl.boardHint.eventCount,
        }
      : cfg.board,
  };
}

/**
 * Deselects the current template and restores the template-owned fields.
 *
 * `snapshot` is what the config looked like before the first template was
 * applied. Without one (a season loaded from the database, where the snapshot
 * was never in memory) the fields fall back to `DEFAULT_SEASON_CONFIG`.
 * Fields a template never touches — metacritic, rating, players, searchQuery,
 * source, provider, board size — are left exactly as they are.
 */
export function revertTemplate(cfg: SeasonConfig, snapshot?: TemplateSnapshot | null): SeasonConfig {
  const base = snapshot ?? defaultTemplateSnapshot();
  return {
    ...cfg,
    gamePool: {
      ...cfg.gamePool,
      templateId: null,
      filters: {
        ...cfg.gamePool.filters,
        genres: [...base.filters.genres],
        tags: [...base.filters.tags],
        platforms: [...base.filters.platforms],
        esrb: [...base.filters.esrb],
        yearMin: base.filters.yearMin,
        yearMax: base.filters.yearMax,
        ordering: base.filters.ordering,
      },
    },
    board: {
      ...cfg.board,
      bonusCount: base.board.bonusCount,
      penaltyCount: base.board.penaltyCount,
      eventCount: base.board.eventCount,
    },
  };
}

/**
 * Toggles a template card: selecting a new one applies it, clicking the active
 * one deselects it and restores `snapshot`.
 */
export function toggleTemplate(
  cfg: SeasonConfig,
  tpl: GamePoolTemplate,
  snapshot?: TemplateSnapshot | null,
): SeasonConfig {
  return cfg.gamePool.templateId === tpl.id ? revertTemplate(cfg, snapshot) : applyTemplate(cfg, tpl);
}

/** Wizard stages, in the order they are presented. */
export const SEASON_STAGES = ["templates", "dice", "board", "pool", "iee", "rules"] as const;

export type SeasonStage = (typeof SEASON_STAGES)[number];

/**
 * Resets a single stage to its defaults, leaving every other stage untouched.
 * The `templates` stage is the template revert: it owns only the fields a
 * template writes, not the whole pool.
 */
export function resetStage(cfg: SeasonConfig, stage: SeasonStage): SeasonConfig {
  const d = DEFAULT_SEASON_CONFIG;
  switch (stage) {
    case "templates":
      return revertTemplate(cfg, null);
    case "dice":
      return {
        ...cfg,
        dice: { ...d.dice },
        points: { ...d.points },
        rerolls: { ...d.rerolls },
        moderation: { ...d.moderation },
      };
    case "board":
      return { ...cfg, board: { ...d.board } };
    case "pool":
      return {
        ...cfg,
        gamePool: {
          ...d.gamePool,
          filters: { ...d.gamePool.filters },
          catalog: { ...d.gamePool.catalog },
        },
      };
    case "iee":
      // Clears the season's pool and its event list; the catalog itself is
      // code and cannot be reset from here.
      return {
        ...cfg,
        iee: {
          ...d.iee,
          catchUp: { ...d.iee.catchUp },
          entries: {},
          events: [],
        },
      };
    case "rules":
      return { ...cfg, rules: { ...d.rules } };
    default: {
      const never: never = stage;
      return never;
    }
  }
}

/** Fraction of stages confirmed, 0..1 — drives the progress bar. */
export function stageProgress(confirmed: readonly SeasonStage[]): number {
  const uniq = new Set(confirmed.filter((s) => SEASON_STAGES.includes(s)));
  return uniq.size / SEASON_STAGES.length;
}

/** Next stage after `stage` that is not yet confirmed, or null when all are. */
export function nextPendingStage(
  stage: SeasonStage,
  confirmed: readonly SeasonStage[],
): SeasonStage | null {
  const done = new Set(confirmed);
  done.add(stage);
  const from = SEASON_STAGES.indexOf(stage);
  for (let i = 1; i <= SEASON_STAGES.length; i++) {
    const candidate = SEASON_STAGES[(from + i) % SEASON_STAGES.length]!;
    if (!done.has(candidate)) return candidate;
  }
  return null;
}

/** Stable JSON: key order never affects the comparison. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/**
 * The part of a config a wizard stage owns — the same split `resetStage` uses,
 * so "this stage was edited" and "reset this stage" always agree on scope.
 */
export function stageSlice(config: SeasonConfig, stage: SeasonStage, rulesMd = ""): unknown {
  switch (stage) {
    case "templates":
      return { templateId: config.gamePool.templateId };
    case "dice":
      return {
        dice: config.dice,
        points: config.points,
        rerolls: config.rerolls,
        moderation: config.moderation,
      };
    case "board":
      return { board: config.board };
    case "pool":
      return { gamePool: config.gamePool };
    case "iee":
      return { iee: config.iee };
    case "rules":
      return { mode: config.rules.mode, rulesMd };
    default: {
      const never: never = stage;
      return never;
    }
  }
}

/** True when a stage differs from the baseline it was loaded or last saved with. */
export function stageChanged(
  baseline: { config: SeasonConfig; rulesMd?: string },
  current: { config: SeasonConfig; rulesMd?: string },
  stage: SeasonStage,
): boolean {
  return (
    stableStringify(stageSlice(baseline.config, stage, baseline.rulesMd ?? "")) !==
    stableStringify(stageSlice(current.config, stage, current.rulesMd ?? ""))
  );
}

/** Every stage that differs from the baseline, in wizard order. */
export function changedStages(
  baseline: { config: SeasonConfig; rulesMd?: string },
  current: { config: SeasonConfig; rulesMd?: string },
): SeasonStage[] {
  return SEASON_STAGES.filter((s) => stageChanged(baseline, current, s));
}

/**
 * Stages to show as edited.
 *
 * A stage counts only when the admin actually worked on that tab *and* its
 * slice still differs from the baseline. Slice-difference alone is too broad:
 * picking a template on the templates tab rewrites pool filters and board
 * counts, which would light up two stages the admin never opened. Touch alone
 * is too broad the other way: editing a value back to its saved value should
 * go quiet again.
 */
export function editedStages(
  baseline: { config: SeasonConfig; rulesMd?: string },
  current: { config: SeasonConfig; rulesMd?: string },
  touched: readonly SeasonStage[],
): SeasonStage[] {
  return SEASON_STAGES.filter((s) => touched.includes(s) && stageChanged(baseline, current, s));
}
