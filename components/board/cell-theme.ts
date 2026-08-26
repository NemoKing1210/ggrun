import type { BoardCell } from "@/db/schema";

type CellType = BoardCell["cellType"];

export const CELL_THEME: Record<
  CellType,
  { box: string; dot: string; name: string }
> = {
  start: {
    box: "border-amber bg-amber/10",
    dot: "bg-military",
    name: "Старт",
  },
  finish: {
    box: "border-military bg-military/20",
    dot: "bg-amber",
    name: "Финиш",
  },
  normal: {
    box: "border-dim/40 bg-raised",
    dot: "bg-dim/50",
    name: "Обычная",
  },
  penalty: {
    box: "border-danger bg-danger/15",
    dot: "bg-danger",
    name: "Штраф",
  },
  bonus: {
    box: "border-amber bg-amber/15",
    dot: "bg-amber",
    name: "Бонус",
  },
  teleport: {
    box: "border-[#7a5fb5] bg-[#7a5fb5]/15",
    dot: "bg-[#7a5fb5]",
    name: "Телепорт",
  },
  event: {
    box: "border-[#5fa8d3] bg-[#5fa8d3]/10",
    dot: "bg-[#5fa8d3]",
    name: "Событие",
  },
  custom: {
    box: "border-dashed border-dim/60 bg-raised",
    dot: "bg-dim",
    name: "Особая",
  },
};
