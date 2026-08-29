"use client";

import { useMemo, useState } from "react";
import { ArrowPathIcon, SparklesIcon, TagIcon } from "@heroicons/react/24/outline";

import { slugify } from "@/lib/shared/utils/slugify";
import { generateSeasonTitle } from "@/lib/shared/utils/season-names";
import { useI18n } from "@/lib/i18n/client";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

/**
 * Title + slug pair for season creation.
 * Title is now optional — empty means auto-generated "Adjective Noun" on the server.
 * Shows live auto-preview and a shuffle button for instant fill.
 */
export function SeasonSlugFields() {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);

  const autoPreview = useMemo(() => generateSeasonTitle(), []);
  const displayTitle = title.trim() ? title.trim() : autoPreview;
  const displaySlug = slug.trim() ? slug.trim() : slugify(displayTitle);

  const handleTitle = (value: string) => {
    setTitle(value);
    if (!slugDirty) setSlug(slugify(value));
  };

  const handleSlug = (value: string) => {
    setSlug(value);
    setSlugDirty(value.trim().length > 0);
  };

  const shuffle = () => {
    const next = generateSeasonTitle();
    setTitle(next);
    setSlug(slugify(next));
    setSlugDirty(false);
  };

  const isAuto = title.trim().length === 0;

  return (
    <>
      <Field
        label={t.admin.createSeason.titleLabel}
        hint={isAuto ? t.admin.createSeason.autoTitleHint : undefined}
      >
        <div className="relative">
          <Input
            name="title"
            autoFocus
            placeholder={t.admin.createSeason.titlePlaceholder}
            value={title}
            onChange={(e) => handleTitle(e.target.value)}
            className={isAuto ? "!pr-10 border-amber/40" : ""}
            aria-describedby="season-title-auto"
          />
          <button
            type="button"
            onClick={shuffle}
            title={t.admin.createSeason.shuffleTitle}
            aria-label={t.admin.createSeason.shuffleTitle}
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center border border-amber/30 bg-amber/10 text-amber hover:bg-amber hover:text-black transition [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
          >
            <ArrowPathIcon className="size-3.5" aria-hidden />
          </button>
        </div>
        <div
          id="season-title-auto"
          className={`mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] ${isAuto ? "text-amber" : "text-dim"}`}
        >
          <SparklesIcon className="size-3 shrink-0" aria-hidden />
          <span className={isAuto ? "text-amber" : "text-zinc-500"}>
            {isAuto ? `${t.admin.createSeason.autoPreviewLabel}:` : t.admin.createSeason.liveSlugLabel}
          </span>
          <Badge variant={isAuto ? "amber" : "dim"} size="sm" className="!px-1.5 !py-0 font-mono">
            {displayTitle}
          </Badge>
          <span className="text-zinc-600">→</span>
          <span className="inline-flex items-center gap-1">
            <TagIcon className="size-3 text-dim" aria-hidden />
            {displaySlug}
          </span>
          {isAuto && <span className="text-amber/70">· {t.admin.createSeason.autoBadge}</span>}
        </div>
      </Field>
      <Field label={t.admin.createSeason.slugLabel} hint={t.admin.createSeason.slugHint}>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim">
            <TagIcon className="size-3.5" aria-hidden />
          </span>
          <Input
            name="slug"
            maxLength={100}
            spellCheck={false}
            autoComplete="off"
            placeholder={t.admin.createSeason.slugPlaceholder}
            className="!pl-7"
            value={slug}
            onChange={(e) => handleSlug(e.target.value)}
          />
        </div>
      </Field>
    </>
  );
}
