"use server";

/**
 * The constructor's server actions (plan §6): thin adapters from the forms to
 * the library's use cases, which check the admin, audit and validate. Each
 * returns an `ActionState` with a translated message and, where the screen
 * needs it, the result.
 */
import { revalidatePath } from "next/cache";

import type { Issue } from "@/lib/engine/iee/dsl";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import { FileError } from "@/lib/modules/files/service/errors";
import { AdminError } from "@/lib/modules/season/service/errors";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { SandboxOutcome } from "@/lib/modules/iee/sim/sandbox";
import type { ScenarioRun } from "@/lib/modules/iee/sim/scenarios";

import {
  copyEntry,
  createEntry,
  createPack,
  exportPack,
  importPack,
  publishEntry,
  publishPack,
  runDraftSandbox,
  runDraftScenarios,
  saveDraft,
  setEntryArchived,
  setEntryIcon,
  setPackArchived,
  setPackIcon,
  updatePack,
  type CopyEntryInput,
  type EntryInput,
  type ImportReport,
  type PackInput,
  type PackPatchInput,
  type SandboxRequest,
  type PublishIssue,
  type PublishState,
} from "../library";

const toError = makeToError(AdminError, FileError);

const CATALOG_PATH = "/admin/catalog";

/** An action's outcome, with what the screen needs from it. */
export type LibraryResult<T = undefined> = ActionState & { data?: T };

async function run<T>(
  name: string,
  work: () => Promise<T>,
  message: (t: Dictionary, data: T) => string,
): Promise<LibraryResult<T>> {
  try {
    const data = await work();
    revalidatePath(CATALOG_PATH);
    const { t } = await getT();
    return { ok: message(t, data), data };
  } catch (e) {
    return await toError(e, `iee.library.${name}`, { actorId: (await getCurrentUser())?.id ?? null });
  }
}

