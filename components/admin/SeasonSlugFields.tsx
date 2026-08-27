"use client";

import { useState } from "react";
import { TagIcon } from "@heroicons/react/24/outline";

import { slugify } from "@/lib/slugify";
import { useI18n } from "@/lib/i18n/client";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

/**
 * Title + slug pair for season creation. While the user typed the title and
 * has not edited the slug by hand, the slug is auto-filled (Cyrillic title
 * is transliterated). Emptying the slug resumes auto-fill; any manual edit
 * takes over. The server still falls back to slugify(title) on submit.
 */
export function SeasonSlugFields() {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);

  const handleTitle = (value: string) => {
    setTitle(value);
    if (!slugDirty) setSlug(slugify(value));
  };

  const handleSlug = (value: string) => {
    setSlug(value);
    // An empty slug means "auto" again — resume generation from the title.
    setSlugDirty(value.trim().length > 0);
  };

  return (
    <>
      <Field label={t.admin.createSeason.titleLabel}>
        <Input
          name="title"
          required
          autoFocus
          placeholder={t.admin.createSeason.titlePlaceholder}
          value={title}
          onChange={(e) => handleTitle(e.target.value)}
        />
      </Field>
      <Field label={t.admin.createSeason.slugLabel}>
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