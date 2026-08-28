import type { SeasonConfig } from "@/lib/engine/types";
import type { CellType } from "@/lib/engine/types";

/**
 * Generates a distribution of cell types over a board of `size` cells.
 * - start is always at position 0, finish at the last position when loop=false.
 * - bonus/penalty/teleport/event counts come from SeasonConfig.board.
 * - distribution controls spread:
 *   random  — uniform random shuffle of special cells among inner positions
 *   even    — spaced evenly
 *   clustered — one third of board contains most specials
 *   manual  — caller will fill manually, we still ensure start/finish present
 */
export function generateBoardCells(
  config: SeasonConfig,
): Array<{ position: number; cellType: CellType; label: string | null; config: Record<string, unknown> }> {
  const { size, loop, bonusCount, penaltyCount, teleportCount, eventCount, distribution } = config.board;

  const cells: Array<{ position: number; cellType: CellType; label: string | null; config: Record<string, unknown> }> = [];

  // prepare special pool
  const specials: CellType[] = [
    ...Array(bonusCount).fill("bonus" as CellType),
    ...Array(penaltyCount).fill("penalty" as CellType),
    ...Array(teleportCount).fill("teleport" as CellType),
    ...Array(eventCount).fill("event" as CellType),
  ];

  // cap specials to inner positions
  const innerSize = loop ? size : Math.max(1, size - 2); // exclude start/finish when not looping
  const offset = loop ? 0 : 1;
  const pool = specials.slice(0, innerSize);

  // fill with normal for remaining inner positions
  while (pool.length < innerSize) pool.push("normal");

  // shuffle/distribute according to distribution
  let ordered: CellType[] = pool;
  if (distribution === "random") {
    ordered = shuffle(pool);
  } else if (distribution === "even") {
    ordered = evenSpread(pool);
  } else if (distribution === "clustered") {
    ordered = clustered(pool);
  } // manual -> keep creation order (still randomized pool but caller may override)

  // Build board
  for (let pos = 0; pos < size; pos++) {
    let type: CellType;
    if (!loop && pos === 0) type = "start";
    else if (!loop && pos === size - 1) type = "finish";
    else if (loop && pos === 0) type = "start";
    else {
      const idx = pos - offset;
      type = ordered[idx] ?? "normal";
    }

    const cfg: Record<string, unknown> = {};
    if (type === "bonus") cfg.amount = 2 + Math.floor(Math.random() * 3); // 2-4
    if (type === "penalty") cfg.amount = 2 + Math.floor(Math.random() * 3);
    if (type === "teleport" && size > 3) {
      // random target not too close
      let target: number;
      do {
        target = Math.floor(Math.random() * size);
      } while (Math.abs(target - pos) < 3);
      cfg.target = target;
    }

    cells.push({
      position: pos,
      cellType: type,
      label: type === "start" ? "Старт" : type === "finish" ? "Финиш" : null,
      config: cfg,
    });
  }

  return cells;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function evenSpread(pool: CellType[]): CellType[] {
  // group by type and interleave
  const byType = new Map<CellType, number>();
  pool.forEach((t) => byType.set(t, (byType.get(t) ?? 0) + 1));
  const types = [...byType.keys()];
  const counts = new Map(byType);
  const result: CellType[] = [];
  let total = pool.length;
  while (total > 0) {
    for (const t of types) {
      const c = counts.get(t) ?? 0;
      if (c > 0) {
        result.push(t);
        counts.set(t, c - 1);
        total--;
      }
    }
  }
  // shuffle lightly within even pattern — interleave already ensures evenness
  return result;
}

function clustered(pool: CellType[]): CellType[] {
  // Put most specials in middle third
  const specials = pool.filter((t) => t !== "normal");
  const normals = pool.filter((t) => t === "normal");
  const n = pool.length;
  const third = Math.floor(n / 3);
  const result: CellType[] = [];
  for (let i = 0; i < n; i++) {
    if (i >= third && i < 2 * third && specials.length) {
      result.push(specials.shift()!);
    } else if (normals.length) {
      result.push(normals.shift()!);
    } else if (specials.length) {
      result.push(specials.shift()!);
    }
  }
  return result;
}
