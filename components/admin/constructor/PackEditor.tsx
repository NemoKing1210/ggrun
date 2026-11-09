"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveBoxIcon,
  ArrowUpOnSquareIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PlusIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";

import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useConfirm } from "@/components/ui/useConfirm";
import { SLUG_RE } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  copyEntryAction,
  createEntryAction,
  exportPackAction,
  publishPackAction,
  setEntryArchivedAction,
  setPackArchivedAction,
  setPackIconAction,
  updatePackAction,
} from "@/lib/modules/iee/actions/library";
import type { EntrySummary, PackScreen, PackSummary } from "@/lib/modules/iee/library/screens";

import { issueText } from "./issue-text";
import { Block, EntryStateBadge, GroupLabel, IconUpload, PackTile, fileForm } from "./parts";
import { downloadBase64, useLibraryAction } from "./use-library-action";

const LOCALES = ["ru", "en", "uk"] as const;
type Texts = Record<(typeof LOCALES)[number], string>;

const textsOf = (value: { ru: string; en?: string; uk?: string } | null): Texts => ({
  ru: value?.ru ?? "",
  en: value?.en ?? "",
  uk: value?.uk ?? "",
});

/** `{ ru, en?, uk? }` from three inputs; null when all are empty. */
function localized(texts: Texts): { ru: string; en?: string; uk?: string } | null {
  const ru = texts.ru.trim();
  const en = texts.en.trim();
  const uk = texts.uk.trim();
  if (!ru && !en && !uk) return null;
  return { ru, ...(en ? { en } : {}), ...(uk ? { uk } : {}) };
}

/**
 * The pack screen (plan §6 tasks 3.1, 3.4): what the pack is, its entries and
 * their revisions, what publishing would do, and the ways out — publish,
 * export, attach to a season.
 */
