"use client";

import { IEE_ICONS } from "@/components/iee/IeeIcon";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { EntryArt } from "@/lib/engine";
import { IEE_GLYPHS, RARITIES, type EntryDoc } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { withKind } from "@/lib/modules/iee/library/draft";

import { issueText } from "../issue-text";
import { Block, GroupLabel, IconUpload } from "../parts";
import { fieldError, issuesWhere, useEditor } from "./editor-context";

const LOCALES = ["ru", "en", "uk"] as const;

/** Basics (plan §6 task 3.2): what the entry is called, what it is, how it is drawn. */
export function BasicsBlock({
  art,
  onIcon,
  iconBusy,
}: {
  art: EntryArt;
  /** A file to upload, or null to remove the icon. */
  onIcon: (file: File | null) => void;
  iconBusy: boolean;
}) {
  const { t } = useI18n();
  const b = t.ieeEditor.entry.basics;
  const { doc, update, readOnly, kindLocked, analysis } = useEditor();
  const issues = issuesWhere(analysis, (s) => s.block === "basics");
  const err = (field: string) => {
    const issue = fieldError(analysis, "basics", field);
    return issue ? issueText(issue, t) : undefined;
  };
  const set = (patch: Partial<EntryDoc>) => update((d) => ({ ...d, ...patch }));

  return (
    <Block id="block-basics" title={t.ieeEditor.entry.blocks.basics} errors={issues.errors.length} warnings={issues.warnings.length}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <GroupLabel hint={kindLocked ? b.kindLocked : undefined}>{b.kind}</GroupLabel>
          <div className="flex gap-1.5">
            {(["item", "effect"] as const).map((k) => (
              <Chip
                key={k}
                active={doc.kind === k}
                disabled={readOnly || kindLocked}
                onClick={() => update((d) => withKind(d, k))}
              >
                {t.ieeEditor.kind[k]}
              </Chip>
            ))}
          </div>
        </div>

        <Field label={b.slug} hint={b.slugHint} error={err("slug")}>
          <Input
            value={doc.slug}
            disabled={readOnly}
            className="font-mono"
            invalid={err("slug") !== undefined}
            onChange={(e) => set({ slug: e.target.value.trim() })}
          />
        </Field>

        <Field label={b.name} hint={b.nameHint} error={err("name")} className="md:col-span-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {LOCALES.map((loc) => (
              <Input
                key={loc}
                value={doc.name[loc] ?? ""}
                disabled={readOnly}
                placeholder={t.ieeEditor.locales[loc]}
                aria-label={`${b.name} ${t.ieeEditor.locales[loc]}`}
                invalid={loc === "ru" && err("name.ru") !== undefined}
                onChange={(e) => update((d) => ({ ...d, name: { ...d.name, [loc]: e.target.value } }))}
              />
            ))}
          </div>
        </Field>

        <Field label={b.flavor} hint={b.flavorHint} error={err("flavor")} className="md:col-span-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {LOCALES.map((loc) => (
              <Textarea
                key={loc}
                rows={2}
                value={doc.flavor?.[loc] ?? ""}
                disabled={readOnly}
                placeholder={t.ieeEditor.locales[loc]}
                aria-label={`${b.flavor} ${t.ieeEditor.locales[loc]}`}
                onChange={(e) =>
                  update((d) => ({ ...d, flavor: { ru: "", ...d.flavor, [loc]: e.target.value } }))
                }
              />
            ))}
          </div>
        </Field>

        <div>
          <GroupLabel hint={t.ieeEditor.characterHint}>{b.character}</GroupLabel>
          <div className="flex gap-1.5">
            {(["bonus", "penalty"] as const).map((c) => (
              <Chip
                key={c}
                active={doc.character === c}
                variant={c === "bonus" ? "military" : "danger"}
                disabled={readOnly}
                onClick={() => set({ character: c })}
              >
                {t.ieeEditor.character[c]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <GroupLabel hint={b.rarityHint}>{b.rarity}</GroupLabel>
          <div className="flex flex-wrap gap-1.5">
            {RARITIES.map((r) => (
              <Chip key={r} active={doc.rarity === r} disabled={readOnly} onClick={() => set({ rarity: r })}>
                {t.iee.rarity[r]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <GroupLabel hint={b.glyphHint}>{b.glyph}</GroupLabel>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={b.glyph}>
            <GlyphButton active={!doc.glyph} disabled={readOnly} label={t.ieeEditor.none} onClick={() => set({ glyph: undefined })}>
              <span className="font-mono text-[10px] uppercase">—</span>
            </GlyphButton>
            {IEE_GLYPHS.map((name) => {
              const Icon = IEE_ICONS[name];
              return (
                <GlyphButton key={name} active={doc.glyph === name} disabled={readOnly} label={name} onClick={() => set({ glyph: name })}>
                  {Icon ? <Icon className="size-5" /> : name}
                </GlyphButton>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-2">
          <GroupLabel>{b.icon}</GroupLabel>
          <IconUpload
            preview={
              <IeeArtTile
                kind={doc.kind}
                entryKey={doc.slug}
                glyph={doc.glyph ?? null}
                art={art}
                polarity={doc.character === "bonus" ? "positive" : "negative"}
                size="lg"
              />
            }
            hasIcon={art.iconUrl !== null}
            uploadLabel={b.upload}
            clearLabel={b.clearIcon}
            hint={b.iconHint}
            disabled={readOnly || iconBusy}
            onUpload={(file) => onIcon(file)}
            onClear={() => onIcon(null)}
          />
        </div>
      </div>
    </Block>
  );
}

function GlyphButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center border transition-colors [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
        active
          ? "border-amber bg-amber text-black"
          : "border-zinc-700 bg-[#1a1a1a] text-zinc-300 hover:border-amber/50 hover:text-zinc-100"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}
