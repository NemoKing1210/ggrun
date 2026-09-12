import {
  ArchiveBoxIcon,
  CheckCircleIcon,
  PauseCircleIcon,
  PencilSquareIcon,
  PlayCircleIcon,
} from "@heroicons/react/24/solid";

import { Badge } from "@/components/ui/Badge";
import {
  PLAYER_STATUS_VARIANT,
  SEASON_STATUS_VARIANT,
  type PlayerStatus,
  type SeasonStatus,
} from "@/lib/shared/ui/status-variants";

type IconType = React.ComponentType<{ className?: string }>;

/**
 * Season badges carry a glyph; player badges do not.
 *
 * Not an inconsistency -- a season badge appears once per page (the header's
 * `right` slot) or once per row in the admin list, so the icon is free
 * signal. Player badges appear thirty at a time down a leaderboard, where the
 * same glyph repeated would be noise. It is also what lets `finished` and
 * `archived` share the idle greys without becoming indistinguishable.
 */
const SEASON_ICON: Record<SeasonStatus, IconType> = {
  draft: PencilSquareIcon,
  active: PlayCircleIcon,
  paused: PauseCircleIcon,
  finished: CheckCircleIcon,
  archived: ArchiveBoxIcon,
};

/** Label comes from the i18n dictionary (t.core.seasonStatuses / playerStatuses). */
export function StatusBadge(
  props:
    | { kind: "season"; status: SeasonStatus; label: string }
    | { kind: "player"; status: PlayerStatus; label: string },
) {
  if (props.kind === "player") {
    return (
      <Badge variant={PLAYER_STATUS_VARIANT[props.status]} size="sm">
        {props.label}
      </Badge>
    );
  }

  const Icon = SEASON_ICON[props.status];
  return (
    <Badge variant={SEASON_STATUS_VARIANT[props.status]} size="sm" className="gap-1.5">
      <Icon className="size-3 shrink-0 opacity-80" aria-hidden />
      {props.label}
    </Badge>
  );
}
