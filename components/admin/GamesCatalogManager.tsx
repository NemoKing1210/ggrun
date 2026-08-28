"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  BookOpenIcon,
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
  LinkIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import {
  addCatalogGameAction,
  bulkDeleteGamesAction,
  bulkSetBlacklistedAction,
  deleteGameAction,
  toggleBlacklistAction,
} from "@/lib/modules/catalog/actions/catalog";
import {
  importExternalGameDirectAction,
  importGameFromUrlAction,
  resolveGameUrlAction,
  searchExternalGamesAction,
} from "@/lib/modules/catalog/actions/external";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { DebugError } from "@/components/ui/DebugError";
import { GameDetailsModal, toGameDetails } from "@/components/game/GameDetailsModal";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
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
            {t.core.common.cancel}
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
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t.admin.catalog.noProvidersHint}</p>
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
              {format(t.admin.catalog.resultsLabel, { count: String(searchState.results.length) })}
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
                      <input type="hidden" name="description" value={r.description ?? ""} />
                      <input type="hidden" name="playtimeHours" value={r.playtimeHours?.toString() ?? ""} />
                      <input type="hidden" name="stores" value={r.stores ? JSON.stringify(r.stores.filter((s) => s && s.url)) : ""} />
                      <input type="hidden" name="website" value={r.website ?? ""} />
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

function ImportByUrlModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [resolveState, resolveAction, resolvePending] = useActionState(resolveGameUrlAction, {} as never);
  const [importState, importAction, importPending] = useActionState(importGameFromUrlAction, {} as never);
  const game = resolveState?.game ?? null;
  const [editTitle, setEditTitle] = useState("");
  const [editCover, setEditCover] = useState("");
  const [editPlatform, setEditPlatform] = useState("");
  const [editGenres, setEditGenres] = useState("");
  const [editDesc, setEditDesc] = useState("");

  useEffect(() => {
    if (game) {
      setEditTitle(game.title ?? "");
      setEditCover(game.coverUrl ?? "");
      setEditPlatform(game.platform ?? "");
      setEditGenres((game.genres ?? []).join(", "));
      setEditDesc(game.description ?? "");
    }
  }, [game]);

  useEffect(() => {
    if (importState?.ok) {
      const tm = setTimeout(() => onClose(), 900);
      return () => clearTimeout(tm);
    }
  }, [importState, onClose]);

  useEffect(() => {
    if (!open) {
      // reset on close (after exit animation)
      const tm = setTimeout(() => {
        setUrl("");
        setEditTitle("");
        setEditCover("");
        setEditPlatform("");
        setEditGenres("");
        setEditDesc("");
      }, 200);
      return () => clearTimeout(tm);
    }
  }, [open]);

  const providerBadge = (p: string) => {
    const map: Record<string, string> = {
      steam: "bg-[#1b2838] text-[#66c0f4] border-[#2a475e]",
      gog: "bg-[#3c1a5c]/30 text-purple-300 border-purple-800",
      epic: "bg-zinc-900 text-zinc-200 border-zinc-700",
      "itch.io": "bg-[#fa5c5c]/15 text-red-300 border-red-900",
      itch: "bg-[#fa5c5c]/15 text-red-300 border-red-900",
      humble: "bg-[#cc2b4e]/15 text-red-300 border-red-900",
      generic: "bg-raised text-dim border-[#3d3d34]",
    };
    return map[p] ?? map.generic;
  };

  const handlePaste = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) setUrl(txt.trim());
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="inline-flex size-9 items-center justify-center bg-amber/10 border border-amber/30 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <LinkIcon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg uppercase tracking-wider leading-none">{t.admin.catalog.byLinkHeading}</h2>
            <p className="mt-1 max-w-lg font-mono text-[11px] leading-relaxed text-dim">{t.admin.catalog.byLinkHint}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="hud-btn !p-2 !text-dim hover:!text-amber" aria-label="Close">
          <XMarkIcon className="size-4" />
        </button>
      </div>
      <div className="hazard-tape my-4 opacity-60" aria-hidden />

      <div className="flex flex-col gap-4">
        {/* URL input row */}
        <form action={resolveAction} className="flex flex-col gap-2">
          <Field label={t.admin.catalog.urlLabel} hint={t.admin.catalog.supportedStores}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                <Input
                  name="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t.admin.catalog.urlPlaceholder}
                  className="!pl-9 !pr-3 font-mono text-xs"
                  autoFocus
                />
              </div>
              <button type="button" onClick={handlePaste} className="hud-btn !px-3 !py-2 shrink-0 inline-flex items-center gap-1.5 text-xs" title="Paste from clipboard">
                <ClipboardDocumentIcon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{t.admin.catalog.pasteButton}</span>
              </button>
              <button type="submit" disabled={resolvePending || !url.trim()} className="hud-btn hud-btn-primary shrink-0 inline-flex items-center gap-2 !px-4">
                <SparklesIcon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{resolvePending ? t.admin.catalog.fetchingButton : t.admin.catalog.fetchPreviewButton}</span>
                <span className="sm:hidden">{resolvePending ? "…" : "Fetch"}</span>
              </button>
            </div>
          </Field>
          {/* quick examples */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-dim">
            <span className="uppercase tracking-widest">{t.admin.catalog.examplesLabel}</span>
            <button type="button" onClick={() => setUrl("https://store.steampowered.com/app/570/Dota_2/")} className="rounded border border-[#2a475e] bg-[#1b2838] px-2 py-0.5 text-[#66c0f4] hover:brightness-110">Steam</button>
            <button type="button" onClick={() => setUrl("https://www.gog.com/en/game/cyberpunk_2077")} className="rounded border border-purple-800 bg-purple-950/30 px-2 py-0.5 text-purple-300 hover:brightness-110">GOG</button>
            <button type="button" onClick={() => setUrl("https://store.epicgames.com/en-US/p/fortnite")} className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:brightness-110">Epic</button>
            <button type="button" onClick={() => setUrl("https://itch.io/games/free")} className="rounded border border-red-900 bg-red-950/20 px-2 py-0.5 text-red-300 hover:brightness-110">itch.io</button>
          </div>
        </form>

        {resolveState?.error && (
          <div className="border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <p className="text-sm text-red-300" role="alert">{resolveState.error}</p>
            <DebugError debug={resolveState.debug} title="url import" />
          </div>
        )}

        {!game && !resolveState?.error && (
          <div className="hud-card border-dashed p-6 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <LinkIcon className="mx-auto size-6 text-dim" aria-hidden />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.admin.catalog.byLinkKicker}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{t.admin.catalog.noPreviewYet}</p>
          </div>
        )}

        {game && (
          <div className="flex flex-col gap-4">
            {/* Preview card */}
            <div className="hud-card overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
              <div className="flex items-center justify-between gap-2 border-b border-[#3d3d34] bg-raised/40 px-3 py-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.catalog.previewHeading}</span>
                <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest ${providerBadge(game.detectedProvider)}`}>
                  <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
                  {t.admin.catalog.detected}: {game.detectedProvider === "generic" ? t.admin.catalog.detectedGeneric : game.detectedProvider}
                </span>
              </div>
              <div className="flex gap-4 p-4">
                <div className="h-28 w-20 shrink-0 overflow-hidden border border-[#2a2a22] bg-zinc-800 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  {editCover || game.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editCover || game.coverUrl!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center"><PhotoIcon className="size-6 text-dim" aria-hidden /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base uppercase leading-tight tracking-wide line-clamp-2">{editTitle || game.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {(editPlatform || game.platform) && <Badge variant="neutral" size="sm">{editPlatform || game.platform}</Badge>}
                    {(editGenres || game.genres.join(", ")).split(",").map(s=>s.trim()).filter(Boolean).slice(0,3).map(g=> <Badge key={g} variant="sky" size="sm">{g}</Badge>)}
                    {game.metacritic && <Badge variant="amber" size="sm">MC {game.metacritic}</Badge>}
                  </div>
                  {(editDesc || game.description) && (
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">{editDesc || game.description}</p>
                  )}
                  <a href={game.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-amber hover:underline">
                    {t.admin.catalog.openStore} <ArrowTopRightOnSquareIcon className="size-3.5" aria-hidden />
                  </a>
                </div>
              </div>
              <div className="bg-amber/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-dim border-t border-[#2a2a22]">
                {t.admin.catalog.fetchedHint}
              </div>
            </div>

            {/* Edit form */}
            <form action={importAction} className="hud-card p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center bg-amber/10 border border-amber/30 text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"><SparklesIcon className="size-3.5" aria-hidden /></span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.catalog.editHint}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t.admin.catalog.previewTitleLabel} className="sm:col-span-2">
                  <Input name="title" value={editTitle} onChange={e=>setEditTitle(e.target.value)} required placeholder="Elden Ring" />
                </Field>
                <Field label={t.admin.catalog.previewPlatformLabel}>
                  <Input name="platform" value={editPlatform} onChange={e=>setEditPlatform(e.target.value)} placeholder="steam / gog" />
                </Field>
                <Field label={t.admin.catalog.previewGenresLabel}>
                  <Input name="genres" value={editGenres} onChange={e=>setEditGenres(e.target.value)} placeholder="rpg, action" />
                </Field>
                <Field label={t.admin.catalog.previewCoverLabel} className="sm:col-span-2">
                  <Input name="coverUrl" value={editCover} onChange={e=>setEditCover(e.target.value)} placeholder="https://…" />
                </Field>
                <Field label={t.admin.catalog.descriptionLabel} className="sm:col-span-2">
                  <textarea name="description" value={editDesc} onChange={e=>setEditDesc(e.target.value)} rows={3} placeholder="Short description…" className="hud-input min-h-[72px] resize-y text-xs leading-relaxed" />
                </Field>
              </div>
              {/* hidden */}
              <input type="hidden" name="tags" value={game.tags?.join(",") ?? ""} />
              <input type="hidden" name="metacritic" value={game.metacritic?.toString() ?? ""} />
              <input type="hidden" name="rating" value={game.rating?.toString() ?? ""} />
              <input type="hidden" name="website" value={game.website ?? ""} />
              <input type="hidden" name="stores" value={JSON.stringify(game.stores ?? (game.sourceUrl ? [{ store: game.platform ?? game.detectedProvider, url: game.sourceUrl }] : []))} />
              <input type="hidden" name="sourceUrl" value={game.sourceUrl ?? ""} />
              <input type="hidden" name="detectedProvider" value={game.detectedProvider ?? "generic"} />
              <input type="hidden" name="externalId" value={game.externalId ?? ""} />

              {importState?.error && (
                <div className="mt-3 border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <p className="text-sm text-red-300">{importState.error}</p>
                  <DebugError debug={importState.debug} title="import by link" />
                </div>
              )}
              {importState?.ok && (
                <div className="mt-3 border border-emerald-800 bg-emerald-950/30 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <p className="inline-flex items-center gap-1.5 text-sm text-emerald-300"><CheckIcon className="size-4" aria-hidden />{importState.ok}</p>
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="hud-btn">{t.core.common.cancel}</button>
                <button type="submit" disabled={importPending || !editTitle.trim()} className="hud-btn hud-btn-primary min-w-32 inline-flex items-center justify-center gap-2">
                  {importPending ? "…" : <><PlusIcon className="size-4" aria-hidden />{t.admin.catalog.importByLinkButton}</>}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function GamesCatalogManager({ games, availableProviders }: Props) {
  const { t } = useI18n();
  const [filterQ, setFilterQ] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [byLinkOpen, setByLinkOpen] = useState(false);
  const [detailsGame, setDetailsGame] = useState<CatalogGame | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const filteredActive = useMemo(() => filtered.filter((g) => !g.isBlacklisted).length, [filtered]);
  const filteredBlacklisted = filtered.length - filteredActive;
  const selectedCount = selected.size;
  const selectedGames = useMemo(() => games.filter((g) => selected.has(g.id)), [games, selected]);
  const selectedBlacklisted = useMemo(() => selectedGames.filter((g) => g.isBlacklisted).length, [selectedGames]);
  const selectedActive = selectedCount - selectedBlacklisted;
  const allFilteredSelected = filtered.length > 0 && filtered.every((g) => selected.has(g.id));

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllFiltered = () => {
    const ids = filtered.map((g) => g.id);
    const all = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (all) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // keep selection in sync when games list shrinks (deleted)
  useEffect(() => {
    const ids = new Set(games.map((g) => g.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [games]);

  return (
    <div className="flex flex-col gap-4">
      <AddGameModal open={addOpen} onClose={() => setAddOpen(false)} />
      <SearchImportModal open={searchOpen} onClose={() => setSearchOpen(false)} availableProviders={availableProviders} />
      <ImportByUrlModal open={byLinkOpen} onClose={() => setByLinkOpen(false)} />
      <GameDetailsModal
        game={detailsGame ? toGameDetails(detailsGame as unknown as Record<string, unknown>) : null}
        onClose={() => setDetailsGame(null)}
      />

      {/* Toolbar — two stacked HUD panels: filter on top, actions below */}
      <div className="flex flex-col gap-3">
        <section className="hud-card overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#3d3d34] bg-raised/40 px-4 py-2.5">
            <h2 className="inline-flex items-center gap-2 font-display text-xs uppercase tracking-[0.14em] text-amber">
              <span className="inline-flex size-6 items-center justify-center bg-raised border border-[#3d3d34] text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <FunnelIcon className="size-3.5" aria-hidden />
              </span>
              {t.admin.catalog.viewLabel}
              <span className="hidden font-mono text-[10px] font-normal normal-case tracking-normal text-dim sm:inline">· {filtered.length} / {games.length}</span>
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{"// FILTER"}</span>
          </div>
          <div className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-[360px]">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                <Input
                  placeholder={t.admin.catalog.filterPlaceholder}
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                  className="!pl-9"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 [-webkit-overflow-scrolling:touch]">
                {(["all", "active", "blacklisted"] as const).map((v) => {
                  const isActive = tab === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTab(v)}
                      className={
                        isActive
                          ? "hud-btn hud-btn-primary !py-1.5 !px-3 text-xs whitespace-nowrap shrink-0"
                          : "hud-btn !py-1.5 !px-3 text-xs !border-dim/20 hover:!border-amber/40 whitespace-nowrap shrink-0"
                      }
                    >
                      {v === "all" ? t.admin.catalog.filterAll : v === "active" ? t.admin.catalog.filterActive : t.admin.catalog.filterBlocked}
                      <span className={isActive ? "ml-1.5 opacity-80" : "ml-1.5 text-dim"}>· {counts[v]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {(filterQ || tab !== "all") && (
              <div className="mt-3 flex items-center gap-2 border-t border-[#2a2a22] pt-3 font-mono text-xs text-dim">
                <span>
                  {t.admin.catalog.showingLabel} <span className="text-amber">{filtered.length}</span> / {games.length}
                </span>
                {filterQ && <span className="hidden sm:inline">· {t.admin.catalog.queryLabelShort} “{filterQ}”</span>}
                {filterQ && <span className="sm:hidden truncate">· “{filterQ}”</span>}
                <button
                  type="button"
                  onClick={() => {
                    setFilterQ("");
                    setTab("all");
                  }}
                  className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-amber hover:underline"
                >
                  <ArrowPathIcon className="size-3.5" aria-hidden /> {t.admin.catalog.resetButton}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="hud-card overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#3d3d34] bg-raised/40 px-4 py-2.5">
            <h2 className="inline-flex items-center gap-2 font-display text-xs uppercase tracking-[0.14em] text-amber">
              <span className="inline-flex size-6 items-center justify-center bg-amber/10 border border-amber/30 text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <SparklesIcon className="size-3.5" aria-hidden />
              </span>
              ACTIONS
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{"// POOL · ADD & IMPORT"}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3 sm:p-4">
            <button type="button" onClick={() => setByLinkOpen(true)} className="hud-btn hud-btn-primary group flex items-center justify-center gap-2.5 !py-3 text-sm border-amber/60 bg-amber text-[#171713] hover:brightness-110">
              <span className="inline-flex size-7 items-center justify-center bg-black/15 border border-black/15 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <LinkIcon className="size-4" aria-hidden />
              </span>
              <span className="flex flex-col items-start leading-none text-left">
                <span className="font-display uppercase tracking-wider">{t.admin.catalog.byLinkButton}</span>
                <span className="font-mono text-[10px] normal-case tracking-normal opacity-60 hidden sm:inline">{t.admin.catalog.supportedStores}</span>
              </span>
            </button>
            <button type="button" onClick={() => setSearchOpen(true)} className="hud-btn flex items-center justify-center gap-2.5 !py-3 text-sm">
              <span className="inline-flex size-7 items-center justify-center bg-raised border border-[#3d3d34] text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <GlobeAltIcon className="size-4" aria-hidden />
              </span>
              <span className="flex flex-col items-start leading-none text-left">
                <span className="font-display uppercase tracking-wider">{t.admin.catalog.searchMobile}</span>
                <span className="font-mono text-[10px] normal-case tracking-normal text-dim hidden sm:inline">RAWG · IGDB · Steam</span>
              </span>
            </button>
            <button type="button" onClick={() => setAddOpen(true)} className="hud-btn flex items-center justify-center gap-2.5 !py-3 text-sm">
              <span className="inline-flex size-7 items-center justify-center bg-raised border border-[#3d3d34] text-dim group-hover:text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <PlusIcon className="size-4" aria-hidden />
              </span>
              <span className="flex flex-col items-start leading-none text-left">
                <span className="font-display uppercase tracking-wider">{t.admin.catalog.addGameButton}</span>
                <span className="font-mono text-[10px] normal-case tracking-normal text-dim hidden sm:inline">{t.admin.catalog.manualEntryHint}</span>
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* Pool */}
      <section className="hud-card overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <h2 className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-widest">
            <span className="inline-flex size-7 items-center justify-center bg-raised border border-[#3d3d34] text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <FunnelIcon className="size-4" aria-hidden />
            </span>
            {t.admin.catalog.poolTitle}
            <span className="font-mono text-xs font-normal normal-case tracking-normal text-dim">
              {filtered.length} / {games.length}
            </span>
          </h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">{t.admin.catalog.hudPool}</span>
        </div>
        {games.length > 0 && (
          <div className={`flex flex-col gap-2 border-b px-3 py-3 sm:px-4 ${selectedCount > 0 ? "bg-amber/[0.06] border-amber/20" : "bg-[#0f0f0f]/60 border-[#3d3d34]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  aria-label={t.admin.catalog.selectAll}
                  className="size-4 appearance-none border border-[#3d3d34] bg-[#1a1a1a] [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] checked:bg-amber checked:border-amber checked:[background-image:linear-gradient(45deg,transparent_45%,#171713_45%,#171713_55%,transparent_55%)]"
                />
                <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
                  {allFilteredSelected ? t.admin.catalog.deselectAll : t.admin.catalog.selectAll}
                </span>
                {selectedCount > 0 ? (
                  <span className="rounded border border-amber/30 bg-amber/15 px-1.5 py-0.5 font-mono text-[11px] text-amber">{format(t.admin.catalog.bulkSelected, { count: String(selectedCount) })}</span>
                ) : (
                  <span className="hidden font-mono text-[11px] text-dim sm:inline">{t.admin.catalog.bulkNoSelectionHint}</span>
                )}
                {selectedCount > 0 && (
                  <button type="button" onClick={clearSelection} className="font-mono text-[11px] text-amber hover:underline">
                    {t.admin.catalog.deselectAll}
                  </button>
                )}
              </label>
              <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">{"// "}{t.admin.catalog.bulkBarLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedCount > 0 ? (
                <>
                  <form
                    action={bulkSetBlacklistedAction}
                    onSubmit={(e) => {
                      if (selectedBlacklisted === 0 || !window.confirm(format(t.admin.catalog.bulkConfirmEnable, { count: String(selectedBlacklisted) })))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="ids" value={selectedGames.filter((g) => g.isBlacklisted).map((g) => g.id).join(",")} />
                    <input type="hidden" name="blacklisted" value="false" />
                    <button type="submit" disabled={selectedBlacklisted === 0} className="hud-btn !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-40">
                      <ShieldCheckIcon className="size-3.5" aria-hidden /> {t.admin.catalog.bulkEnableSelected} {selectedBlacklisted > 0 ? `· ${selectedBlacklisted}` : ""}
                    </button>
                  </form>
                  <form
                    action={bulkSetBlacklistedAction}
                    onSubmit={(e) => {
                      if (selectedActive === 0 || !window.confirm(format(t.admin.catalog.bulkConfirmDisable, { count: String(selectedActive) })))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="ids" value={selectedGames.filter((g) => !g.isBlacklisted).map((g) => g.id).join(",")} />
                    <input type="hidden" name="blacklisted" value="true" />
                    <button type="submit" disabled={selectedActive === 0} className="hud-btn !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-40">
                      <NoSymbolIcon className="size-3.5" aria-hidden /> {t.admin.catalog.bulkDisableSelected} {selectedActive > 0 ? `· ${selectedActive}` : ""}
                    </button>
                  </form>
                  <form
                    action={bulkDeleteGamesAction}
                    onSubmit={(e) => {
                      if (!window.confirm(format(t.admin.catalog.bulkConfirmDelete, { count: String(selectedCount) }))) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="ids" value={Array.from(selected).join(",")} />
                    <button type="submit" className="hud-btn hud-btn-danger !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5">
                      <TrashIcon className="size-3.5" aria-hidden /> {t.admin.catalog.bulkDeleteSelected} · {selectedCount}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <form
                    action={bulkSetBlacklistedAction}
                    onSubmit={(e) => {
                      if (filteredBlacklisted === 0 || !window.confirm(format(t.admin.catalog.bulkConfirmEnable, { count: String(filteredBlacklisted) })))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="ids" value={filtered.filter((g) => g.isBlacklisted).map((g) => g.id).join(",")} />
                    <input type="hidden" name="blacklisted" value="false" />
                    <button type="submit" disabled={filteredBlacklisted === 0} className="hud-btn !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-40">
                      <ShieldCheckIcon className="size-3.5" aria-hidden /> {filtered.length !== games.length ? t.admin.catalog.bulkEnableFiltered : t.admin.catalog.bulkEnableAll} {filteredBlacklisted > 0 ? `· ${filteredBlacklisted}` : ""}
                    </button>
                  </form>
                  <form
                    action={bulkSetBlacklistedAction}
                    onSubmit={(e) => {
                      if (filteredActive === 0 || !window.confirm(format(t.admin.catalog.bulkConfirmDisable, { count: String(filteredActive) })))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="ids" value={filtered.filter((g) => !g.isBlacklisted).map((g) => g.id).join(",")} />
                    <input type="hidden" name="blacklisted" value="true" />
                    <button type="submit" disabled={filteredActive === 0} className="hud-btn !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-40">
                      <NoSymbolIcon className="size-3.5" aria-hidden /> {filtered.length !== games.length ? t.admin.catalog.bulkDisableFiltered : t.admin.catalog.bulkDisableAll} {filteredActive > 0 ? `· ${filteredActive}` : ""}
                    </button>
                  </form>
                  <form
                    action={bulkDeleteGamesAction}
                    onSubmit={(e) => {
                      const isAll = filtered.length === games.length;
                      const msg = isAll ? format(t.admin.catalog.bulkConfirmDeleteAll, { count: String(filtered.length) }) : format(t.admin.catalog.bulkConfirmDelete, { count: String(filtered.length) });
                      if (!window.confirm(msg)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="ids" value={filtered.map((g) => g.id).join(",")} />
                    <button type="submit" disabled={filtered.length === 0} className="hud-btn hud-btn-danger !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-40">
                      <TrashIcon className="size-3.5" aria-hidden /> {filtered.length !== games.length ? t.admin.catalog.bulkDeleteFiltered : t.admin.catalog.bulkDeleteAll} · {filtered.length}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="m-4 border border-dashed border-dim/20 bg-background/20 p-8 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <PhotoIcon className="mx-auto size-7 text-dim" aria-hidden />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">
              {games.length === 0 ? t.admin.catalog.emptyCatalogTitle : t.admin.catalog.emptyFilteredTitle}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
              {games.length === 0 ? t.admin.catalog.emptyCatalogHint : t.admin.catalog.emptyFilteredHint}
            </p>
            {games.length === 0 && (
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => setAddOpen(true)} className="hud-btn hud-btn-primary !py-1.5">
                  <PlusIcon className="size-4" aria-hidden /> {t.admin.catalog.addGameButton}
                </button>
                <button type="button" onClick={() => setSearchOpen(true)} className="hud-btn !py-1.5">
                  <MagnifyingGlassIcon className="size-4" aria-hidden /> {t.admin.catalog.searchApiButton}
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
                    <th className="w-8 p-2 text-center">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label={t.admin.catalog.colSelect} className="size-3.5 accent-amber" />
                    </th>
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
                    <tr key={g.id} className={`group transition-colors ${selected.has(g.id) ? "bg-amber/[0.06]" : "hover:bg-amber/[0.04]"}`}>
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} aria-label={t.admin.catalog.colSelect} className="size-3.5 accent-amber" />
                      </td>
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
                          <button
                            type="button"
                            onClick={() => setDetailsGame(g)}
                            className="hud-btn !px-2.5 !py-1 text-[11px] border-dim/30 inline-flex items-center gap-1"
                          >
                            <BookOpenIcon className="size-3.5" aria-hidden /> {t.core.gameInfo.details}
                          </button>
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
                  className={`hud-card flex gap-3 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${selected.has(g.id) ? "bg-amber/[0.06] border-amber/20" : "bg-[#0f0f0f]"}`}
                >
                  <label className="flex items-center self-center pl-0.5">
                    <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} aria-label={t.admin.catalog.colSelect} className="size-4 accent-amber" />
                  </label>
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
                      <button type="button" onClick={() => setDetailsGame(g)} className="hud-btn !py-1 text-xs inline-flex items-center justify-center gap-1 flex-1">
                        <BookOpenIcon className="size-3.5" aria-hidden /> {t.core.gameInfo.details}
                      </button>
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
