import type { BoardCell } from "@/db/schema";

type CellType = BoardCell["cellType"];

/** Только оформление; подписи типов берутся из словаря (t.core.cellTypes). */
export const CELL_THEME: Record<CellType, { box: string; dot: string }> = {
  start: { box: "border-amber bg-amber/10", dot: "bg-military" },
  finish: { box: "border-military bg-military/20", dot: "bg-amber" },
  normal: { box: "border-dim/40 bg-raised", dot: "bg-dim/50" },
  penalty: { box: "border-danger bg-danger/15", dot: "bg-danger" },
  bonus: { box: "border-amber bg-amber/15", dot: "bg-amber" },
  teleport: { box: "border-[#7a5fb5] bg-[#7a5fb5]/15", dot: "bg-[#7a5fb5]" },
  event: { box: "border-[#5fa8d3] bg-[#5fa8d3]/10", dot: "bg-[#5fa8d3]" },
  custom: { box: "border-dashed border-dim/60 bg-raised", dot: "bg-dim" },
};
