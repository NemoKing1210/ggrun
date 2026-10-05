import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FolderIcon } from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { listFilesWithOwner } from "@/lib/modules/files/repository";
import { FILE_CATEGORY_IDS, fileAccessUrl, isFileCategoryId } from "@/lib/modules/files/service";
import { FilesManager, type AdminFileRow } from "@/components/admin/FilesManager";

/** Rows shown per visit; the browser is a curation tool, not an archive viewer. */
const PAGE_SIZE = 100;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.files.heading} — GGRun` };
}

/**
 * Admin file browser: upload, filter, inspect and delete stored files.
 *
 * Every link handed to the client is one that works *now* — a public URL for a
 * public file, a signed one for a private file — so "copy link" always yields
 * something the recipient can open.
 */
export default async function AdminFilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();
  const f = t.admin.files;

  const sp = await searchParams;
  const rawCategory = typeof sp.category === "string" ? sp.category : "";
  const activeCategory = isFileCategoryId(rawCategory) ? rawCategory : null;

  const files = await listFilesWithOwner({
    category: activeCategory ?? undefined,
    limit: PAGE_SIZE,
  });

  const rows: AdminFileRow[] = await Promise.all(
    files.map(async (file) => ({
      id: file.id,
      key: file.key,
      category: file.category,
      link: await fileAccessUrl(file, { expiresIn: 60 * 60 }),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      visibility: file.visibility,
      ownerUsername: file.ownerUsername,
      createdAt: file.createdAt.toISOString(),
    })),
  );

  const categories = FILE_CATEGORY_IDS.map((id) => ({ id, label: f.categories[id] }));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="inline-flex items-center gap-3 font-display text-3xl uppercase tracking-widest text-amber">
            <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <FolderIcon className="size-5" aria-hidden />
            </span>
            {f.heading}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{f.kicker}</p>
          <p className="mt-2 max-w-3xl text-sm text-dim">{f.intro}</p>
        </div>
        <span className="inline-flex items-center border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs uppercase tracking-widest text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          {rows.length}
        </span>
      </section>
      <div className="hazard-tape" aria-hidden />

      <FilesManager rows={rows} categories={categories} activeCategory={activeCategory} />
    </div>
  );
}
