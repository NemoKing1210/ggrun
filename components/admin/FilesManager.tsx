"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ClipboardDocumentIcon, DocumentIcon, TrashIcon } from "@heroicons/react/24/outline";

import { deleteFileAction, uploadFileAction, type FileUploadState } from "@/lib/modules/files/actions";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { DebugError } from "@/components/ui/DebugError";
import { useActionToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

/** One row of the admin file browser — serialized on the server. */
export type AdminFileRow = {
  id: string;
  key: string;
  category: string;
  link: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  visibility: "public" | "private";
  ownerUsername: string | null;
  createdAt: string;
};

type Props = {
  rows: AdminFileRow[];
  categories: Array<{ id: string; label: string }>;
  activeCategory: string | null;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function FilesManager({ rows, categories, activeCategory }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const f = t.admin.files;
  const [state, formAction, pending] = useActionState<FileUploadState, FormData>(uploadFileAction, {});
  useActionToast(state);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // A successful upload must not leave the same file armed for a second submit.
  useEffect(() => {
    if (!state.fileId) return;
    setPickedName(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [state.fileId]);

  const categoryLabel = (id: string): string =>
    categories.find((c) => c.id === id)?.label ?? id;

  const copy = async (row: AdminFileRow) => {
    const absolute = new URL(row.link, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(row.id);
      window.setTimeout(() => setCopied((current) => (current === row.id ? null : current)), 1500);
    } catch {
      // Clipboard blocked (insecure context) — the link is still visible to copy by hand.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="hud-card flex flex-col gap-4 p-5">
        <h2 className="font-display text-lg uppercase tracking-wider text-amber">{f.uploadHeading}</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label={f.categoryLabel}>
            <Select name="category" defaultValue={categories[0]?.id}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-2">
            <span className="font-display text-[11px] uppercase tracking-widest text-zinc-400">
              {f.uploadLabel}
            </span>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              className="hidden"
              onChange={(e) => setPickedName(e.target.files?.[0]?.name ?? null)}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="hud-btn !px-3 !py-1 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                {f.uploadLabel}
              </button>
              <span className="max-w-[14rem] truncate font-mono text-xs text-dim">
                {pickedName ?? f.noPreview}
              </span>
            </div>
          </div>
          <button type="submit" className="hud-btn !px-4 !py-2" disabled={pending || !pickedName}>
            {pending ? t.core.common.working : f.uploadButton}
          </button>
        </div>
        {state.url && <p className="font-mono text-xs break-all text-military">{state.url}</p>}
        <DebugError debug={state.debug} />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-dim">{f.filterLabel}</span>
        <Chip size="sm" active={!activeCategory} onClick={() => router.push("/admin/files")}>
          {f.allCategories}
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.id}
            size="sm"
            active={activeCategory === c.id}
            onClick={() => router.push(`/admin/files?category=${encodeURIComponent(c.id)}`)}
          >
            {c.label}
          </Chip>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="hud-card p-5 font-mono text-xs text-dim">{f.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="hud-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="inline-flex size-12 shrink-0 items-center justify-center overflow-hidden border border-dim/40 bg-raised">
                  {row.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.link} alt="" className="size-full object-cover" />
                  ) : (
                    <DocumentIcon className="size-5 text-dim" aria-hidden />
                  )}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-xs text-zinc-300" title={row.key}>
                    {row.key}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px] text-dim">
                    <Badge variant="neutral">{categoryLabel(row.category)}</Badge>
                    {row.visibility === "private" && <Badge variant="amber">{row.visibility}</Badge>}
                    <span>{formatBytes(row.sizeBytes)}</span>
                    {row.width && row.height ? (
                      <span>
                        {row.width}×{row.height}
                      </span>
                    ) : null}
                    <span>{row.ownerUsername ?? f.ownerSystem}</span>
                    <span>{formatDate(row.createdAt)}</span>
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="hud-btn !px-3 !py-1 text-xs"
                  onClick={() => void copy(row)}
                  title={f.copyLink}
                  aria-label={f.copyLink}
                >
                  {copied === row.id ? (
                    <CheckIcon className="size-4" aria-hidden />
                  ) : (
                    <ClipboardDocumentIcon className="size-4" aria-hidden />
                  )}
                  {copied === row.id ? f.copied : f.copyLink}
                </button>
                <form action={deleteFileAction}>
                  <input type="hidden" name="fileId" value={row.id} />
                  <ConfirmButton
                    className="hud-btn hud-btn-danger !px-3 !py-1 text-xs"
                    message={format(f.deleteConfirm, { key: row.key })}
                    aria-label={f.delete}
                  >
                    <TrashIcon className="size-4" aria-hidden />
                    {f.delete}
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
