"use client";

import { useRef } from "react";
import { ArrowUpTrayIcon, Square3Stack3DIcon, TrashIcon } from "@heroicons/react/24/outline";

import { SQUARE_CLIP } from "@/components/iee/IeeArtTile";
import { Badge } from "@/components/ui/Badge";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { EntryState } from "@/lib/modules/iee/library/screens";

/** Where an entry stands against its revisions: never published, published as it is, or changed since. */
export function EntryStateBadge({ state, latestNumber }: { state: EntryState; latestNumber: number | null }) {
  const { t } = useI18n();
  const s = t.ieeEditor.state;
  const number = String(latestNumber ?? 0);
  if (state === "new") return <Badge variant="dim">{s.new}</Badge>;
  if (state === "changed") return <Badge variant="amber">{format(s.changed, { number })}</Badge>;
  return (
    <Badge variant="neutral" className="font-mono">
      {format(s.published, { number })}
    </Badge>
  );
}

/**
 * An icon slot with upload and remove. The picture goes to the server as soon
 * as it is chosen — icons belong to the entry or pack, not to a draft (spec §12).
 */
export function IconUpload({
  preview,
  hasIcon,
  uploadLabel,
  clearLabel,
  hint,
  disabled,
  onUpload,
  onClear,
}: {
  preview: React.ReactNode;
  hasIcon: boolean;
  uploadLabel: string;
  clearLabel: string;
  hint?: string;
  disabled?: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex items-start gap-3">
      {preview}
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1 text-[11px]"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <ArrowUpTrayIcon className="size-3.5" aria-hidden />
            {uploadLabel}
          </button>
          {hasIcon && (
            <button
              type="button"
              className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1 text-[11px]"
              disabled={disabled}
              onClick={onClear}
            >
              <TrashIcon className="size-3.5" aria-hidden />
              {clearLabel}
            </button>
          )}
        </div>
        {hint && <p className="max-w-md text-xs leading-relaxed text-zinc-500">{hint}</p>}
        <input
          ref={input}
          type="file"
          accept="image/png,image/webp"
          className="hidden"
          aria-label={uploadLabel}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>
    </div>
  );
}

/** A section of a constructor screen: `hud-card`, a heading with an anchor, an error count. */
export function Block({
  id,
  title,
  errors = 0,
  warnings = 0,
  right,
  children,
}: {
  id: string;
  title: string;
  errors?: number;
  warnings?: number;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="hud-card scroll-mt-24 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest text-amber">
          {title}
          {errors > 0 && (
            <Badge variant="danger" className="font-mono">
              {errors}
            </Badge>
          )}
          {errors === 0 && warnings > 0 && (
            <Badge variant="amber" className="font-mono">
              {warnings}
            </Badge>
          )}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A label above a group of controls that is not a single input (chips, a list). */
export function GroupLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{children}</span>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{hint}</p>}
    </div>
  );
}

const TILE_SIZE = { sm: "size-10", md: "size-14", lg: "size-24" } as const;
const TILE_GLYPH = { sm: "size-5", md: "size-7", lg: "size-12" } as const;

/** A pack's picture: its icon in the house square, or the stacked-pack glyph. */
export function PackTile({ iconUrl, size = "md" }: { iconUrl: string | null; size?: keyof typeof TILE_SIZE }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-amber/40 bg-amber/10 text-amber ${SQUARE_CLIP} ${TILE_SIZE[size]}`}
      aria-hidden
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className={`size-full object-cover ${SQUARE_CLIP}`} />
      ) : (
        <Square3Stack3DIcon className={TILE_GLYPH[size]} />
      )}
    </span>
  );
}

/** A form for a file the user picks — the bytes travel as `file`, with the given fields. */
export function fileForm(fields: Record<string, string>, file?: File): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set("file", file);
  return fd;
}
