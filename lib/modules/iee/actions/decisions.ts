"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import type { WheelOutcome } from "@/lib/engine";
import { answerDecision, GameLoopError, judgeDecision } from "@/lib/modules/game";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";

const toError = makeToError(GameLoopError);

/**
 * An answer's state for the form: what an answer that played a turn — a
 * reaction window's (spec §7.4) — spun on its landing, for the client to show.
 */
export type DecisionActionState = ActionState & { wheel?: WheelOutcome };

/** The answer a form carries: the decision, the option taken, the items picked. */
function answerOf(formData: FormData): { decisionId: string; option: string; picks: string[] } {
  const picks = formData
    .getAll("picks")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  return {
    decisionId: String(formData.get("decisionId") ?? ""),
    option: String(formData.get("option") ?? "").trim(),
    picks: [...new Set(picks)],
  };
}

/** The player answers a choice their entry put to them (spec §7.6). */
export async function answerDecisionAction(_prev: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const actor = await getCurrentUser();
  const answer = answerOf(formData);
  try {
    const answered = await answerDecision({ decisionId: answer.decisionId, option: answer.option, picks: answer.picks });
    revalidatePath("/dashboard");
    revalidatePath("/board");
    revalidatePath("/feed");
    log.info("iee.decision.answer.action", { actorId: actor?.id ?? null, decisionId: answer.decisionId });
    return { ok: answer.option, ...(answered.wheel ? { wheel: answered.wheel } : {}) };
  } catch (e) {
    return await toError(e, "iee.decision.answer", { actorId: actor?.id ?? null, decisionId: answer.decisionId });
  }
}

/** A judge chooses for the player (spec §7.6) — an option, or the default when none is sent. */
export async function judgeDecisionAction(_prev: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const actor = await getCurrentUser();
  const answer = answerOf(formData);
  try {
    await judgeDecision({
      decisionId: answer.decisionId,
      option: answer.option || null,
      picks: answer.picks,
    });
    revalidatePath("/admin/moderation");
    revalidatePath("/dashboard");
    revalidatePath("/board");
    revalidatePath("/feed");
    log.info("iee.decision.judge.action", { actorId: actor?.id ?? null, decisionId: answer.decisionId });
    return { ok: answer.option || "default" };
  } catch (e) {
    return await toError(e, "iee.decision.judge", { actorId: actor?.id ?? null, decisionId: answer.decisionId });
  }
}
