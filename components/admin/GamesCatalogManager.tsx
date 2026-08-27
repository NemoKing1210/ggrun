"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  FunnelIcon,
  ShieldCheckIcon,
  NoSymbolIcon,
  PhotoIcon,
  ArrowPathIcon,
  TrashIcon,
  XMarkIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import {
  addCatalogGameAction,
  deleteGameAction,
  toggleBlacklistAction,
  searchExternalGamesAction,
  importExternalGameDirectAction,
} from "@/lib/use-cases/admin-actions";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { DebugError } from "@/components/ui/DebugError";
import { useI18n } from "@/lib/i18n/client";
import type { CatalogGame } from "@/db/schema";

type Props = { games: CatalogGame[]; availableProviders?: Array<{ id: string; label: string }> };
type FilterTab = "all" | "active" | "blacklisted";

function AddGameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(addCatalogGameAction, {} as never);

  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => onClose(), 900);
      return () => clearTimeout(timer);
    }
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="inline-flex size-9 items-center justify-center bg-amber/10 border border-amber/30 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <PlusIcon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg uppercase tracking-wider leading-none">{t.admin.catalog.addHeading}</h2>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.catalog.manualEntryHint}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="hud-btn !p-2 !text-dim hover:!text-amber" aria-label="Close">
          <XMarkIcon className="size-4" />
        </button>
      </div>
      <div className="hazard-tape my-4 opacity-60" aria-hidden />

      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t.admin.catalog.titleLabel} className="sm:col-span-2">
            <Input name="title" placeholder="Elden Ring" required autoFocus />
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
            <Select name="esrb" defaultValue="">
              <option value="">—</option>
              <option value="everyone">{t.admin.catalog.esrbEveryone}</option>
              <option value="everyone-10-plus">{t.admin.catalog.esrbEveryone10Plus}</option>
              <option value="teen">{t.admin.catalog.esrbTeen}</option>
              <option value="mature">{t.admin.catalog.esrbMature}</option>
              <option value="adults-only">{t.admin.catalog.esrbAdultsOnly}</option>
              <option value="rating-pending">{t.admin.catalog.esrbRatingPending}</option>
            </Select>
          </Field>
        </div>

        {state?.error && (
          <div className="border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <p className="text-sm text-red-300" role="alert">
              {state.error}
            </p>
            <DebugError debug={state.debug} title="add game" />
          </div>
        )}
        {state?.ok && (
          <div className="border border-emerald-800 bg-emerald-950/30 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <p className="text-sm text-emerald-300">{state.ok}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="hud-btn">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="hud-btn hud-btn-primary min-w-28">
            {pending ? "…" : t.core.common.add}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SearchImportModal({
  open,
  onClose,
  availableProviders,
}: {
  open: boolean;
  onClose: () => void;
  availableProviders?: Array<{ id: string; label: string }>;
}) {
  const { t } = useI18n();
  const [searchState, searchAction, searchPending] = useActionState(searchExternalGamesAction, {} as never);
  const hasProviders = (availableProviders?.length ?? 0) > 0;

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="inline-flex size-9 items-center justify-center bg-amber/10 border border-amber/30 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <GlobeAltIcon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg uppercase tracking-wider leading-none">{t.admin.catalog.searchHeading}</h2>
            <p className="mt-1 max-w-lg font-mono text-[11px] leading-relaxed text-dim">{t.admin.catalog.searchHint}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="hud-btn !p-2 !text-dim hover:!text-amber" aria-label="Close">
          <XMarkIcon className="size-4" />
        </button>
      </div>
      <div className="hazard-tape my-4 opacity-60" aria-hidden />

      {!hasProviders ? (
        <div className="border border-amber/30 bg-amber/10 p-4 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <p className="text-sm font-medium text-amber">{t.admin.catalog.noProvidersTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t.admin.catalog.noProvidersHint ?? "Add an API key in Settings → Integrations or via env (RAWG_API_KEY / IGDB_CLIENT_ID etc.)."}</p>
          <a href="/admin/settings" className="hud-btn hud-btn-primary mt-3 inline-flex !py-1.5 !px-3 text-xs">
            {t.admin.catalog.goToSettings}
          </a>
        </div>
      ) : (
        <form action={searchAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label={t.admin.catalog.providerLabel}>
            <Select name="provider" defaultValue={availableProviders?.[0]?.id ?? "rawg"}>
              {availableProviders!.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        <Field label={t.admin.catalog.queryLabel} className="sm:col-span-2">
          <Input name="query" placeholder="horror survival" />
        </Field>
        <Field label={t.admin.catalog.genreLabel}>
          <Input name="genre" placeholder="action" />
        </Field>
        <Field label={t.admin.catalog.orderingLabel} className="sm:col-span-2">
          <Select name="ordering" defaultValue="-metacritic">
            <option value="-metacritic">{t.admin.catalog.orderingMetacritic}</option>
            <option value="-rating">{t.admin.catalog.orderingRating}</option>
            <option value="-released">{t.admin.catalog.orderingNewest}</option>
            <option value="name">{t.admin.catalog.orderingName}</option>
          </Select>
        </Field>
        <div className="flex items-end sm:col-span-2">
          <button type="submit" disabled={searchPending} className="hud-btn hud-btn-primary w-full inline-flex items-center justify-center gap-2">
            <MagnifyingGlassIcon className="size-4" aria-hidden />
            {searchPending ? t.admin.catalog.searchingButton : t.admin.catalog.searchButton}
          </button>
        </div>
        </form>
      )}

      {searchState?.error && (
        <div className="mt-4 border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <p className="text-sm text-red-300">{searchState.error}</p>
          <DebugError debug={searchState.debug} title="external search" />
        </div>
      )}

      {searchState?.results && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
              Results · {searchState.results.length}
            </p>
            <span className="font-mono text-[10px] text-dim">{t.admin.catalog.clickImportHint}</span>
          </div>

          {searchState.results.length === 0 ? (
            <div className="hud-card p-6 border-dashed flex flex-col items-center gap-2 text-center">
              <MagnifyingGlassIcon className="size-6 text-dim" aria-hidden />
              <p className="text-sm text-zinc-500">
                {t.admin.catalog.noResults} {t.admin.catalog.noResultsHint}
              </p>
            </div>
          ) : (
            <div className="grid max-h-[52vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {searchState.results.map((r) => (
                <div
                  key={`${r.provider}:${r.externalId}`}
                  className="hud-card flex gap-3 p-3 bg-[#0f0f0f] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
                >
                  <div className="h-20 w-16 shrink-0 overflow-hidden border border-[#2a2a22] bg-zinc-800 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    {r.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-zinc-500">
                        <PhotoIcon className="size-5 text-dim" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-display text-sm uppercase leading-tight tracking-wide">{r.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.genres.slice(0, 2).map((g) => (
                        <Badge key={g} variant="neutral" size="sm">
                          {g}
                        </Badge>
                      ))}
                      {r.platform && (
                        <Badge variant="dim" size="sm">
                          {r.platform}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex gap-1">
                      {r.metacritic ? (
                        <Badge variant="amber" size="sm">
                          MC {r.metacritic}
                        </Badge>
                      ) : null}
                      {r.rating ? (
                        <Badge variant="military" size="sm" className="inline-flex items-center gap-1">
                          <StarIcon className="h-3 w-3" aria-hidden /> {r.rating}
                        </Badge>
                      ) : null}
                    </div>
                    <form action={importExternalGameDirectAction} className="mt-2">
                      <input type="hidden" name="title" value={r.title} />
                      <input type="hidden" name="genres" value={r.genres.join(",")} />
                      <input type="hidden" name="platform" value={r.platform ?? ""} />
                      <input type="hidden" name="coverUrl" value={r.coverUrl ?? ""} />
                      <input type="hidden" name="metacritic" value={r.metacritic?.toString() ?? ""} />
                      <input type="hidden" name="rating" value={r.rating?.toString() ?? ""} />
                      <button type="submit" className="hud-btn hud-btn-primary !py-1 !px-3 text-xs inline-flex items-center gap-1">
                        {t.admin.catalog.importButton}
                        <PlusIcon className="h-3 w-3" aria-hidden />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function GamesCatalogManager({ games, availableProviders }: Props) {
  const { t } = useI18n();
  const [filterQ, setFilterQ] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const filtered = useMemo(() => {
    return games.filter((g) => {
      if (tab === "active" && g.isBlacklisted) return false;
      if (tab === "blacklisted" && !g.isBlacklisted) return false;
      if (!filterQ.trim()) return true;
      const q = filterQ.toLowerCase();
      return (
        g.title.toLowerCase().includes(q) ||
        g.genres.join(",").toLowerCase().includes(q) ||
        g.tags.join(",").toLowerCase().includes(q) ||
        (g.platform ?? "").toLowerCase().includes(q)
      );
    });
  }, [games, filterQ, tab]);

  const counts = useMemo(
    () => ({
      all: games.length,
      active: games.filter((g) => !g.isBlacklisted).length,
      blacklisted: games.filter((g) => g.isBlacklisted).length,
    }),
    [games],
  );

  return (
    <div className="flex flex-col gap-4">
      <AddGameModal open={addOpen} onClose={() => setAddOpen(false)} />
      <SearchImportModal open={searchOpen} onClose={() => setSearchOpen(false)} availableProviders={availableProviders} />

      {/* Toolbar */}
      <section className="hud-card p-3 sm:p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-sm">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
              <Input
                placeholder={t.admin.catalog.filterPlaceholder}
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                className="!pl-9"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden font-mono text-[11px] uppercase tracking-widest text-dim sm:inline">
                <FunnelIcon className="inline size-3.5 align-text-bottom" aria-hidden /> View
              </span>
              <div className="flex gap-1">
                {(["all", "active", "blacklisted"] as const).map((v) => {
                  const isActive = tab === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTab(v)}
                      className={
                        isActive
                          ? "hud-btn hud-btn-primary !py-1.5 !px-3 text-xs"
                          : "hud-btn !py-1.5 !px-3 text-xs !border-dim/20 hover:!border-amber/40"
                      }
                    >
                      {v === "all" ? "All" : v === "active" ? "Active" : "Blocked"}
                      <span className={isActive ? "ml-1.5 opacity-80" : "ml-1.5 text-dim"}>· {counts[v]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setSearchOpen(true)} className="hud-btn inline-flex flex-1 items-center justify-center gap-2 sm:flex-none">
              <GlobeAltIcon className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t.admin.catalog.searchHeading}</span>
              <span className="sm:hidden">{t.admin.catalog.searchMobile}</span>
            </button>
            <button type="button" onClick={() => setAddOpen(true)} className="hud-btn hud-btn-primary inline-flex flex-1 items-center justify-center gap-2 sm:flex-none">
              <PlusIcon className="size-4" aria-hidden />
              Add game
            </button>
          </div>
        </div>

        {(filterQ || tab !== "all") && (
          <div className="mt-3 flex items-center gap-2 border-t border-[#2a2a22] pt-3 font-mono text-xs text-dim">
            <span>
              Showing <span className="text-amber">{filtered.length}</span> / {games.length}
            </span>
            {filterQ && <span>· query “{filterQ}”</span>}
            <button
              type="button"
              onClick={() => {
                setFilterQ("");
                setTab("all");
              }}
              className="ml-auto inline-flex items-center gap-1 text-amber hover:underline"
            >
              <ArrowPathIcon className="size-3.5" aria-hidden /> Reset
            </button>
          </div>
        )}
      </section>

      {/* Pool */}
      <section className="hud-card overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <h2 className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-widest">
            <span className="inline-flex size-7 items-center justify-center bg-raised border border-[#3d3d34] text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <FunnelIcon className="size-4" aria-hidden />
            </span>
            Game pool
            <span className="font-mono text-xs font-normal normal-case tracking-normal text-dim">
              {filtered.length} / {games.length}
            </span>
          </h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">{t.admin.catalog.hudPool}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="m-4 border border-dashed border-dim/20 bg-background/20 p-8 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <PhotoIcon className="mx-auto size-7 text-dim" aria-hidden />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">
              {games.length === 0 ? "Catalog is empty" : "No games match filter"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
              {games.length === 0
                ? "Add your first game manually or import from RAWG / IGDB / Steam via Search."
                : "Try a different search term, clear the filter, or switch the view tab."}
            </p>
            {games.length === 0 && (
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => setAddOpen(true)} className="hud-btn hud-btn-primary !py-1.5">
                  <PlusIcon className="size-4" aria-hidden /> Add game
                </button>
                <button type="button" onClick={() => setSearchOpen(true)} className="hud-btn !py-1.5">
                  <MagnifyingGlassIcon className="size-4" aria-hidden /> Search API
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-raised text-left text-dim">
                  <tr className="border-b border-[#3d3d34] font-mono text-[11px] uppercase tracking-widest">
                    <th className="p-3 font-normal">{t.admin.catalog.colCover}</th>
                    <th className="p-3 font-normal">{t.admin.catalog.colTitle}</th>
                    <th className="p-3 font-normal">{t.admin.catalog.colPlatform}</th>
                    <th className="p-3 font-normal">{t.admin.catalog.colGenres}</th>
                    <th className="p-3 font-normal">{t.admin.catalog.colMeta}</th>
                    <th className="p-3 font-normal">{t.admin.catalog.colStatus}</th>
                    <th className="p-3 font-normal text-right">{t.admin.catalog.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a22]">
                  {filtered.map((g) => (
                    <tr key={g.id} className="group hover:bg-amber/[0.04] transition-colors">
                      <td className="p-2">
                        <div className="h-10 w-10 overflow-hidden border border-[#2a2a22] bg-zinc-800 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                          {g.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={g.coverUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full place-items-center text-[10px] text-dim">
                              <PhotoIcon className="size-4" aria-hidden />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 max-w-[240px]">
                        <span className="font-display text-sm uppercase tracking-wide line-clamp-1 group-hover:text-amber transition-colors" title={g.title}>
                          {g.title}
                        </span>
                        {g.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {g.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="dim" size="sm">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {g.platform ? (
                          <Badge variant="neutral" size="sm">
                            {g.platform}
                          </Badge>
                        ) : (
                          <span className="font-mono text-xs text-dim">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex max-w-[180px] flex-wrap gap-1">
                          {g.genres.length ? (
                            g.genres.slice(0, 3).map((genre) => (
                              <Badge key={genre} variant="sky" size="sm">
                                {genre}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-dim">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {g.metacritic ? <Badge variant="amber" size="sm">{g.metacritic}</Badge> : <span className="font-mono text-xs text-dim">—</span>}
                          {g.rating ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
                              <StarIcon className="h-3 w-3 text-amber" aria-hidden />
                              {Number(g.rating).toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3">
                        {g.isBlacklisted ? (
                          <Badge variant="danger" size="sm" className="inline-flex items-center gap-1">
                            <NoSymbolIcon className="size-3" aria-hidden /> {t.admin.catalog.blacklisted}
                          </Badge>
                        ) : (
                          <Badge variant="military" size="sm" className="inline-flex items-center gap-1">
                            <ShieldCheckIcon className="size-3" aria-hidden /> {t.admin.catalog.active}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          <form action={toggleBlacklistAction}>
                            <input type="hidden" name="gameId" value={g.id} />
                            <input type="hidden" name="blacklisted" value={String(!g.isBlacklisted)} />
                            <button type="submit" className="hud-btn !px-2.5 !py-1 text-[11px] border-dim/30">
                              {g.isBlacklisted ? t.admin.catalog.unblockButton : t.admin.catalog.blockButton}
                            </button>
                          </form>
                          <form action={deleteGameAction}>
                            <input type="hidden" name="gameId" value={g.id} />
                            <button type="submit" className="hud-btn hud-btn-danger !px-2 !py-1" aria-label={t.admin.catalog.deleteButton} title={t.admin.catalog.deleteButton}>
                              <TrashIcon className="size-3.5" aria-hidden />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 p-3 lg:hidden">
              {filtered.map((g) => (
                <div
                  key={g.id}
                  className="hud-card flex gap-3 p-3 bg-[#0f0f0f] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
                >
                  <div className="h-14 w-12 shrink-0 overflow-hidden border border-[#2a2a22] bg-zinc-800 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    {g.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <PhotoIcon className="size-5 text-dim" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-sm uppercase leading-tight tracking-wide line-clamp-2">{g.title}</p>
                      {g.isBlacklisted ? (
                        <Badge variant="danger" size="sm">
                          {t.admin.catalog.blacklisted}
                        </Badge>
                      ) : (
                        <Badge variant="military" size="sm">
                          {t.admin.catalog.active}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {g.platform && (
                        <Badge variant="neutral" size="sm">
                          {g.platform}
                        </Badge>
                      )}
                      {g.genres.slice(0, 2).map((genre) => (
                        <Badge key={genre} variant="sky" size="sm">
                          {genre}
                        </Badge>
                      ))}
                      {g.metacritic && <Badge variant="amber" size="sm">{g.metacritic}</Badge>}
                      {g.rating && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                          <StarIcon className="h-3 w-3 text-amber" aria-hidden />
                          {Number(g.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <form action={toggleBlacklistAction} className="flex-1">
                        <input type="hidden" name="gameId" value={g.id} />
                        <input type="hidden" name="blacklisted" value={String(!g.isBlacklisted)} />
                        <button type="submit" className="hud-btn w-full !py-1 text-xs">
                          {g.isBlacklisted ? t.admin.catalog.unblockButton : t.admin.catalog.blockButton}
                        </button>
                      </form>
                      <form action={deleteGameAction}>
                        <input type="hidden" name="gameId" value={g.id} />
                        <button type="submit" className="hud-btn hud-btn-danger !px-3 !py-1 text-xs" aria-label="Delete">
                          <TrashIcon className="size-3.5" aria-hidden />
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
