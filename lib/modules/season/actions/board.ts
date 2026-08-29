"use server";

import { revalidatePath } from "next/cache";

import { bulkSetBoardCellGenres, randomizeBoardGenres, setBoardCell } from "@/lib/modules/season/service";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { log } from "@/lib/infrastructure/logger";

import { revalidateAdmin, toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";

function parseGenres(raw: FormDataEntryValue | null): string[] {
  if (raw === null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    } catch {}
  }
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function parsePositions(raw: string): number[] {
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    } catch {}
  }
  const out: number[] = [];
  for (const part of s.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes("-")) {
      const [a, b] = t.split("-").map((x) => Number(x.trim()));
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let i = lo; i <= hi; i++) out.push(i);
      }
    } else {
      const n = Number(t);
      if (!Number.isNaN(n)) out.push(n);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export async function setBoardCellAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const boardId = String(formData.get("boardId"));
  const seasonId = String(formData.get("seasonId") || "");
  const position = Number(formData.get("position"));
  const cellType = String(formData.get("cellType")) as never;
  const label = String(formData.get("label") || "") || null;
  const amountRaw = formData.get("amount");
  const genres = parseGenres(formData.get("genres") ?? formData.get("cellGenres"));
  const config: Record<string, unknown> = {};
  if (amountRaw !== null && String(amountRaw) !== "") config.amount = Number(amountRaw);
  if (genres.length) config.genres = genres;
  const targetRaw = formData.get("target");
  if (targetRaw !== null && String(targetRaw).trim() !== "") {
    const n = Number(targetRaw);
    if (!Number.isNaN(n)) config.target = n;
  }
  try {
    await setBoardCell({ boardId, position, cellType, label, config });
    log.info("board.cell_set", { actorId: actor?.id ?? null, seasonId, boardId, position, cellType });
    revalidateAdmin(seasonId);
    revalidatePath("/board");
    return { ok: format((await getT()).t.admin.feedback.cellSaved, { position }) };
  } catch (e) {
    return await toError(e, "board.cell_set", { actorId: actor?.id ?? null, seasonId, position });
  }
}

export async function bulkSetCellGenresAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const boardId = String(formData.get("boardId"));
  const seasonId = String(formData.get("seasonId") || "");
  const genres = parseGenres(formData.get("genres") ?? formData.get("bulkGenres"));
  const positionsRaw = String(formData.get("positions") ?? "");
  let positions = parsePositions(positionsRaw);
  const allFlag = String(formData.get("applyToAll") ?? "") === "true" || String(formData.get("applyToAll") ?? "") === "1";
  if (positions.length === 0 && !allFlag) return { error: "formUnknown" } as AdminFormState;
  if (allFlag && positions.length === 0) {
    // positions need to be supplied; if not, we try to infer board size from fallback param
    const sizeRaw = formData.get("boardSize");
    const size = sizeRaw ? Number(sizeRaw) : NaN;
    if (!Number.isNaN(size) && size > 0) positions = Array.from({ length: size }, (_, i) => i);
  }
  try {
    const count = await bulkSetBoardCellGenres({ boardId, positions, genres });
    log.info("board.bulk_genres", { actorId: actor?.id ?? null, seasonId, boardId, count, genres });
    revalidateAdmin(seasonId);
    revalidatePath("/board");
    const t = (await getT()).t;
    return { ok: format(t.admin.feedback.cellSaved, { position: `${count} cells` }) };
  } catch (e) {
    return await toError(e, "board.bulk_genres", { actorId: actor?.id ?? null, seasonId, boardId });
  }
}

export async function randomizeBoardGenresAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const boardId = String(formData.get("boardId"));
  const seasonId = String(formData.get("seasonId") || "");
  const poolGenres = parseGenres(formData.get("poolGenres"));
  const positionsRaw = String(formData.get("positions") ?? "");
  let positions = parsePositions(positionsRaw);
  const applyToAll = String(formData.get("applyToAll") ?? "") === "true" || String(formData.get("applyToAll") ?? "") === "1";
  if (positions.length === 0 && applyToAll) {
    const sizeRaw = formData.get("boardSize");
    const size = sizeRaw ? Number(sizeRaw) : NaN;
    if (!Number.isNaN(size) && size > 0) positions = Array.from({ length: size }, (_, i) => i);
  }
  if (positions.length === 0) return { error: "formUnknown" } as AdminFormState;
  try {
    const count = await randomizeBoardGenres({ boardId, positions, poolGenres: poolGenres.length ? poolGenres : undefined });
    log.info("board.randomize_genres", { actorId: actor?.id ?? null, seasonId, boardId, count });
    revalidateAdmin(seasonId);
    revalidatePath("/board");
    const t = (await getT()).t;
    return { ok: format(t.admin.feedback.cellSaved, { position: `${count} cells randomized` }) };
  } catch (e) {
    return await toError(e, "board.randomize_genres", { actorId: actor?.id ?? null, seasonId, boardId });
  }
}
