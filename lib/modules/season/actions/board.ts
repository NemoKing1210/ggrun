"use server";

import { revalidatePath } from "next/cache";

import { setBoardCell } from "@/lib/modules/season/service";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { log } from "@/lib/infrastructure/logger";

import { revalidateAdmin, toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";

export async function setBoardCellAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const boardId = String(formData.get("boardId"));
  const seasonId = String(formData.get("seasonId") || "");
  const position = Number(formData.get("position"));
  const cellType = String(formData.get("cellType")) as never;
  const label = String(formData.get("label") || "") || null;
  const amountRaw = formData.get("amount");
  const config =
    amountRaw !== null && String(amountRaw) !== ""
      ? { amount: Number(amountRaw) }
      : {};
  try {
    await setBoardCell({ boardId, position, cellType, label, config });
    log.info("board.cell_set", {
      actorId: actor?.id ?? null,
      seasonId,
      boardId,
      position,
      cellType,
    });
    revalidateAdmin(seasonId);
    revalidatePath("/board");
    return {
      ok: format((await getT()).t.admin.feedback.cellSaved, { position }),
    };
  } catch (e) {
    return await toError(e, "board.cell_set", {
      actorId: actor?.id ?? null,
      seasonId,
      position,
    });
  }
}

