import type { Season, SeasonPlayer } from "@/db/schema";

type SeasonStatus = Season["status"];
type PlayerStatus = SeasonPlayer["status"];

export const SEASON_STATUS_RU: Record<SeasonStatus, string> = {
  draft: "Черновик",
  active: "Идёт",
  paused: "Пауза",
  finished: "Завершён",
  archived: "Архив",
};

export const PLAYER_STATUS_RU: Record<PlayerStatus, string> = {
  active: "В игре",
  finished: "Финиш",
  eliminated: "Выбыл",
  withdrawn: "Снялся",
};

const BADGE_STYLES: Record<string, string> = {
  active: "border-military text-military",
  finished: "border-amber text-amber",
  paused: "border-amber/60 text-amber/80",
  eliminated: "border-danger text-danger",
  withdrawn: "border-dim text-dim",
  draft: "border-dim text-dim",
  archived: "border-dim text-dim",
};

export function StatusBadge({
  status,
  labels,
}: {
  status: SeasonStatus | PlayerStatus;
  labels: Record<string, string>;
}) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 text-xs uppercase tracking-widest ${
        BADGE_STYLES[status] ?? "border-dim text-dim"
      }`}
    >
      {labels[status]}
    </span>
  );
}