export function PackEditor({ screen }: { screen: PackScreen }) {
  const { t, locale } = useI18n();
  const p = t.ieeEditor.pack;
  const { pack } = screen;
  const router = useRouter();
  const { run, pending } = useLibraryAction();
  const { confirm, dialog } = useConfirm();
  const [history, setHistory] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState<EntrySummary | null>(null);

  const active = screen.entries.filter((e) => !e.archived);
  const archived = screen.entries.filter((e) => e.archived);
  const ready = screen.publish.filter((x) => x.state === "ready");
  const blocked = screen.publish.filter((x) => x.state === "blocked");
  const nameOf = (entryId: string) => screen.entries.find((e) => e.id === entryId)?.name[locale] ?? entryId;

  const archivePack = async () => {
    const ok = await confirm({ message: format(p.archiveConfirm, { name: pack.name[locale] }), danger: true });
    if (ok) run(() => setPackArchivedAction(pack.id, true));
  };

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/catalog?tab=library"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-dim hover:text-amber"
      >
        <ArrowUturnLeftIcon className="size-3.5" aria-hidden />
        {p.back}
      </Link>

      {pack.system && !pack.editable && <Notice icon={LockClosedIcon}>{p.readOnlyNotice}</Notice>}
      {pack.archived && <Notice icon={ArchiveBoxIcon}>{p.archivedNotice}</Notice>}

      <section className="hud-card flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-4">
          {pack.editable ? (
            <IconUpload
              preview={<PackTile iconUrl={pack.iconUrl} size="lg" />}
              hasIcon={pack.iconUrl !== null}
              uploadLabel={p.upload}
              clearLabel={p.clearIcon}
              disabled={pending}
              onUpload={(file) => run(() => setPackIconAction(fileForm({ packId: pack.id }, file)))}
              onClear={() => run(() => setPackIconAction(fileForm({ packId: pack.id, clear: "1" })))}
            />
          ) : (
            <PackTile iconUrl={pack.iconUrl} size="lg" />
          )}
          <div className="min-w-0">
            <h2 className="font-display text-2xl uppercase leading-tight tracking-wider text-zinc-100">{pack.name[locale]}</h2>
            <p className="font-mono text-xs text-dim">{pack.slug}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pack.system && <Badge variant="amber">{t.ieeEditor.library.system}</Badge>}
              {pack.visibility === "draft" && <Badge variant="dim">{t.ieeEditor.library.hidden}</Badge>}
              {pack.archived && <Badge variant="dim">{t.ieeEditor.library.archived}</Badge>}
            </div>
            {pack.description && <EntryDescription tone="dense">{pack.description[locale]}</EntryDescription>}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="hud-btn hud-btn-primary inline-flex items-center gap-1.5 text-xs"
              disabled={!pack.editable || ready.length === 0 || pending}
              title={p.publishHint}
              onClick={() => run(() => publishPackAction(pack.id))}
            >
              <RocketLaunchIcon className="size-4" aria-hidden />
              {p.publish}
            </button>
            <button
              type="button"
              className="hud-btn inline-flex items-center gap-1.5 text-xs"
              disabled={pending}
              title={p.exportHint}
              onClick={() =>
                run(
                  () => exportPackAction(pack.id, history),
                  (data) => {
                    if (data) downloadBase64(data.fileName, data.base64);
                  },
                  { refresh: false },
                )
              }
            >
              <ArrowUpOnSquareIcon className="size-4" aria-hidden />
              {p.export}
            </button>
            {!pack.system &&
              (pack.archived ? (
                <button
                  type="button"
                  className="hud-btn inline-flex items-center gap-1.5 text-xs"
                  disabled={pending}
                  onClick={() => run(() => setPackArchivedAction(pack.id, false))}
                >
                  {p.restore}
                </button>
              ) : (
                <button
                  type="button"
                  className="hud-btn hud-btn-danger inline-flex items-center gap-1.5 text-xs"
                  disabled={pending}
                  onClick={archivePack}
                >
                  <ArchiveBoxIcon className="size-4" aria-hidden />
                  {p.archive}
                </button>
              ))}
          </div>
          <Switch size="sm" checked={history} onChange={setHistory} label={p.exportHistory} />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Block
            id="pack-entries"
            title={p.entries}
            right={
              pack.editable && (
                <button
                  type="button"
                  className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1 text-[11px]"
                  onClick={() => setCreating(true)}
                >
                  <PlusIcon className="size-3.5" aria-hidden />
                  {p.newEntry}
                </button>
              )
            }
          >
            {active.length === 0 ? (
              <p className="text-sm text-dim">{p.empty}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {active.map((e) => (
                  <EntryLine
                    key={e.id}
                    entry={e}
                    editable={pack.editable}
                    onCopy={() => setCopying(e)}
                    onArchive={async () => {
                      const ok = await confirm({
                        message: format(p.archiveEntryConfirm, { name: e.name[locale] }),
                        danger: true,
                      });
                      if (ok) run(() => setEntryArchivedAction(e.id, true));
                    }}
                  />
                ))}
              </ul>
            )}
            {archived.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-widest text-dim hover:text-amber">
                  {p.archivedEntries} ({archived.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {archived.map((e) => (
                    <EntryLine
                      key={e.id}
                      entry={e}
                      editable={pack.editable}
                      onCopy={() => setCopying(e)}
                      onRestore={() => run(() => setEntryArchivedAction(e.id, false))}
                    />
                  ))}
                </ul>
              </details>
            )}
          </Block>

          <Block id="pack-publish" title={p.publish} errors={blocked.length}>
            <p className="mb-3 text-xs leading-relaxed text-zinc-500">{p.publishHint}</p>
            {screen.publish.length === 0 ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-military">
                <CheckCircleIcon className="size-4" aria-hidden />
                {p.nothingToPublish}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {ready.length > 0 && (
                  <div>
                    <GroupLabel>{p.ready}</GroupLabel>
                    <ul className="flex flex-col gap-1">
                      {ready.map((x) => (
                        <li key={x.entryId} className="text-sm">
                          <Link href={`/admin/catalog?tab=entry&entry=${x.entryId}`} className="text-zinc-200 hover:text-amber">
                            {nameOf(x.entryId)}
                          </Link>
                          {x.warnings.length > 0 && (
                            <span className="ml-2 font-mono text-[11px] text-amber">
                              {format(t.ieeEditor.library.warnings, { count: String(x.warnings.length) })}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {blocked.length > 0 && (
                  <div>
                    <GroupLabel>{p.blockedTitle}</GroupLabel>
                    <ul className="flex flex-col gap-2">
                      {blocked.map((x) => (
                        <li key={x.entryId} className="text-sm">
                          <Link href={`/admin/catalog?tab=entry&entry=${x.entryId}`} className="text-zinc-200 hover:text-amber">
                            {nameOf(x.entryId)}
                          </Link>
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {x.errors.slice(0, 4).map((issue, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-danger">
                                <ExclamationTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                                {issueText(issue, t)}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Block>
        </div>

        <div className="flex flex-col gap-4">
          <PackMetaForm key={pack.id + pack.slug} pack={pack} />

          <Block id="pack-attach" title={p.attach}>
            <AttachToSeason screen={screen} />
          </Block>

          <Block id="pack-deps" title={p.dependencies}>
            <PackList packs={pack.dependencies} />
            <div className="mt-3">
              <GroupLabel>{p.dependents}</GroupLabel>
              <PackList packs={pack.dependents} />
            </div>
          </Block>
        </div>
      </div>

      <NewEntryModal
        open={creating}
        packId={pack.id}
        onClose={() => setCreating(false)}
        onCreated={(entryId) => router.push(`/admin/catalog?tab=entry&entry=${entryId}`)}
      />
      <CopyEntryModal
        entry={copying}
        packs={screen.targets}
        defaultPack={pack.editable ? pack.id : (screen.targets[0]?.id ?? null)}
        onClose={() => setCopying(null)}
        onCopied={(entryId) => router.push(`/admin/catalog?tab=entry&entry=${entryId}`)}
      />
      {dialog}
    </div>
  );
}

function Notice({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function PackList({ packs }: { packs: readonly { id: string; slug: string; name: Record<"ru" | "en" | "uk", string> }[] }) {
  const { t, locale } = useI18n();
  if (packs.length === 0) return <p className="text-sm text-dim">{t.ieeEditor.none}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {packs.map((d) => (
        <li key={d.id}>
          <Link href={`/admin/catalog?tab=pack&pack=${d.id}`} className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]">
            <LinkIcon className="size-3" aria-hidden />
            {d.name[locale]}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EntryLine({
  entry,
  editable,
  onCopy,
  onArchive,
  onRestore,
}: {
  entry: PackScreen["entries"][number];
  editable: boolean;
  onCopy: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const { t, locale } = useI18n();
  const p = t.ieeEditor.pack;
  return (
    <li className="flex flex-wrap items-center gap-3 border border-[#3d3d34] bg-[#1a1a1a] p-2.5 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
      <IeeArtTile
        entryKey={entry.slug}
        kind={entry.kind}
        glyph={entry.glyph}
        art={entry.art}
        polarity={entry.character === "bonus" ? "positive" : "negative"}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/admin/catalog?tab=entry&entry=${entry.id}`}
            className="font-display text-sm uppercase tracking-wider text-zinc-100 hover:text-amber"
          >
            {entry.name[locale]}
          </Link>
          <span className="font-mono text-[11px] text-dim">{entry.slug}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant={entry.kind === "item" ? "emerald" : "violet"}>{t.ieeEditor.kind[entry.kind]}</Badge>
          <EntryStateBadge state={entry.state} latestNumber={entry.latestNumber} />
          {entry.errors > 0 && <Badge variant="danger">{format(t.ieeEditor.library.errors, { count: String(entry.errors) })}</Badge>}
          {entry.seasons > 0 && (
            <span className="font-mono text-[11px] text-amber">
              {format(t.ieeEditor.library.inSeasons, { count: String(entry.seasons) })}
            </span>
          )}
          {entry.revisions.length > 0 && (
            <span className="font-mono text-[11px] text-dim" title={entry.revisions.map((r) => `r${r.number} ${r.hash}`).join("\n")}>
              {p.revisions}: {entry.revisions.map((r) => `r${r.number}`).join(" · ")}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <Link
          href={`/admin/catalog?tab=entry&entry=${entry.id}`}
          className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]"
        >
          <PencilSquareIcon className="size-3.5" aria-hidden />
          {p.edit}
        </Link>
        <button type="button" className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]" onClick={onCopy}>
          <DocumentDuplicateIcon className="size-3.5" aria-hidden />
          {p.copy}
        </button>
        {editable && onArchive && (
          <button type="button" className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]" onClick={onArchive}>
            <ArchiveBoxIcon className="size-3.5" aria-hidden />
            {p.archiveEntry}
          </button>
        )}
        {editable && onRestore && (
          <button type="button" className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]" onClick={onRestore}>
            {p.restoreEntry}
          </button>
        )}
      </div>
    </li>
  );
}

function PackMetaForm({ pack }: { pack: PackSummary }) {
  const { t } = useI18n();
  const p = t.ieeEditor.pack;
  const { run, pending } = useLibraryAction();
  const [slug, setSlug] = useState(pack.slug);
  const [names, setNames] = useState<Texts>(textsOf(pack.names));
  const [description, setDescription] = useState<Texts>(textsOf(pack.descriptionText));
  const [defaultLocale, setDefaultLocale] = useState(pack.defaultLocale);
  const [visible, setVisible] = useState(pack.visibility === "library");
  const disabled = !pack.editable || pending;
  const slugOk = SLUG_RE.test(slug);
  const ready = slugOk && names.ru.trim() !== "";

  return (
    <Block id="pack-meta" title={p.metaTitle}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!ready) return;
          // Only what changed — the audit row lists the fields a save touched.
          const next = {
            slug,
            names: localized(names)!,
            description: localized(description),
            defaultLocale,
            visibility: visible ? ("library" as const) : ("draft" as const),
          };
          const before = {
            slug: pack.slug,
            names: localized(textsOf(pack.names)),
            description: localized(textsOf(pack.descriptionText)),
            defaultLocale: pack.defaultLocale,
            visibility: pack.visibility,
          };
          const patch = Object.fromEntries(
            Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])),
          );
          if (Object.keys(patch).length === 0) return;
          run(() => updatePackAction(pack.id, patch));
        }}
      >
        <Field label={p.slug} error={slug && !slugOk ? t.core.errors.ieeSlugInvalid : undefined}>
          <Input value={slug} disabled={disabled} className="font-mono" onChange={(ev) => setSlug(ev.target.value.trim())} />
        </Field>
        <Field label={p.names} hint={t.ieeEditor.newPack.nameHint}>
          <div className="flex flex-col gap-1.5">
            {LOCALES.map((loc) => (
              <Input
                key={loc}
                value={names[loc]}
                disabled={disabled}
                placeholder={t.ieeEditor.locales[loc]}
                aria-label={`${p.names} ${t.ieeEditor.locales[loc]}`}
                onChange={(ev) => setNames({ ...names, [loc]: ev.target.value })}
              />
            ))}
          </div>
        </Field>
        <Field label={p.description}>
          <div className="flex flex-col gap-1.5">
            {LOCALES.map((loc) => (
              <Textarea
                key={loc}
                rows={2}
                value={description[loc]}
                disabled={disabled}
                placeholder={t.ieeEditor.locales[loc]}
                aria-label={`${p.description} ${t.ieeEditor.locales[loc]}`}
                onChange={(ev) => setDescription({ ...description, [loc]: ev.target.value })}
              />
            ))}
          </div>
        </Field>
        <Field label={p.defaultLocale} hint={p.defaultLocaleHint}>
          <Select value={defaultLocale} disabled={disabled} onChange={(ev) => setDefaultLocale(ev.target.value as typeof defaultLocale)}>
            {LOCALES.map((loc) => (
              <option key={loc} value={loc}>
                {t.ieeEditor.locales[loc]}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <Switch checked={visible} disabled={disabled} onChange={setVisible} label={p.visibility} />
          <p className="mt-1 text-xs text-zinc-500">{p.visibilityHint}</p>
        </div>
        {pack.editable && (
          <button type="submit" className="hud-btn hud-btn-primary self-end text-xs" disabled={!ready || pending}>
            {p.save}
          </button>
        )}
      </form>
    </Block>
  );
}

function AttachToSeason({ screen }: { screen: PackScreen }) {
  const { t } = useI18n();
  const p = t.ieeEditor.pack;
  const [season, setSeason] = useState("");
  if (screen.pack.visibility === "draft" || screen.pack.archived) {
    return <p className="text-xs leading-relaxed text-amber">{screen.pack.archived ? p.archivedNotice : p.attachHidden}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-zinc-500">{p.attachHint}</p>
      <Select value={season} onChange={(ev) => setSeason(ev.target.value)} aria-label={p.chooseSeason}>
        <option value="">{p.chooseSeason}</option>
        {screen.seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title} · {t.core.seasonStatuses[s.status]}
            {s.attached > 0 ? ` · ${format(p.attachedIn, { count: String(s.attached) })}` : ""}
          </option>
        ))}
      </Select>
      {season ? (
        <Link
          href={`/admin/seasons/${season}?stage=iee&pack=${screen.pack.id}`}
          className="hud-btn hud-btn-primary self-end text-xs"
        >
          {p.openWizard}
        </Link>
      ) : (
        <span className="hud-btn hud-btn-primary self-end text-xs opacity-45" aria-disabled="true">
          {p.openWizard}
        </span>
      )}
    </div>
  );
}

function NewEntryModal({
  open,
  packId,
  onClose,
  onCreated,
}: {
  open: boolean;
  packId: string;
  onClose: () => void;
  onCreated: (entryId: string) => void;
}) {
  const { t } = useI18n();
  const p = t.ieeEditor.pack;
  const { run, pending } = useLibraryAction();
  const [kind, setKind] = useState<"item" | "effect">("effect");
  const [slug, setSlug] = useState("");
  const slugOk = SLUG_RE.test(slug);

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-md">
      <h3 className="font-display text-lg uppercase tracking-widest">{p.newEntryTitle}</h3>
      <div className="hazard-tape mt-3 opacity-60" aria-hidden />
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!slugOk) return;
          run(
            () => createEntryAction({ packId, slug, kind }),
            (data) => {
              onClose();
              setSlug("");
              if (data) onCreated(data.entryId);
            },
            { refresh: false },
          );
        }}
      >
        <div>
          <GroupLabel>{t.ieeEditor.entry.basics.kind}</GroupLabel>
          <div className="flex gap-1.5">
            {(["item", "effect"] as const).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {t.ieeEditor.kind[k]}
              </Chip>
            ))}
          </div>
        </div>
        <Field label={p.entrySlug} hint={p.entrySlugHint} error={slug && !slugOk ? t.core.errors.ieeSlugInvalid : undefined}>
          <Input value={slug} className="font-mono" autoFocus onChange={(ev) => setSlug(ev.target.value.trim())} />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="hud-btn text-xs" onClick={onClose}>
            {t.ieeEditor.cancel}
          </button>
          <button type="submit" className="hud-btn hud-btn-primary text-xs" disabled={!slugOk || pending}>
            {p.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Copies an entry into a pack that may be changed — the way to adapt a `core` entry (§10.2). */
export function CopyEntryModal({
  entry,
  defaultPack,
  onClose,
  onCopied,
  packs,
}: {
  entry: { id: string; slug: string; name: Record<"ru" | "en" | "uk", string> } | null;
  defaultPack: string | null;
  onClose: () => void;
  onCopied: (entryId: string) => void;
  /** Packs that may be copied into. */
  packs: readonly { id: string; name: Record<"ru" | "en" | "uk", string> }[];
}) {
  const { t, locale } = useI18n();
  const p = t.ieeEditor.pack;
  const { run, pending } = useLibraryAction();
  const [packId, setPackId] = useState(defaultPack ?? packs[0]?.id ?? "");
  const [slug, setSlug] = useState("");
  const slugOk = SLUG_RE.test(slug);
  const open = entry !== null;

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-md">
      <h3 className="font-display text-lg uppercase tracking-widest">
        {entry ? format(p.copyTitle, { name: entry.name[locale] }) : ""}
      </h3>
      <div className="hazard-tape mt-3 opacity-60" aria-hidden />
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!entry || !slugOk || !packId) return;
          run(
            () => copyEntryAction(entry.id, { packId, slug }),
            (data) => {
              onClose();
              setSlug("");
              if (data) onCopied(data.entryId);
            },
            { refresh: false },
          );
        }}
      >
        <p className="text-sm leading-relaxed text-zinc-400">{p.copyHint}</p>
        <Field label={p.copyTarget}>
          <Select value={packId} onChange={(ev) => setPackId(ev.target.value)}>
            {packs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name[locale]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={p.entrySlug} hint={p.entrySlugHint} error={slug && !slugOk ? t.core.errors.ieeSlugInvalid : undefined}>
          <Input
            value={slug}
            className="font-mono"
            placeholder={entry ? `${entry.slug}_copy` : ""}
            onChange={(ev) => setSlug(ev.target.value.trim())}
          />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="hud-btn text-xs" onClick={onClose}>
            {t.ieeEditor.cancel}
          </button>
          <button type="submit" className="hud-btn hud-btn-primary text-xs" disabled={!slugOk || !packId || pending}>
            {p.copySubmit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
