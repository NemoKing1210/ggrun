import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/shared/utils/cn";

/** Small `BOT` marker shown next to synthetic test-bot accounts. */
export function BotBadge({ label = "BOT", className }: { label?: string; className?: string }) {
  return (
    <Badge variant="sky" size="sm" className={cn("shrink-0", className)} title={label}>
      {label}
    </Badge>
  );
}