/** The bytes of an uploaded file, or null when the form carries none. */
async function fileBytes(formData: FormData, name = "file"): Promise<Uint8Array | null> {
  const raw = formData.get(name);
  if (!(raw instanceof File) || raw.size === 0) return null;
  return new Uint8Array(await raw.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

export async function createPackAction(input: PackInput): Promise<LibraryResult<{ packId: string }>> {
  return run(
    "create_pack",
    async () => ({ packId: (await createPack(input)).id }),
    (t) => t.ieeEditor.toast.packCreated,
  );
}

export async function updatePackAction(packId: string, input: PackPatchInput): Promise<LibraryResult> {
  return run(
    "update_pack",
    async () => {
      await updatePack(packId, input);
      return undefined;
    },
    (t) => t.ieeEditor.toast.packSaved,
  );
}

export async function setPackArchivedAction(packId: string, archived: boolean): Promise<LibraryResult> {
  return run(
    "archive_pack",
    async () => {
      await setPackArchived(packId, archived);
      return undefined;
    },
    (t) => (archived ? t.ieeEditor.toast.packArchived : t.ieeEditor.toast.packRestored),
  );
}

/** `packId` and a `file`, or `clear=1` to remove the icon. */
export async function setPackIconAction(formData: FormData): Promise<LibraryResult> {
  const packId = String(formData.get("packId") ?? "");
  return run(
    "pack_icon",
    async () => {
      const bytes = await fileBytes(formData);
      if (!bytes && formData.get("clear") !== "1") throw new FileError("fileEmpty");
      await setPackIcon(packId, bytes);
      return undefined;
    },
    (t) => (formData.get("clear") === "1" ? t.ieeEditor.toast.iconCleared : t.ieeEditor.toast.iconSaved),
  );
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function createEntryAction(input: EntryInput): Promise<LibraryResult<{ entryId: string }>> {
  return run(
    "create_entry",
    async () => ({ entryId: (await createEntry(input)).id }),
    (t) => t.ieeEditor.toast.entryCreated,
  );
}

export async function copyEntryAction(entryId: string, input: CopyEntryInput): Promise<LibraryResult<{ entryId: string }>> {
  return run(
    "copy_entry",
    async () => ({ entryId: (await copyEntry(entryId, input)).id }),
    (t) => t.ieeEditor.toast.entryCopied,
  );
}

export async function setEntryArchivedAction(entryId: string, archived: boolean): Promise<LibraryResult> {
  return run(
    "archive_entry",
    async () => {
      await setEntryArchived(entryId, archived);
      return undefined;
    },
    (t) => (archived ? t.ieeEditor.toast.entryArchived : t.ieeEditor.toast.entryRestored),
  );
}

/** `entryId` and a `file`, or `clear=1` to remove the icon. */
export async function setEntryIconAction(formData: FormData): Promise<LibraryResult> {
  const entryId = String(formData.get("entryId") ?? "");
  return run(
    "entry_icon",
    async () => {
      const bytes = await fileBytes(formData);
      if (!bytes && formData.get("clear") !== "1") throw new FileError("fileEmpty");
      await setEntryIcon(entryId, bytes);
      return undefined;
    },
    (t) => (formData.get("clear") === "1" ? t.ieeEditor.toast.iconCleared : t.ieeEditor.toast.iconSaved),
  );
}

export interface SavedDraftResult {
  slug: string;
  errors: Issue[];
  warnings: Issue[];
}

export async function saveEntryDraftAction(entryId: string, draft: unknown): Promise<LibraryResult<SavedDraftResult>> {
  return run(
    "save_draft",
    async () => {
      const saved = await saveDraft(entryId, draft);
      return { slug: saved.entry.slug, errors: saved.check.errors, warnings: saved.check.warnings };
    },
    (t) => t.ieeEditor.toast.draftSaved,
  );
}

/**
 * Runs the scenarios of a draft as it is in the editor (spec §5.5) — nothing
 * is saved and nothing re-read. Null when the draft does not parse: its checks
 * say why.
 */
export async function runScenariosAction(entryId: string, draft: unknown): Promise<LibraryResult<ScenarioRun | null>> {
  try {
    const data = await runDraftScenarios(entryId, draft);
    const { t } = await getT();
    const s = t.ieeEditor.toast;
    return { ok: data === null ? s.scenariosUnreadable : data.ok ? s.scenariosGreen : s.scenariosRed, data };
  } catch (e) {
    return await toError(e, "iee.library.run_scenarios", { actorId: (await getCurrentUser())?.id ?? null });
  }
}

/**
 * Plays a draft in the sandbox (spec §10.5): a season in memory, bots, a
 * seed — nothing saved but the audit row. Null when the draft does not parse.
 */
export async function runSandboxAction(
  entryId: string,
  draft: unknown,
  request: SandboxRequest,
): Promise<LibraryResult<SandboxOutcome | null>> {
  try {
    const data = await runDraftSandbox(entryId, draft, request);
    const { t } = await getT();
    const s = t.ieeEditor.toast;
    return { ok: data === null ? s.sandboxUnreadable : data.ok ? s.sandboxDone : s.sandboxBroken, data };
  } catch (e) {
    return await toError(e, "iee.library.run_sandbox", { actorId: (await getCurrentUser())?.id ?? null });
  }
}

export interface PublishedEntry {
  state: PublishState;
  number: number | null;
  errors: PublishIssue[];
  warnings: PublishIssue[];
}

export async function publishEntryAction(entryId: string): Promise<LibraryResult<PublishedEntry>> {
  const result = await run(
    "publish_entry",
    async () => {
      const outcome = await publishEntry(entryId);
      return {
        state: outcome.state,
        number: outcome.revision?.number ?? null,
        errors: outcome.errors,
        warnings: outcome.warnings,
      };
    },
    (t, data) =>
      data.state === "published"
        ? format(t.ieeEditor.toast.published, { number: String(data.number) })
        : data.state === "unchanged"
          ? t.ieeEditor.toast.unchanged
          : t.ieeEditor.toast.blocked,
  );
  // A refused publish is not a success: the checks said no.
  if (result.data?.state === "blocked") return { error: result.ok, data: result.data };
  return result;
}

export interface PublishedPack {
  published: { slug: string; number: number }[];
  unchanged: number;
  blocked: { entryId: string; slug: string; errors: PublishIssue[] }[];
}

export async function publishPackAction(packId: string): Promise<LibraryResult<PublishedPack>> {
  return run(
    "publish_pack",
    async () => {
      const outcomes = await publishPack(packId);
      return {
        published: outcomes.flatMap((o) => (o.state === "published" && o.revision ? [{ slug: o.slug, number: o.revision.number }] : [])),
        unchanged: outcomes.filter((o) => o.state === "unchanged").length,
        blocked: outcomes.filter((o) => o.state === "blocked").map((o) => ({ entryId: o.entryId, slug: o.slug, errors: o.errors })),
      };
    },
    (t, data) =>
      format(t.ieeEditor.toast.packPublished, {
        published: String(data.published.length),
        blocked: String(data.blocked.length),
      }),
  );
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** A `.ggpack` in `file`. */
export async function importPackAction(formData: FormData): Promise<LibraryResult<ImportReport>> {
  return run(
    "import_pack",
    async () => {
      const bytes = await fileBytes(formData);
      if (!bytes) throw new FileError("fileEmpty");
      return importPack(bytes);
    },
    (t, report) => format(t.ieeEditor.toast.imported, { slug: report.pack.slug }),
  );
}

/** The pack as a `.ggpack`, base64 — the browser saves it. */
export async function exportPackAction(
  packId: string,
  history: boolean,
): Promise<LibraryResult<{ fileName: string; base64: string }>> {
  return run(
    "export_pack",
    async () => {
      const { fileName, bytes } = await exportPack(packId, { history });
      return { fileName, base64: Buffer.from(bytes).toString("base64") };
    },
    (t, data) => format(t.ieeEditor.toast.exported, { file: data.fileName }),
  );
}
