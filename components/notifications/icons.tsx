import type { ComponentType, SVGProps } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  TrophyIcon,
  UserMinusIcon,
  UserPlusIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

type IconProps = SVGProps<SVGSVGElement>;

const ICONS: Record<string, ComponentType<IconProps>> = {
  UserPlusIcon,
  UserMinusIcon,
  AdjustmentsHorizontalIcon,
  PlayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  TrophyIcon,
};

/** Maps the engine icon key to a Heroicon. Unknown keys fall back to the bell. */
export function NotificationIcon({ icon, className }: { icon: string | null; className?: string }) {
  const Cmp = (icon && ICONS[icon]) || BellIcon;
  return <Cmp className={className ?? "h-5 w-5"} aria-hidden />;
}
