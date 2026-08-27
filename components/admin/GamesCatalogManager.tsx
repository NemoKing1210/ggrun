"use client";

import { useActionState, useState } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import {
  addCatalogGameAction,
  deleteGameAction,
  toggleBlacklistAction,
  searchExternalGamesAction,
  importExternalGameDirectAction,
} from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { CatalogGame } from "@/db/schema";

type Props = { games: CatalogGame[] };

export default function GamesCatalogManager({ games }: Props) {
  const { t } = useI18n();
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
      <section className="hud-card p-4">
        <h2 className="font-display text-lg uppercase tracking-wider mb-3">{t.admin.catalog.addHeading}</h2>
        <FormShell action={addCatalogGameAction} submitLabel={t.core.common.add} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t.admin.catalog.titleLabel}>
            <Input name="title" placeholder="Elden Ring" required />
          </Field>
          <Field label={t.admin.catalog.platformLabel}>
            <Input name="platform" placeholder="pc / playstation5…" />
          </Field>
          <Field label={t.admin.catalog.coverLabel}>
            <Input name="coverUrl" placeholder="https://…" />
          </Field>
          <Field label={t.admin.catalog.genresLabel}>
            <Input name="genres" placeholder="rpg, action" />
          </Field>
          <Field label={t.admin.catalog.tagsLabel}>
            <Input name="tags" placeholder="open-world, horror" />
          </Field>
          <Field label={t.admin.catalog.metacriticFormLabel}>
            <Input name="metacritic" type="number" min={0} max={100} placeholder="85" />
          </Field>
          <Field label={t.admin.catalog.ratingFormLabel}>
            <Input name="rating" type="number" step={0.1} min={0} max={5} placeholder="4.5" />
          </Field>
          <Field label={t.admin.catalog.esrbLabel}>
            <Input name="esrb" placeholder="mature" />
          </Field>
        </FormShell>
      </section>

      <section className="hud-card p-4">
        <h2 className="font-display text-lg uppercase tracking-wider mb-3">{t.admin.catalog.searchHeading}</h2>
        <p className="text-xs text-zinc-500 mb-3">
          {t.admin.catalog.searchHint}
        </p>
        <form action={searchAction} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <Field label={t.admin.catalog.providerLabel}>
            <Select name="provider" defaultValue="rawg">
              <option value="rawg">RAWG</option>
              <option value="igdb">IGDB</option>
              <option value="steam">Steam</option>
            </Select>
          </Field>
          <Field label={t.admin.catalog.queryLabel} className="sm:col-span-2">
            <Input name="query" placeholder="horror survival" />
          </Field>
          <Field label={t.admin.catalog.genreLabel}>
            <Input name="genre" placeholder="action" />
          </Field>
          <Field label={t.admin.catalog.orderingLabel}>
            <Select name="ordering" defaultValue="-metacritic">
              <option value="-metacritic">{t.admin.catalog.orderingMetacritic}</option>
              <option value="-rating">{t.admin.catalog.orderingRating}</option>
              <option value="-released">{t.admin.catalog.orderingNewest}</option>
              <option value="name">{t.admin.catalog.orderingName}</option>
            </Select>
          </Field>
          <button type="submit" disabled={searchPending} className="hud-btn hud-btn-primary sm:col-span-5">
            {searchPending ? t.admin.catalog.searchingButton : t.admin.catalog.searchButton}
          </button>
        </form>

        {searchState.error && (
          <div>
            <p className="mt-3 text-sm text-red-300">{searchState.error}</p>
            <DebugError debug={searchState.debug} title="external search" />
          </div>
        )}

        {searchState.results && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchState.results.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {t.admin.catalog.noResults} {t.admin.catalog.noResultsHint}
              </p>
            ) : (
              searchState.results.map((r) => (
                <div key={`${r.provider}:${r.externalId}`} className="hud-card p-3 bg-[#0f0f0f] flex gap-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                  <div className="w-16 h-20 bg-zinc-800 overflow-hidden shrink-0 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    {r.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-xs text-zinc-500">{t.admin.catalog.noCover}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight line-clamp-2 font-display uppercase tracking-wide">{r.title}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.genres.slice(0, 2).map((g) => (
                        <Badge key={g} variant="neutral" size="sm">{g}</Badge>
                      ))}
                      {r.platform && <Badge variant="dim" size="sm">{r.platform}</Badge>}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {r.metacritic ? <Badge variant="amber" size="sm">MC {r.metacritic}</Badge> : null}
                      {r.rating ? <Badge variant="military" size="sm" className="inline-flex items-center gap-1"><StarIcon className="h-3 w-3" aria-hidden /> {r.rating}</Badge> : null}
                    </div>
                    <form action={importExternalGameDirectAction} className="mt-2">
                      <input type="hidden" name="title" value={r.title} />
                      <input type="hidden" name="genres" value={r.genres.join(",")} />
                      <input type="hidden" name="platform" value={r.platform ?? ""} />
                      <input type="hidden" name="coverUrl" value={r.coverUrl ?? ""} />
                      <input type="hidden" name="metacritic" value={r.metacritic?.toString() ?? ""} />
                      <input type="hidden" name="rating" value={r.rating?.toString() ?? ""} />
                      <button type="submit" className="hud-btn inline-flex items-center gap-1 !py-1 !px-3 text-xs">
                        {t.admin.catalog.importButton}
                        <ArrowRightIcon className="h-3 w-3" aria-hidden />
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section className="hud-card p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-display text-lg uppercase tracking-wider">
            {format(t.admin.catalog.poolHeadingFull, { shown: filtered.length, total: games.length })}
          </h2>
          <div className="w-48">
            <Input placeholder={t.admin.catalog.filterPlaceholder} value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-dim text-left border-b border-[#3d3d34]">
            <tr>
              <th className="p-2">{t.admin.catalog.colCover}</th>
              <th className="p-2">{t.admin.catalog.colTitle}</th>
              <th className="p-2">{t.admin.catalog.colPlatform}</th>
              <th className="p-2">{t.admin.catalog.colGenres}</th>
              <th className="p-2">{t.admin.catalog.colMeta}</th>
              <th className="p-2">{t.admin.catalog.colStatus}</th>
              <th className="p-2">{t.admin.catalog.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} className="border-b border-[#2a2a22]">
                <td className="p-2">
                  <div className="w-10 h-10 overflow-hidden bg-zinc-800 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    {g.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="p-2 max-w-[220px]">
                  <span className="font-medium line-clamp-1">{g.title}</span>
                  {g.tags && g.tags.length ? <div className="flex gap-1 mt-1 flex-wrap">{g.tags.slice(0, 3).map((tg) => <Badge key={tg} variant="dim" size="sm">{tg}</Badge>)}</div> : null}
                </td>
                <td className="p-2 font-mono text-xs">{g.platform ? <Badge variant="neutral" size="sm">{g.platform}</Badge> : <span className="text-dim">—</span>}</td>
                <td className="p-2">
                  <div className="flex gap-1 flex-wrap">{g.genres.length ? g.genres.slice(0, 3).map((genre) => <Badge key={genre} variant="sky" size="sm">{genre}</Badge>) : <span className="text-dim text-xs">—</span>}</div>
                </td>
                <td className="p-2">
                  {g.metacritic ? <Badge variant="amber" size="sm">{g.metacritic}</Badge> : <span className="text-dim text-xs">—</span>}
                  {g.rating ? <span className="ml-1 inline-flex items-center gap-1 text-zinc-400 text-xs"><StarIcon className="h-3 w-3 text-amber" aria-hidden />{Number(g.rating).toFixed(1)}</span> : null}
                </td>
                <td className="p-2">
                  {g.isBlacklisted ? <Badge variant="danger" size="sm">{t.admin.catalog.blacklisted}</Badge> : <Badge variant="military" size="sm">{t.admin.catalog.active}</Badge>}
                </td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <form action={toggleBlacklistAction}>
                      <input type="hidden" name="gameId" value={g.id} />
                      <input type="hidden" name="blacklisted" value={String(!g.isBlacklisted)} />
                      <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                        {g.isBlacklisted ? t.admin.catalog.unblockButton : t.admin.catalog.blockButton}
                      </button>
                    </form>
                    <form action={deleteGameAction}>
                      <input type="hidden" name="gameId" value={g.id} />
                      <button type="submit" className="hud-btn hud-btn-danger !py-1 !px-3 text-xs">
                        {t.admin.catalog.deleteButton}
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
