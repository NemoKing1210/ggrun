import type { Season, SeasonPlayer } from "@/db/schema";
import { Badge } from "@/components/ui/Badge";

type SeasonStatus = Season["status"];
type PlayerStatus = SeasonPlayer["status"];

const VARIANT: Record<string, "military" | "amber" | "danger" | "dim"> = {
  active: "military",
  finished: "amber",
  paused: "amber",
  eliminated: "danger",
  withdrawn: "dim",
  draft: "dim",
  archived: "dim",
};

/** Label is passed in from the i18n dictionary (t.core.seasonStatuses/playerStatuses). */
export function StatusBadge({ status, label }: { status: SeasonStatus | PlayerStatus; label: string }) {
  const v = VARIANT[status] ?? "dim";
  return (
    <Badge variant={v} size="sm">
      {label}
    </Badge>
  );
}
