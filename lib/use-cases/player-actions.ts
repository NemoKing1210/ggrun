"use server";

import { revalidatePath } from "next/cache";

import type { RollOutcome } from "@/game-engine";
import {
  GameLoopError,
  resolveGameRoll,
  rollNewGame,
} from "@/lib/use-cases/resolve-game-roll";

export type PlayerActionState = { error?: string };

const outcomes: readonly RollOutcome[] = ["passed", "dropped", "rerolled"];

function requireString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function rollAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  const seasonPlayerId = requireString(formData, "seasonPlayerId");
  if (!seasonPlayerId) return { error: "Не найдена запись участника" };

  try {
    await rollNewGame(seasonPlayerId);
  } catch (e) {
    if (e instanceof GameLoopError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard");
  return {};
}

export async function resolveAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  const seasonPlayerId = requireString(formData, "seasonPlayerId");
  if (!seasonPlayerId) return { error: "Не найдена запись участника" };

  const rollId = requireString(formData, "rollId");
  if (!rollId) return { error: "Открытый ролл не найден" };

  const outcome = requireString(formData, "outcome");
  if (!outcome || !outcomes.includes(outcome as RollOutcome)) {
    return { error: "Неизвестное действие" };
  }

  try {
    await resolveGameRoll({ rollId, outcome: outcome as RollOutcome });
  } catch (e) {
    if (e instanceof GameLoopError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard");
  return {};
}
