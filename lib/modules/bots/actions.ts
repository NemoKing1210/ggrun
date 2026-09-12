"use server";

import { revalidatePath } from "next/cache";

import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { log } from "@/lib/infrastructure/logger";
import { revalidateAdmin } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";
import { makeToError } from "@/lib/use-cases/shared/action-error";

import { BotError } from "./errors";
import { getBotRun } from "./repository";
import {
  cleanupBotRun,
  createBotRun,
  parseBotConfig,
  pauseBotRun,
  resumeBotRun,
  stopBotRun,
  tickBotRun,
  updateBotRunConfig,
} from "./service";

const toError = makeToError(BotError);

function requireSeasonId(formData: FormData): string {
  const seasonId = formData.get("seasonId");
  if (typeof seasonId !== "string" || seasonId.length === 0) throw new BotError("botRunNotFound");
  return seasonId;
}

function requireRunId(formData: FormData): string {
  const runId = formData.get("runId");
  if (typeof runId !== "string" || runId.length === 0) throw new BotError("botRunNotFound");
  return runId;
}

export async function createBotRunAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const seasonId = requireSeasonId(formData);
  try {
    const config = parseBotConfig(formData);
    const run = await createBotRun(seasonId, config);
    revalidateAdmin(seasonId);
    revalidatePath(`/admin/seasons/${seasonId}/bots`);
    const { t } = await getT();
    return { ok: t.admin.bots.runCreated.replace("{id}", run.id.slice(0, 8)) };
  } catch (e) {
    return toError(e, "bots.create", { seasonId });
  }
}

export interface BotTickState {
  ok?: string;
  error?: string;
  debug?: string;
  actions?: number;
  errors?: number;
  stopped?: boolean;
  status?: string;
}

/** One console tick: runs real player steps server-side, returns the summary. */
export async function tickBotsAction(formData: FormData): Promise<BotTickState> {
  const runId = requireRunId(formData);
  try {
    const summary = await tickBotRun(runId);
    // No revalidatePath here: the console drives ticks in a loop and refreshes
    // itself via router.refresh() after each tick.
    return {
      ok: "tick",
      actions: summary.actions,
      errors: summary.errors,
      stopped: summary.stopped,
    };
  } catch (e) {
    const { t } = await getT();
    if (e instanceof BotError) {
      return { error: errorText(t.core.errors, e.code, e.params), stopped: e.code === "botRunStopped" };
    }
    log.error("bots.tick.failed", { runId, error: e instanceof Error ? e.message : "unknown" });
    return { error: errorText(t.core.errors, "formUnknown", {}) };
  }
}

export async function updateBotConfigAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const runId = requireRunId(formData);
  try {
    const config = parseBotConfig(formData);
    await updateBotRunConfig(runId, config);
    const { t } = await getT();
    return { ok: t.admin.bots.configSaved };
  } catch (e) {
    return toError(e, "bots.config", { runId });
  }
}

async function lifecycleAction(
  formData: FormData,
  fn: (runId: string) => Promise<{ seasonId: string }>,
  ctx: string,
): Promise<void> {
  const runId = requireRunId(formData);
  try {
    const run = await fn(runId);
    revalidateAdmin(run.seasonId);
    revalidatePath(`/admin/seasons/${run.seasonId}/bots`);
  } catch (e) {
    log.error(`bots.${ctx}.failed`, { runId, error: e instanceof Error ? e.message : "unknown" });
    throw e;
  }
}

export async function pauseBotRunAction(formData: FormData): Promise<void> {
  return lifecycleAction(formData, pauseBotRun, "pause");
}

export async function resumeBotRunAction(formData: FormData): Promise<void> {
  return lifecycleAction(formData, resumeBotRun, "resume");
}

export async function stopBotRunAction(formData: FormData): Promise<void> {
  return lifecycleAction(formData, stopBotRun, "stop");
}

export async function cleanupBotRunAction(formData: FormData): Promise<void> {
  const runId = requireRunId(formData);
  const deleteRun = formData.get("deleteRun") === "on";
  try {
    const run = await getBotRun(runId);
    const seasonId = run?.seasonId ?? null;
    await cleanupBotRun(runId, deleteRun);
    if (seasonId) {
      revalidateAdmin(seasonId);
      revalidatePath(`/admin/seasons/${seasonId}/bots`);
    } else {
      revalidatePath("/admin/seasons");
    }
  } catch (e) {
    log.error("bots.cleanup.failed", { runId, error: e instanceof Error ? e.message : "unknown" });
    throw e;
  }
}
