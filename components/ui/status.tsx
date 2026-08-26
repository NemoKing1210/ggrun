import type { Season, SeasonPlayer } from "@/db/schema";

type SeasonStatus = Season["status"];
type PlayerStatus = SeasonPlayer["status"];

const BADGE_STYLES: Record<string, string> = {
  active: "border-military text-military",
  finished: "border-amber text-amber",
  paused: "border-amber/60 text-amber/80",
  eliminated: "border-danger text-danger",
  withdrawn: "border-dim text-dim",
  draft: "border-dim text-dim",
  archived: "border-dim text-dim",
};

/** Label is passed in from the i18n dictionary (t.core.seasonStatuses/playerStatuses). */
export function StatusBadge({
  status,
  label,
}: {
  status: SeasonStatus | PlayerStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 text-xs uppercase tracking-widest ${
        BADGE_STYLES[status] ?? "border-dim text-dim"
      }`}
    >
      {label}
    </span>
  );
}
