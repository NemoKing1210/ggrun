"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  DocumentDuplicateIcon,
  LockClosedIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { canonicalJson, type EntryDoc, type EntryFacts, type ScenarioEntry } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  publishEntryAction,
  runScenariosAction,
  saveEntryDraftAction,
  setEntryArchivedAction,
  setEntryIconAction,
  type LibraryResult,
  type PublishedEntry,
} from "@/lib/modules/iee/actions/library";
import { analyzeDraft, cleanDraft, type DraftContext } from "@/lib/modules/iee/library/draft";
import { draftPlayKey, editorRun, scenarioVerdict, type EditorScenarioRun } from "@/lib/modules/iee/library/scenario-draft";
import type { EntryScreen } from "@/lib/modules/iee/library/screens";

import { BasicsBlock } from "./entry/BasicsBlock";
import { DurationBlock } from "./entry/DurationBlock";
import { EditorProvider, type EditorState } from "./entry/editor-context";
import { InteractionBlock } from "./entry/InteractionBlock";
import { LimitsBlock } from "./entry/LimitsBlock";
import { RulesBlock } from "./entry/RulesBlock";
import { SandboxBlock } from "./entry/SandboxBlock";
import { ScenariosBlock } from "./entry/ScenariosBlock";
import { SidePanel } from "./entry/SidePanel";
import { UsageBlock } from "./entry/UsageBlock";
import { CopyEntryModal } from "./PackEditor";
import { EntryStateBadge, fileForm } from "./parts";
import { useLibraryAction } from "./use-library-action";

/**
 * The entry editor (plan §6 tasks 3.2–3.4): the document as forms — no JSON —
 * with the card, the rule text, the power and the checks beside it, live.
 *
 * The draft lives here until it is saved; the server's checks on save and on
 * publish are the same functions the panel runs, so what the panel says is
 * what publishing will say.
 */
