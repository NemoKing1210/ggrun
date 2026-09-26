"use client";

import { GENRES, TAGS } from "@/lib/modules/catalog/pool/constants";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/shared/utils/cn";

const GENRE_LABEL = new Map<string, string>(GENRES.map((g) => [g.value, g.label]));
const TAG_LABEL = new Map<string, string>(TAGS.map((t) => [t.value, t.label]));

const CLIP = "[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]";

/**
 * A game's genres and tags, told apart.
 *
 * Season pools filter on both, so a game that came up "because of a tag" was
 * unexplainable while the card showed only the genres: Naraka: Bladepoint read
 * "shooter · action" in a season asking for horror, survival or zombie, though
 * the catalog row carried `survival` all along.
 *
 * Genres keep the card's quiet chip; tags are told apart by colour alone — a
 * cold tint, and a `title` naming which is which. Amber is avoided on purpose:
 * in the season editor amber means "selected in the filter", and a tag on a
 * card is not a selection. Known values show the same
 * label the season editor uses; a tag that merely repeats a genre (older
 * FreeToGame rows stored the provider's label in both columns) is shown once.
 */
export function GameCategoryChips({
  genres,
  tags,
  limit = 4,
  className,
}: {
  genres: readonly string[];
  tags: readonly string[];
  limit?: number;
  className?: string;
}) {
  const { t } = useI18n();
  const shownGenres = genres.slice(0, limit);
  const genreSet = new Set(genres);
  const shownTags = tags.filter((tg) => !genreSet.has(tg)).slice(0, limit);
  if (shownGenres.length === 0 && shownTags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {shownGenres.map((g) => (
        <span
          key={`g-${g}`}
          title={t.core.gameInfo.genre}
          className={cn("border border-dim/25 bg-background/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim", CLIP)}
        >
          {GENRE_LABEL.get(g) ?? g}
        </span>
      ))}
      {shownTags.map((tg) => (
        <span
          key={`t-${tg}`}
          title={t.core.gameInfo.tag}
          className={cn("border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-sky-300", CLIP)}
        >
          {TAG_LABEL.get(tg) ?? tg}
        </span>
      ))}
    </div>
  );
}
