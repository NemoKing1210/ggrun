/**
 * Demo data for local development / smoke testing.
 * Usage: pnpm exec tsx scripts/seed-demo.ts
 * Creates the run-1 season (active), a 40-cell board and a games catalog,
 * if they don't exist yet. Idempotent.
 */
import { Pool } from "pg";

import "./lib/load-env";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const season = await pool.query(
      `insert into seasons (slug, title, status, config, started_at)
       values ('run-1', 'Run #1', 'active', '{}'::jsonb, now())
       on conflict (slug) do nothing
       returning id`,
    );
    const seasonId =
      season.rows[0]?.id ??
      (await pool.query("select id from seasons where slug = 'run-1'")).rows[0]!.id;

    const board = await pool.query(
      `insert into boards (season_id) values ($1)
       returning id`,
      [seasonId],
    );
    let boardId = board.rows[0]?.id;
    if (!boardId) {
      boardId =
        (
          await pool.query("select id from boards where season_id = $1 limit 1", [
            seasonId,
          ])
        ).rows[0]?.id ?? null;
      if (!boardId) throw new Error("Board not found");
    }

    const cellCount = await pool.query(
      "select count(*)::int as n from board_cells where board_id = $1",
      [boardId],
    );
    if (cellCount.rows[0].n === 0) {
      for (let pos = 0; pos < 40; pos++) {
        let cellType = "normal";
        let config: Record<string, unknown> = {};
        let label: string | null = null;
        if (pos === 0) cellType = "start";
        else if (pos === 39) cellType = "finish";
        else if (pos % 9 === 3) {
          cellType = "penalty";
          config = { amount: -5 };
          label = "Penalty sector";
        } else if (pos % 11 === 7) {
          cellType = "bonus";
          config = { amount: 10 };
          label = "Bonus warehouse";
        } else if (pos % 13 === 5) {
          cellType = "event";
          label = "Unknown event";
        }
        await pool.query(
          `insert into board_cells (board_id, position, cell_type, label, config)
           values ($1, $2, $3, $4, $5::jsonb)`,
          [boardId, pos, cellType, label, JSON.stringify(config)],
        );
      }
      console.log("40-cell board created");
    }

    const gamesCount = await pool.query("select count(*)::int as n from games_catalog");
    if (gamesCount.rows[0].n === 0) {
      const games: Array<[string, string]> = [
        ["Half-Life", "steam"],
        ["Doom (1993)", "custom"],
        ["Portal", "steam"],
        ["Celeste", "steam"],
        ["Super Mario Bros.", "nes"],
        ["Hollow Knight", "steam"],
        ["Stardew Valley", "steam"],
        ["Papers, Please", "steam"],
      ];
      for (const [title, platform] of games) {
        await pool.query(
          "insert into games_catalog (title, platform) values ($1, $2)",
          [title, platform],
        );
      }
      console.log(`Games added: ${games.length}`);
    }

    console.log(`Demo season ready: ${seasonId}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