export function EntryEditor({ screen }: { screen: EntryScreen }) {
  const { t, locale } = useI18n();
  const e = t.ieeEditor.entry;
  const router = useRouter();
  const { run, pending } = useLibraryAction();
  const { confirm, dialog } = useConfirm();
  const { toast } = useToast();
  const { entry, pack } = screen;
  const readOnly = !entry.editable;

  const [doc, setDoc] = useState<EntryDoc>(screen.draft);
  const [baseline, setBaseline] = useState(() => canonicalJson(cleanDraft(screen.draft)));
  const [copying, setCopying] = useState(false);
  const cleaned = useMemo(() => cleanDraft(doc), [doc]);
  const dirty = !readOnly && canonicalJson(cleaned) !== baseline;

  const ctx = useMemo<DraftContext>(() => {
    const byId = new Map<string, EntryFacts & { published: boolean; power: number | null }>(screen.refs.map((r) => [r.entryId, r]));
    return {
      entryId: entry.id,
      published: (id) => {
        const ref = byId.get(id);
        return ref && ref.published ? ref : null;
      },
      named: (id) => byId.get(id) ?? null,
      powerOf: (id) => byId.get(id)?.power ?? null,
    };
  }, [screen.refs, entry.id]);
  const analysis = useMemo(() => analyzeDraft(doc, ctx), [doc, ctx]);

  const update = useCallback(
    (change: (doc: EntryDoc) => EntryDoc) => {
      if (!readOnly) setDoc((d) => change(d));
    },
    [readOnly],
  );

  // The scenarios' last run (spec §5.5). It plays on the server, nothing
  // saved; the verdicts are re-read against the form as it changes.
  const [scenarioRun, setScenarioRun] = useState<EditorScenarioRun | null>(null);
  const [runningScenarios, startScenarios] = useTransition();
  const runScenarios = useCallback(
    (draft: EntryDoc, quiet: boolean) => {
      startScenarios(async () => {
        const result = await runScenariosAction(entry.id, draft);
        if (result.error) {
          toast({ title: result.error, variant: "error", debug: result.debug, duration: 6500 });
          return;
        }
        setScenarioRun(result.data ? editorRun(draft, result.data) : null);
        if (!quiet && result.ok) {
          toast({ title: result.ok, variant: result.data?.ok ? "success" : "warning", duration: 4500 });
        }
      });
    },
    [entry.id, toast],
  );
  const verdicts = useMemo(() => {
    const slugs = new Map(screen.refs.map((r) => [r.entryId, r.slug]));
    const idOf = (e: ScenarioEntry) => (e === "self" ? entry.id : e.entry);
    const slugOf = (id: string) => (id === entry.id ? cleaned.slug : (slugs.get(id) ?? id));
    const docKey = draftPlayKey(cleaned);
    return (cleaned.scenarios ?? []).map((s, i) => scenarioVerdict(scenarioRun, docKey, s, i, idOf, slugOf));
  }, [cleaned, scenarioRun, screen.refs, entry.id]);

  // Opening an entry with scenarios shows where they stand.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if ((cleaned.scenarios ?? []).length > 0) runScenarios(cleaned, true);
  }, [cleaned, runScenarios]);

  const save = useCallback(() => {
    const draft = cleaned;
    run(
      () => saveEntryDraftAction(entry.id, draft),
      () => {
        setBaseline(canonicalJson(draft));
        if ((draft.scenarios ?? []).length > 0) runScenarios(draft, true);
      },
    );
  }, [cleaned, entry.id, run, runScenarios]);

  const publish = () => {
    const draft = cleaned;
    const wasDirty = dirty;
    run(async (): Promise<LibraryResult<PublishedEntry>> => {
      if (wasDirty) {
        const saved = await saveEntryDraftAction(entry.id, draft);
        if (saved.error) return { error: saved.error, debug: saved.debug };
        setBaseline(canonicalJson(draft));
      }
      const published = await publishEntryAction(entry.id);
      // Publishing ran the scenarios; the block shows what they did.
      if ((draft.scenarios ?? []).length > 0) runScenarios(draft, true);
      return published;
    });
  };

  // Ctrl/Cmd+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        if (dirty && !pending) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, pending, save]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const onIcon = (file: File | null) =>
    run(() => setEntryIconAction(file ? fileForm({ entryId: entry.id }, file) : fileForm({ entryId: entry.id, clear: "1" })));

  const state: EditorState = {
    entryId: entry.id,
    doc,
    update,
    readOnly,
    kindLocked: entry.kindLocked,
    analysis,
    refs: screen.refs,
    tags: screen.tags,
    genres: screen.genres,
    scenarios: { verdicts, running: runningScenarios, run: () => runScenarios(cleaned, false) },
  };

  const reason = pack.archived || entry.archived ? e.readOnlyArchived : e.readOnlySystem;
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {dirty && (
        <Badge variant="amber" className="animate-hud-fade">
          {t.ieeEditor.unsaved}
        </Badge>
      )}
      {!readOnly && (
        <>
          <button type="button" className="hud-btn text-xs" disabled={!dirty || pending} onClick={save}>
            {pending ? e.saving : e.save}
          </button>
          <button
            type="button"
            className="hud-btn hud-btn-primary inline-flex items-center gap-1.5 text-xs"
            disabled={pending}
            title={e.publishHint}
            onClick={publish}
          >
            <RocketLaunchIcon className="size-4" aria-hidden />
            {pending ? e.publishing : e.publish}
          </button>
        </>
      )}
    </div>
  );

  return (
    <EditorProvider value={state}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/admin/catalog?tab=pack&pack=${pack.id}`}
              className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-dim hover:text-amber"
            >
              <ArrowUturnLeftIcon className="size-3.5" aria-hidden />
              {e.back}: {pack.name[locale]}
            </Link>
            <h2 className="mt-1 font-display text-2xl uppercase leading-tight tracking-wider text-zinc-100">
              {analysis.preview.name[locale]}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-dim">{doc.slug}</span>
              <Badge variant={doc.kind === "item" ? "emerald" : "violet"}>{t.ieeEditor.kind[doc.kind]}</Badge>
              <EntryStateBadge state={entry.state} latestNumber={entry.latestNumber} />
              {entry.archived && <Badge variant="dim">{t.ieeEditor.library.archived}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="hud-btn inline-flex items-center gap-1.5 text-xs"
              disabled={screen.targets.length === 0}
              onClick={() => setCopying(true)}
            >
              <DocumentDuplicateIcon className="size-4" aria-hidden />
              {readOnly ? e.copyToPack : t.ieeEditor.pack.copy}
            </button>
            {pack.editable &&
              (entry.archived ? (
                <button
                  type="button"
                  className="hud-btn text-xs"
                  disabled={pending}
                  onClick={() => run(() => setEntryArchivedAction(entry.id, false))}
                >
                  {e.restore}
                </button>
              ) : (
                <button
                  type="button"
                  className="hud-btn inline-flex items-center gap-1.5 text-xs"
                  disabled={pending}
                  onClick={async () => {
                    const ok = await confirm({
                      message: format(t.ieeEditor.pack.archiveEntryConfirm, { name: analysis.preview.name[locale] }),
                      danger: true,
                    });
                    if (ok) run(() => setEntryArchivedAction(entry.id, true));
                  }}
                >
                  <ArchiveBoxIcon className="size-4" aria-hidden />
                  {e.archive}
                </button>
              ))}
            {actions}
          </div>
        </div>

        {readOnly && (
          <p className="flex items-start gap-2 border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <LockClosedIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {format(e.readOnly, { reason })}
          </p>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <BasicsBlock art={entry.art} onIcon={onIcon} iconBusy={pending} />
            {doc.kind === "item" && <UsageBlock />}
            <RulesBlock />
            {doc.kind === "effect" && <DurationBlock />}
            <LimitsBlock />
            <InteractionBlock referencedBy={screen.referencedBy} />
            <ScenariosBlock />
            <SandboxBlock />
          </div>
          <aside className="flex flex-col gap-4 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            {!readOnly && <div className="hud-card flex justify-end p-3">{actions}</div>}
            <SidePanel art={entry.art} revisions={screen.revisions} seasons={screen.seasons} />
          </aside>
        </div>
      </div>

      <CopyEntryModal
        entry={copying ? { id: entry.id, slug: entry.slug, name: analysis.preview.name } : null}
        packs={screen.targets}
        defaultPack={screen.targets.find((p) => p.id === pack.id)?.id ?? screen.targets[0]?.id ?? null}
        onClose={() => setCopying(false)}
        onCopied={(entryId) => router.push(`/admin/catalog?tab=entry&entry=${entryId}`)}
      />
      {dialog}
    </EditorProvider>
  );
}
