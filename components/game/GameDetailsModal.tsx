"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDaysIcon,
  ClockIcon,
  GlobeAltIcon,
  LinkIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useI18n } from "@/lib/i18n/client";
import { buildStoreLinks, type StoreLink } from "@/lib/modules/catalog/store-links";
import { format } from "@/lib/i18n/format";

/** Serializable game info used by cards and the details modal. */
export interface GameDetails {
  title: string;
  platform: string | null;
  coverUrl: string | null;
  genres: string[];
  tags: string[];
  metacritic: number | null;
  rating: number | null;
  releasedAt: string | null;
  esrb: string | null;
  description: string | null;
  playtimeHours: number | null;
  stores: Array<{ store: string; url: string }> | null;
  website: string | null;
  externalSource: string | null;
}

/** Collapses any fetched game-like row (CatalogGame / OpenRoll.game) shape. */
export function toGameDetails(g: Record<string, unknown> | null | undefined): GameDetails | null {
  if (!g) return null;
  return {
    title: String(g.title ?? ""),
    platform: g.platform ? String(g.platform) : null,
    coverUrl: g.coverUrl ? String(g.coverUrl) : null,
    genres: Array.isArray(g.genres) ? g.genres.map(String) : [],
    tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
    metacritic: g.metacritic != null ? Number(g.metacritic) : null,
    rating: g.rating != null ? Number(g.rating) : null,
    releasedAt: g.releasedAt ? String(g.releasedAt) : null,
    esrb: g.esrb ? String(g.esrb) : null,
    description: g.description ? String(g.description) : null,
    playtimeHours: g.playtimeHours != null ? Number(g.playtimeHours) : null,
    stores: Array.isArray(g.stores)
      ? g.stores.filter((s): s is { store: string; url: string } => !!s && typeof s === "object" && !!s.store && !!s.url)
      : null,
    website: g.website ? String(g.website) : null,
    externalSource: g.externalSource ? String(g.externalSource) : null,
  };
}

export function EsrbBadge({ value }: { value: string }) {
  const label = value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant="sky" size="sm">{label}</Badge>;
}

/**
 * Full game info: cover, description, meta grid (year / ESRB / Metacritic /
 * rating / playtime), genre & tag chips, and store links. Used from the
 * dashboard roll card, the games history and the admin catalog.
 */
export function GameDetailsModal({ game, onClose }: { game: GameDetails | null; onClose: () => void }) {
  const { t } = useI18n();
  const gi = t.core.gameInfo;
  const [expanded, setExpanded] = useState(false);
  const latest = useRef(game);
  if (game) latest.current = game;
  const g = game ?? latest.current;

  const stores: StoreLink[] = g ? buildStoreLinks(g) : [];
  const year = g?.releasedAt ? new Date(g.releasedAt).getUTCFullYear() : null;

  // Reset the expand state each time a new game opens.
  useEffect(() => {
    setExpanded(false);
  }, [g?.title]);

  return (
    <Modal open={!!game} onClose={onClose} panelClassName="max-w-2xl">
      {g ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              {g.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.coverUrl}
                  alt={g.title}
                  className="h-24 w-[86px] shrink-0 border border-[#3d3d34] bg-zinc-800 object-cover [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)]"
                />
              ) : (
                <div className="flex h-24 w-[86px] shrink-0 items-center justify-center border border-dashed border-dim/30 bg-raised text-dim [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)]">
                  <PhotoIcon className="size-6" aria-hidden />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-display text-xl uppercase leading-tight tracking-wide">{g.title}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.platform && (
                    <span className="border border-dim/30 bg-background/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                      {g.platform}
                    </span>
                  )}
                  {year && (
                    <span className="inline-flex items-center gap-1 border border-dim/30 bg-background/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                      <CalendarDaysIcon className="size-3" aria-hidden /> {year}
                    </span>
                  )}
                  {g.esrb && <EsrbBadge value={g.esrb} />}
                  {g.externalSource && (
                    <Badge variant="neutral" size="sm" className="font-mono">
                      {g.externalSource}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {g.metacritic != null && (
                    <Badge variant="amber" size="sm" className="font-mono">{gi.metaLabel} {g.metacritic}</Badge>
                  )}
                  {g.rating != null && (
                    <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-0.5 font-mono text-xs text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                      <StarSolid className="size-3.5" aria-hidden /> {g.rating.toFixed(1)}
                    </span>
                  )}
                  {g.playtimeHours != null && g.playtimeHours > 0 && (
                    <span className="inline-flex items-center gap-1 border border-dim/30 bg-background/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                      <ClockIcon className="size-3" aria-hidden /> {format(gi.playtime, { hours: g.playtimeHours })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="hud-btn !p-2 !text-dim hover:!text-amber"
              aria-label={gi.close}
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>

          <div className="hazard-tape my-4 opacity-60" aria-hidden />

          {/* Description */}
          <div className="min-h-[64px]">
            {g.description ? (
              <p
                className={`max-w-prose font-sans text-sm leading-relaxed text-zinc-300 ${
                  expanded ? "" : "line-clamp-4"
                }`}
              >
                {g.description}
              </p>
            ) : (
              <p className="font-mono text-xs text-dim">{gi.noDescription}</p>
            )}
            {g.description && g.description.length > 220 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-amber underline underline-offset-4 hover:text-amber/80"
              >
                {expanded ? gi.collapse : gi.expand}
              </button>
            )}
          </div>

          {/* Genres & tags */}
          {(g.genres.length > 0 || g.tags.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {g.genres.slice(0, 6).map((x) => (
                <Badge key={`g-${x}`} variant="sky" size="sm">{x}</Badge>
              ))}
              {g.tags.slice(0, 8).map((x) => (
                <Badge key={`t-${x}`} variant="neutral" size="sm">{x}</Badge>
              ))}
            </div>
          )}

          {/* Store links */}
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dim">
              <LinkIcon className="size-3.5 text-amber" aria-hidden />
              {gi.stores}
            </p>
            <div className="flex flex-wrap gap-2">
              {stores.map((s) => (
                <a
                  key={`${s.store}-${s.url}`}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
                >
                  <GlobeAltIcon className="size-3.5 text-amber" aria-hidden />
                  {s.store}
                </a>
              ))}
              {g.website && (
                <a
                  href={g.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
                >
                  {gi.website}
                </a>
              )}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-dim/60">{gi.storesHint}</p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}