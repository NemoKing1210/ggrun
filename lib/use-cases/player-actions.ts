"use server";

import { revalidatePath } from "next/cache";

import type { RollOutcome } from "@/game-engine";
import {
  GameLoopError,
  resolveGameRoll,
  rollNewGame,
} from "@/lib/use-cases/resolve-game-roll";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";

export type PlayerActionState = { error?: string };

const outcomes: readonly RollOutcome[] = ["passed", "dropped", "rerolled"];

function requireString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

async function loopError(e: unknown): Promise<PlayerActionState> {
  const { t } = await getT();
  if (e instanceof GameLoopError) {
    return { error: errorText(t.core.errors, e.code) };
  }
  throw e;
}

export async function rollAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  const { t } = await getT();
  const seasonPlayerId = requireString(formData, "seasonPlayerId");
  if (!seasonPlayerId) {
    return { error: errorText(t.core.errors, "gameParticipantNotFound") };
  }
  try {
    await rollNewGame(seasonPlayerId);
  } catch (e) {
    return await loopError(e);
  }
  revalidatePath("/dashboard");
  return {};
}

export async function resolveAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  const { t } = await getT();
  const seasonPlayerId = requireString(formData, "seasonPlayerId");
  if (!seasonPlayerId) {
    return { error: errorText(t.core.errors, "gameParticipantNotFound") };
  }

  const rollId = requireString(formData, "rollId");
  if (!rollId) return { error: errorText(t.core.errors, "gameRollNotFound") };

  const outcome = requireString(formData, "outcome");
  if (!outcome || !outcomes.includes(outcome as RollOutcome)) {
    return { error: errorText(t.core.errors, "formUnknown") };
  }

  const reason = optionalString(formData, "reason");
  const comment = optionalString(formData, "comment");
  const ratingRaw = optionalString(formData, "rating");
  const rating = ratingRaw !== undefined && ratingRaw !== "" ? Number(ratingRaw) : undefined;

  try {
    await resolveGameRoll({
      rollId,
      outcome: outcome as RollOutcome,
      reason: reason ?? comment,
      comment,
      rating,
    });
  } catch (e) {
    return await loopError(e);
  }
  revalidatePath("/dashboard");
  revalidatePath("/board");
  return {};
}
