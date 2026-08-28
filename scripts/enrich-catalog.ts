/**
 * Backfills metadata (description, cover, stores, playtime, website, meta)
 * for catalog rows that still lack enriched data. Uses the configured game
 * providers (FreeToGame first — no key, then RAWG when a key is present).
 *
 * Usage: pnpm exec tsx scripts/enrich-catalog.ts [--limit 200] [--force]
 *   --force  overwrite existing description/cover fields (default: fill empty only)
 */
import { Pool } from "pg";

import "./lib/load-env";

const limit = Number(process.argv.find((a) => a.startsWith("--limit"))?.split("=")[1] ?? 200);
const force = process.argv.includes("--force");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { freetogameProvider } = await import("../lib/game-providers/freetogame");
  const { rawgProvider } = await import("../lib/game-providers/rawg");
  const providers = [freetogameProvider, rawgProvider];

  const rows = await pool.query(
    `select id, title from games_catalog
     where $1 or description is null or cover_url is null or playtime_hours is null
     order by title limit $2`,
    [force, limit],
  );
  console.log(`Enriching ${rows.rows.length} games (force=${force})…`);

  let updated = 0;
  for (const row of rows.rows) {
    let game = null;
    for (const provider of providers) {
      try {
        const hits = await provider.search({
          filters: {
            genres: [],
            platforms: [],
            tags: [],
            metacriticMin: null,
            metacriticMax: null,
            ratingMin: null,
            ratingMax: null,
            yearMin: null,
            yearMax: null,
            esrb: [],
            players: "any",
            onlyWithCover: false,
            ordering: "-metacritic",
            searchQuery: row.title,
          },
          pageSize: 3,
        });
        const exact = hits.find((h) => h.title.toLowerCase() === row.title.toLowerCase()) ?? hits[0];
        if (exact) game = exact;
        if (game) break;
      } catch {
        // provider unavailable — try the next one
      }
    }
    if (!game) continue;

    const existing = await pool.query(
      `select id, description, cover_url, playtime_hours, stores, website, metacritic, rating, released_at from games_catalog where id = $1`,
      [row.id],
    );
    const cur = existing.rows[0];
    if (!cur) continue;

    const patch: Record<string, unknown> = {};
    if (force || !cur.description) patch.description = game.description ?? cur.description;
    if (force || !cur.cover_url) patch.cover_url = game.coverUrl ?? cur.cover_url;
    if (force || !cur.playtime_hours) patch.playtime_hours = game.playtimeHours ?? cur.playtime_hours;
    if (force || !cur.stores) patch.stores = game.stores ?? cur.stores;
    if (force || !cur.website) patch.website = game.website ?? cur.website;
    if (force || !cur.metacritic) patch.metacritic = game.metacritic ?? cur.metacritic;
    if (force || !cur.rating) patch.rating = game.rating != null ? String(game.rating) : cur.rating;
    if (force || !cur.released_at) patch.released_at = game.releasedAt ? new Date(game.releasedAt) : cur.released_at;

    if (Object.keys(patch).length > 0) {
      const sets = Object.keys(patch)
        .map((k, i) => `${k} = $${i + 1}`)
        .join(", ");
      await pool.query(`update games_catalog set ${sets} where id = $${Object.keys(patch).length + 1}`, [
        ...Object.values(patch),
        row.id,
      ]);
      updated++;
    }
  }
  console.log(`Done — updated ${updated}/${rows.rows.length} rows.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});