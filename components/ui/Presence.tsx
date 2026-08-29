"use client";

import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { bucketForDiff, diffSince, isOnline } from "@/lib/shared/presence";

type PresenceDotProps = {
  lastSeenAt: string | Date | null | undefined;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  bordered?: boolean;
  className?: string;
};

export function PresenceDot({ lastSeenAt, size = "md", pulse: _pulse = true, bordered = false, className }: PresenceDotProps) {
  const online = isOnline(lastSeenAt);
  const dim = size === "sm" ? "size-2" : size === "lg" ? "size-3" : "size-2.5";
  return (
    <span
      aria-hidden
      className={[
        "inline-block shrink-0 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]",
        dim,
        bordered ? "border-2 border-raised shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" : "border border-black/30",
        online ? "bg-military shadow-[0_0_8px_rgba(124,143,74,0.9)] shadow-[0_0_14px_rgba(124,143,74,0.6)]" : "bg-zinc-500",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={online ? "online" : "offline"}
    />
  );
}

type PresenceBadgeProps = {
  lastSeenAt: string | Date | null | undefined;
  locale?: string | null;
  variant?: "hud" | "plain";
  showDot?: boolean;
};

export function PresenceBadge({ lastSeenAt, locale, variant = "hud", showDot = true }: PresenceBadgeProps) {
  const { t } = useI18n();
  const pr = t.profile.presence;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const online = isOnline(lastSeenAt);

  const timeText = useMemo(() => {
    if (online) return pr.online;
    const diff = diffSince(lastSeenAt);
    const bucket = bucketForDiff(diff);
    if (!bucket) return pr.never;
    if (bucket.bucket === "justNow") return format(pr.lastSeen, { time: pr.justNow });
    if (bucket.bucket === "minutes") return format(pr.lastSeen, { time: format(pr.minutesAgo, { count: String(bucket.value) }) });
    if (bucket.bucket === "hours") return format(pr.lastSeen, { time: format(pr.hoursAgo, { count: String(bucket.value) }) });
    if (bucket.bucket === "days") return format(pr.lastSeen, { time: format(pr.daysAgo, { count: String(bucket.value) }) });
    // date bucket — show absolute date
    if (!lastSeenAt) return pr.never;
    const d = new Date(lastSeenAt);
    const fmt = new Intl.DateTimeFormat(locale ?? undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return format(pr.lastSeen, { time: fmt.format(d) });
  }, [lastSeenAt, locale, online, pr]);

  if (online) {
    return (
      <span
        className={
          variant === "hud"
            ? "inline-flex items-center gap-1.5 border border-military/30 bg-military/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-military [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
            : "inline-flex items-center gap-1.5 font-mono text-xs text-military"
        }
      >
        {showDot ? <span className="size-1.5 bg-military shadow-[0_0_6px_rgba(124,143,74,0.9)] [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden /> : null}
        {pr.online}
      </span>
    );
  }

  return (
    <span
      className={
        variant === "hud"
          ? "inline-flex items-center gap-1.5 border border-dim/20 bg-raised px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
          : "inline-flex items-center gap-1.5 font-mono text-xs text-dim"
      }
      title={lastSeenAt ? new Date(lastSeenAt).toLocaleString(locale ?? undefined) : undefined}
    >
      {showDot ? <span className="size-1.5 bg-zinc-500 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden /> : null}
      {timeText}
    </span>
  );
}

type AvatarWithPresenceProps = {
  lastSeenAt: string | Date | null | undefined;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dotSize?: "sm" | "md" | "lg";
};

/** Wraps any avatar element with an absolute presence dot at the top-right inside. */
export function AvatarWithPresence({ lastSeenAt, children, size = "md", dotSize }: AvatarWithPresenceProps) {
  const dot = dotSize ?? (size === "lg" || size === "xl" ? "lg" : size === "sm" ? "sm" : "md");
  const offset = size === "lg" || size === "xl" ? "top-1.5 right-1.5" : "top-1 right-1";
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span className={`absolute ${offset}`}>
        <PresenceDot lastSeenAt={lastSeenAt} size={dot} bordered />
      </span>
    </span>
  );
}
