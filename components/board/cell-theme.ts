import type { BoardCell } from "@/db/schema";

type CellType = BoardCell["cellType"];

/** HUD tactical theme for each cell type. */
export const CELL_THEME: Record<CellType, { box: string; dot: string }> = {
  start: {
    box: "border-amber bg-amber/15 shadow-[inset_0_0_12px_rgba(242,169,0,0.15)]",
    dot: "bg-amber shadow-[0_0_6px_rgba(242,169,0,0.5)]",
  },
  finish: {
    box: "border-amber bg-amber/20 shadow-[inset_0_0_14px_rgba(242,169,0,0.22)]",
    dot: "bg-amber shadow-[0_0_6px_rgba(242,169,0,0.55)]",
  },
  normal: {
    box: "border-[#3d3d34] bg-raised",
    dot: "bg-[#55554a]",
  },
  penalty: {
    box: "border-danger bg-danger/15 shadow-[inset_0_0_10px_rgba(176,52,31,0.18)]",
    dot: "bg-danger shadow-[0_0_6px_rgba(176,52,31,0.45)]",
  },
  bonus: {
    box: "border-emerald-600 bg-emerald-600/15 shadow-[inset_0_0_10px_rgba(16,185,129,0.14)]",
    dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)]",
  },
  teleport: {
    box: "border-violet-500 bg-violet-500/15 shadow-[inset_0_0_10px_rgba(139,92,246,0.16)]",
    dot: "bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.45)]",
  },
  event: {
    box: "border-sky-500 bg-sky-500/12 shadow-[inset_0_0_10px_rgba(14,165,233,0.14)]",
    dot: "bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.45)]",
  },
  custom: {
    box: "border-dashed border-[#55554a] bg-[#242420]",
    dot: "bg-zinc-400",
  },
};
