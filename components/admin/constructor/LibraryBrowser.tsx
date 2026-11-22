"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownTrayIcon, LockClosedIcon, PlusIcon } from "@heroicons/react/24/outline";

import { IeeFilterBar, type ChipGroup } from "@/components/admin/IeeFilterBar";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { SLUG_RE } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { createPackAction, importPackAction, type LibraryResult } from "@/lib/modules/iee/actions/library";
import type { ImportReport } from "@/lib/modules/iee/library/transfer";
import type { EntrySummary, PackSummary } from "@/lib/modules/iee/library/screens";

import { EntryStateBadge, PackTile, fileForm } from "./parts";
import { useLibraryAction } from "./use-library-action";

const RARITIES = ["common", "rare", "epic", "legendary"] as const;
const rarityVariant = (r: string) => (r === "legendary" ? "amber" : r === "epic" ? "violet" : r === "rare" ? "sky" : "dim");

/**
 * The library screen (plan §6 task 3.1): every pack, every entry, and the
 * two ways in — a new pack, or a `.ggpack` file. A pack opens the pack
 * screen, an entry the editor.
 */
export function LibraryBrowser({ packs, entries }: { packs: readonly PackSummary[]; entries: readonly EntrySummary[] }) {
  const { t, locale } = useI18n();
  const e = t.ieeEditor;
  const l = e.library;

  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [character, setCharacter] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [state, setState] = useState("all");
  const [pack, setPack] = useState("all");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const packName = useMemo(() => new Map(packs.map((p) => [p.id, p.name[locale]])), [packs, locale]);
  const visiblePacks = packs.filter((p) => showArchived || !p.archived);
  const pool = entries.filter((x) => showArchived || (!x.archived && !packs.find((p) => p.id === x.packId)?.archived));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter(
      (x) =>
        (kind === "all" || x.kind === kind) &&
        (character === "all" || x.character === character) &&
        (rarity === "all" || x.rarity === rarity) &&
        (state === "all" || x.state === state) &&
        (pack === "all" || x.packId === pack) &&
        (q === "" ||
          x.slug.includes(q) ||
          x.name[locale].toLowerCase().includes(q) ||
          x.ruleText[locale].toLowerCase().includes(q)),
    );
  }, [pool, query, kind, character, rarity, state, pack, locale]);

  const groups: ChipGroup[] = [
    {
      id: "kind",
      label: l.filters.kind,
      value: kind,
      onChange: setKind,
      options: [
        { value: "item", label: e.kind.item },
        { value: "effect", label: e.kind.effect },
      ],
    },
    {
      id: "character",
      label: l.filters.character,
      value: character,
      onChange: setCharacter,
      options: [
        { value: "bonus", label: e.character.bonus },
        { value: "penalty", label: e.character.penalty },
      ],
    },
    {
      id: "rarity",
      label: l.filters.rarity,
      value: rarity,
      onChange: setRarity,
      options: RARITIES.map((r) => ({ value: r, label: t.iee.rarity[r] })),
    },
    {
      id: "state",
      label: l.filters.state,
      value: state,
      onChange: setState,
      options: (["new", "changed", "published"] as const).map((v) => ({ value: v, label: l.stateFilter[v] })),
    },
    ...(visiblePacks.length > 1
      ? [
          {
            id: "pack",
            label: l.filters.pack,
            value: pack,
            onChange: setPack,
            options: visiblePacks.map((p) => ({ value: p.id, label: p.name[locale] })),
          },
        ]
      : []),
  ];

  const reset = () => {
    setQuery("");
    setKind("all");
    setCharacter("all");
    setRarity("all");
    setState("all");
    setPack("all");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{l.hint}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="hud-btn inline-flex items-center gap-1.5 text-xs" onClick={() => setImporting(true)}>
            <ArrowDownTrayIcon className="size-4" aria-hidden />
            {l.import}
          </button>
          <button
            type="button"
            className="hud-btn hud-btn-primary inline-flex items-center gap-1.5 text-xs"
            onClick={() => setCreating(true)}
          >
            <PlusIcon className="size-4" aria-hidden />
            {l.newPack}
          </button>
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">{l.packs}</h2>
          <Switch size="sm" checked={showArchived} onChange={setShowArchived} label={l.showArchived} />
        </div>
        {visiblePacks.length === 0 ? (
          <div className="hud-card p-6 text-center font-mono text-sm uppercase tracking-widest text-dim">{l.noPacks}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visiblePacks.map((p) => (
              <PackCard key={p.id} pack={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-amber">{l.entries}</h2>
        <IeeFilterBar query={query} onQuery={setQuery} groups={groups} shown={shown.length} total={pool.length} onReset={reset} />
        {shown.length === 0 ? (
          <div className="hud-card p-6 text-center font-mono text-sm uppercase tracking-widest text-dim">{l.noEntries}</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shown.map((x) => (
              <li key={x.id}>
                <EntryRow entry={x} packLabel={visiblePacks.length > 1 ? packName.get(x.packId) : undefined} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewPackModal open={creating} onClose={() => setCreating(false)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function PackCard({ pack }: { pack: PackSummary }) {
  const { t, locale } = useI18n();
  const l = t.ieeEditor.library;
  const c = pack.counts;
  return (
    <Link
      href={`/admin/catalog?tab=pack&pack=${pack.id}`}
      className={`hud-card hud-lift flex items-start gap-3 p-4 ${pack.archived ? "opacity-60" : ""}`}
    >
      <PackTile iconUrl={pack.iconUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg uppercase leading-tight tracking-wider text-zinc-100">{pack.name[locale]}</h3>
        <p className="font-mono text-[11px] text-dim">{pack.slug}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {pack.system && <Badge variant="amber">{l.system}</Badge>}
          {!pack.editable && !pack.archived && (
            <Badge variant="dim">
              <LockClosedIcon className="mr-1 size-3" aria-hidden />
              {l.readOnly}
            </Badge>
          )}
          {pack.visibility === "draft" && <Badge variant="dim">{l.hidden}</Badge>}
          {pack.archived && <Badge variant="dim">{l.archived}</Badge>}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] uppercase tracking-widest text-zinc-400">
          <span>{format(l.entryCount, { count: String(c.entries) })}</span>
          {c.changed > 0 && <span className="text-amber">{format(l.changedCount, { count: String(c.changed) })}</span>}
          {c.unpublished > 0 && <span>{format(l.unpublishedCount, { count: String(c.unpublished) })}</span>}
          {c.withErrors > 0 && <span className="text-danger">{format(l.errorCount, { count: String(c.withErrors) })}</span>}
        </p>
        {pack.dependencies.length > 0 && (
          <p className="mt-1 text-xs text-zinc-500">
            {l.uses}: {pack.dependencies.map((d) => d.name[locale]).join(", ")}
          </p>
        )}
      </div>
    </Link>
  );
}

function EntryRow({ entry, packLabel }: { entry: EntrySummary; packLabel?: string }) {
  const { t, locale } = useI18n();
  const e = t.ieeEditor;
  return (
    <Link
      href={`/admin/catalog?tab=entry&entry=${entry.id}`}
      className={`flex items-start gap-3 border border-[#3d3d34] bg-[#1a1a1a] p-2.5 transition-colors hover:border-amber/50 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
        entry.archived ? "opacity-60" : ""
      }`}
    >
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
          <span className="font-display text-sm uppercase tracking-wider text-zinc-100">{entry.name[locale]}</span>
          <span className="font-mono text-[11px] text-dim">{entry.slug}</span>
        </div>
        <EntryDescription tone="dense" className="!mt-0.5 line-clamp-2">
          {entry.ruleText[locale]}
        </EntryDescription>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        <Badge variant={entry.kind === "item" ? "emerald" : "violet"}>{e.kind[entry.kind]}</Badge>
        <Badge variant={entry.character === "bonus" ? "military" : "danger"}>{e.character[entry.character]}</Badge>
        <Badge variant={rarityVariant(entry.rarity)}>{t.iee.rarity[entry.rarity]}</Badge>
        {packLabel && <Badge variant="dim">{packLabel}</Badge>}
        <EntryStateBadge state={entry.state} latestNumber={entry.latestNumber} />
        {entry.errors > 0 && <Badge variant="danger">{format(e.library.errors, { count: String(entry.errors) })}</Badge>}
        {entry.archived && <Badge variant="dim">{e.library.archived}</Badge>}
      </div>
    </Link>
  );
}

function NewPackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const n = t.ieeEditor.newPack;
  const router = useRouter();
  const { run, pending } = useLibraryAction();
  const [slug, setSlug] = useState("");
  const [names, setNames] = useState({ ru: "", en: "", uk: "" });
  const slugOk = SLUG_RE.test(slug);
  const ready = slugOk && names.ru.trim() !== "";

  const submit = () => {
    if (!ready) return;
    const localized = {
      ru: names.ru.trim(),
      ...(names.en.trim() ? { en: names.en.trim() } : {}),
      ...(names.uk.trim() ? { uk: names.uk.trim() } : {}),
    };
    run(
      () => createPackAction({ slug, names: localized }),
      (data) => {
        onClose();
        setSlug("");
        setNames({ ru: "", en: "", uk: "" });
        if (data) router.push(`/admin/catalog?tab=pack&pack=${data.packId}`);
      },
      { refresh: false },
    );
  };

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-lg">
      <h3 className="font-display text-lg uppercase tracking-widest">{n.title}</h3>
      <div className="hazard-tape mt-3 opacity-60" aria-hidden />
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <Field label={n.slug} hint={n.slugHint} error={slug && !slugOk ? t.core.errors.ieeSlugInvalid : undefined}>
          <Input value={slug} onChange={(ev) => setSlug(ev.target.value.trim())} className="font-mono" autoFocus />
        </Field>
        <Field label={n.name} hint={n.nameHint}>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["ru", "en", "uk"] as const).map((loc) => (
              <Input
                key={loc}
                value={names[loc]}
                placeholder={t.ieeEditor.locales[loc]}
                aria-label={`${n.name} ${t.ieeEditor.locales[loc]}`}
                onChange={(ev) => setNames({ ...names, [loc]: ev.target.value })}
              />
            ))}
          </div>
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="hud-btn text-xs" onClick={onClose}>
            {t.ieeEditor.cancel}
          </button>
          <button type="submit" className="hud-btn hud-btn-primary text-xs" disabled={!ready || pending}>
            {n.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const m = t.ieeEditor.importPack;
  const { run, pending } = useLibraryAction();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const close = () => {
    setFile(null);
    setReport(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} panelClassName="max-w-lg">
      <h3 className="font-display text-lg uppercase tracking-widest">{report ? format(m.reportTitle, { slug: report.pack.slug }) : m.title}</h3>
      <div className="hazard-tape mt-3 opacity-60" aria-hidden />
      {report ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">{m.packState[report.pack.state]}</p>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
            {report.entries.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 border-b border-[#2a2a22] pb-1">
                <span className="font-mono text-xs text-zinc-300">{x.slug}</span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
                  {m.entryState[x.state]}
                  {x.revisionsAdded > 0 ? ` · ${format(m.revisionsAdded, { count: String(x.revisionsAdded) })}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {report.draftsKept.length > 0 && (
            <p className="text-xs text-amber">{format(m.draftsKept, { slugs: report.draftsKept.join(", ") })}</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="hud-btn text-xs" onClick={close}>
              {t.ieeEditor.close}
            </button>
            <Link href={`/admin/catalog?tab=pack&pack=${report.pack.id}`} className="hud-btn hud-btn-primary text-xs" onClick={close}>
              {m.openPack}
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!file) return;
            run(
              (): Promise<LibraryResult<ImportReport>> => importPackAction(fileForm({}, file)),
              (data) => setReport(data ?? null),
            );
          }}
        >
          <p className="text-sm leading-relaxed text-zinc-400">{m.hint}</p>
          <Field label={m.file}>
            <input
              type="file"
              accept=".ggpack,application/zip"
              className="text-sm text-zinc-300 file:mr-3 file:border file:border-[#55554a] file:bg-[#33332b] file:px-3 file:py-1.5 file:font-display file:text-xs file:uppercase file:tracking-widest file:text-zinc-200"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="hud-btn text-xs" onClick={close}>
              {t.ieeEditor.cancel}
            </button>
            <button type="submit" className="hud-btn hud-btn-primary text-xs" disabled={!file || pending}>
              {m.submit}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
