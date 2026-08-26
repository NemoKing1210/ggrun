"use client";

import { useActionState, useState } from "react";
import {
  addCatalogGameAction,
  deleteGameAction,
  toggleBlacklistAction,
  searchExternalGamesAction,
  importExternalGameDirectAction,
} from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import type { CatalogGame } from "@/db/schema";

type Props = { games: CatalogGame[] };

export default function GamesCatalogManager({ games }: Props) {
  const [searchState, searchAction, searchPending] = useActionState(searchExternalGamesAction, {});
  const [filterQ, setFilterQ] = useState("");
  const filtered = games.filter((g) => {
    if (!filterQ.trim()) return true;
    const q = filterQ.toLowerCase();
    return (
      g.title.toLowerCase().includes(q) ||
      g.genres.join(",").toLowerCase().includes(q) ||
      (g.platform ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Manual add */}
      <section className="hud-card p-4">
        <h2 className="font-display text-lg uppercase tracking-wider mb-3">Add a game manually</h2>
        <FormShell action={addCatalogGameAction} submitLabel="Add" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-dim text-sm">
            Title *
            <input name="title" placeholder="Elden Ring" required />
          </label>
          <label className="text-dim text-sm">
            Platform
            <input name="platform" placeholder="pc / playstation5…" />
          </label>
          <label className="text-dim text-sm">
            Cover (URL)
            <input name="coverUrl" placeholder="https://…" />
          </label>
          <label className="text-dim text-sm">
            Genres (comma-separated)
            <input name="genres" placeholder="rpg, action" />
          </label>
          <label className="text-dim text-sm">
            Tags
            <input name="tags" placeholder="open-world, horror" />
          </label>
          <label className="text-dim text-sm">
            Metacritic (0–100)
            <input name="metacritic" type="number" min={0} max={100} placeholder="85" />
          </label>
          <label className="text-dim text-sm">
            Rating (0–5)
            <input name="rating" type="number" step={0.1} min={0} max={5} placeholder="4.5" />
          </label>
          <label className="text-dim text-sm">
            ESRB
            <input name="esrb" placeholder="mature" />
          </label>
        </FormShell>
      </section>

      {/* API Search */}
      <section className="hud-card p-4">
        <h2 className="font-display text-lg uppercase tracking-wider mb-3">Search external API</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Uses the season&apos;s provider config if available, otherwise RAWG. Needs <code>RAWG_API_KEY</code> in .env — without it you&apos;ll get an empty result and the catalog fallback remains.
        </p>
        <form action={searchAction} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <label className="text-dim text-sm">
            Provider
            <select name="provider" defaultValue="rawg" className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-2">
              <option value="rawg">RAWG</option>
              <option value="igdb">IGDB</option>
              <option value="steam">Steam</option>
            </select>
          </label>
          <label className="text-dim text-sm sm:col-span-2">
            Query
            <input name="query" placeholder="horror survival" />
          </label>
          <label className="text-dim text-sm">
            Genre
            <input name="genre" placeholder="action" />
          </label>
          <label className="text-dim text-sm">
            Ordering
            <select name="ordering" defaultValue="-metacritic" className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-2">
              <option value="-metacritic">Metacritic ↓</option>
              <option value="-rating">Rating ↓</option>
              <option value="-released">Newest</option>
              <option value="name">Name A-Z</option>
            </select>
          </label>
          <button type="submit" disabled={searchPending} className="hud-btn hud-btn-primary sm:col-span-5">
            {searchPending ? "Searching…" : "Search API"}
          </button>
        </form>

        {searchState.error && <p className="mt-3 text-sm text-red-300">{searchState.error}</p>}

        {searchState.results && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchState.results.length === 0 ? (
              <p className="text-sm text-zinc-500">No results. Try broader query or add RAWG_API_KEY.</p>
            ) : (
              searchState.results.map((r) => (
                <div key={`${r.provider}:${r.externalId}`} className="hud-card p-3 bg-[#0f0f0f] flex gap-3">
                  <div className="w-16 h-20 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                    {r.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-xs text-zinc-500">no cover</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{r.title}</p>
                    <p className="text-xs text-zinc-500">{r.genres.slice(0, 3).join(", ") || "—"} · {r.platform ?? "—"}</p>
                    <p className="text-xs text-zinc-400">
                      {r.metacritic ? `MC ${r.metacritic}` : ""}
                      {r.rating ? ` · ★ ${r.rating}` : ""}
                    </p>
                    <form action={importExternalGameDirectAction} className="mt-2">
                      <input type="hidden" name="genres" value={r.genres.join(",")} />
                      <input type="hidden" name="platform" value={r.platform ?? ""} />
                      <input type="hidden" name="coverUrl" value={r.coverUrl ?? ""} />
                      <input type="hidden" name="provider" value={r.provider} />
                      <input type="hidden" name="externalId" value={r.externalId} />
                      <input type="hidden" name="metacritic" value={r.metacritic?.toString() ?? ""} />
                      <input type="hidden" name="rating" value={r.rating?.toString() ?? ""} />
                      <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                        Import →
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Catalog pool */}
      <section className="hud-card p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg uppercase tracking-wider">Game pool ({filtered.length}/{games.length})</h2>
          <input
            placeholder="Filter pool…"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-sm w-48"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="text-dim text-left border-b border-[#3d3d34]">
            <tr>
              <th className="p-2">Cover</th>
              <th className="p-2">Title</th>
              <th className="p-2">Platform</th>
              <th className="p-2">Genres</th>
              <th className="p-2">Meta</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} className="border-b border-[#2a2a22]">
                <td className="p-2">
                  <div className="w-10 h-10 rounded overflow-hidden bg-zinc-800">
                    {g.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="p-2 max-w-[220px] truncate">
                  {g.title}
                  {g.tags && g.tags.length ? <div className="text-[10px] text-zinc-500">{g.tags.slice(0, 3).join(", ")}</div> : null}
                </td>
                <td className="p-2 font-mono text-xs">{g.platform ?? "—"}</td>
                <td className="p-2 text-xs text-dim">{g.genres.join(", ") || "—"}</td>
                <td className="p-2 text-xs">
                  {g.metacritic ? <span className="px-1.5 py-0.5 rounded bg-amber/20 text-amber text-[11px]">{g.metacritic}</span> : "—"}
                  {g.rating ? <span className="ml-1 text-zinc-400">★{Number(g.rating).toFixed(1)}</span> : null}
                </td>
                <td className="p-2">
                  {g.isBlacklisted ? (
                    <span className="text-danger text-xs">blacklisted</span>
                  ) : (
                    <span className="text-emerald-400 text-xs">active</span>
                  )}
                </td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <form action={toggleBlacklistAction}>
                      <input type="hidden" name="gameId" value={g.id} />
                      <input type="hidden" name="blacklisted" value={String(!g.isBlacklisted)} />
                      <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                        {g.isBlacklisted ? "Unblock" : "Blacklist"}
                      </button>
                    </form>
                    <form action={deleteGameAction}>
                      <input type="hidden" name="gameId" value={g.id} />
                      <button type="submit" className="hud-btn hud-btn-danger !py-1 !px-3 text-xs">
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
