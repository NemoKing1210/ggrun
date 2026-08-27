"use server";

import { revalidatePath } from "next/cache";

import type { RollOutcome } from "@/game-engine";
import {
  GameLoopError,
  resolveGameRoll,
  rollNewGame,
} from "@/lib/use-cases/resolve-game-roll";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { log } from "@/lib/log";
import {
  makeToError,
  type ActionState,
} from "@/lib/use-cases/action-error";

export type PlayerActionState = ActionState;

const toError = makeToError(GameLoopError);

const outcomes: readonly RollOutcome[] = ["passed", "dropped", "rerolled"];

function requireString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function rollAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  const actor = await getCurrentUser();
  const { t } = await getT();
  const seasonPlayerId = requireString(formData, "seasonPlayerId");
  if (!seasonPlayerId) {
    return { error: errorText(t.core.errors, "gameParticipantNotFound") };
  }
  try {
    const rollId = await rollNewGame(seasonPlayerId);
    log.info("game.roll", {
      actorId: actor?.id ?? null,
      seasonPlayerId,
      rollId,
    });
  } catch (e) {
    return await toError(e, "game.roll", {
      actorId: actor?.id ?? null,
      seasonPlayerId,
    });
  }
  revalidatePath("/dashboard");
  return {};
}

export async function resolveAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  const actor = await getCurrentUser();
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
    log.info("game.resolve", {
      actorId: actor?.id ?? null,
      seasonPlayerId,
      rollId,
      outcome,
    });
  } catch (e) {
    return await toError(e, "game.resolve", {
      actorId: actor?.id ?? null,
      seasonPlayerId,
      rollId,
      outcome,
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/board");
  return {};
}
