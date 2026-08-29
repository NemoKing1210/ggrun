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
  locale?: string | null;
};

export function PresenceDot({ lastSeenAt, size = "md", pulse: _pulse = true, bordered = false, className, locale }: PresenceDotProps) {
  const { t } = useI18n();
  const pr = t.profile.presence;
  const online = isOnline(lastSeenAt);
  const dim = size === "sm" ? "size-2" : size === "lg" ? "size-3" : "size-2.5";
  const tip = (() => {
    if (online) return pr.online;
    const diff = diffSince(lastSeenAt);
    const bucket = bucketForDiff(diff);
    if (!bucket) return pr.never;
    if (bucket.bucket === "justNow") return format(pr.lastSeen, { time: pr.justNow });
    if (bucket.bucket === "minutes") return format(pr.lastSeen, { time: format(pr.minutesAgo, { count: String(bucket.value) }) });
    if (bucket.bucket === "hours") return format(pr.lastSeen, { time: format(pr.hoursAgo, { count: String(bucket.value) }) });
    if (bucket.bucket === "days") return format(pr.lastSeen, { time: format(pr.daysAgo, { count: String(bucket.value) }) });
    if (!lastSeenAt) return pr.never;
    const d = new Date(lastSeenAt);
    const fmt = new Intl.DateTimeFormat(locale ?? undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return format(pr.lastSeen, { time: fmt.format(d) });
  })();
  return (
    <span className="group/tooltip relative inline-block shrink-0 leading-none">
      <span
        aria-hidden
        className={[
          "inline-block shrink-0",
          dim,
          bordered ? (online ? "border-0" : "border-2 border-raised") : "border border-black/30",
          online ? "bg-military animate-presence-glow" : "bg-zinc-500",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap border border-amber/60 bg-[#1e1c0a] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-amber opacity-0 shadow-[0_4px_20px_rgba(0,0,0,0.7),0_0_16px_rgba(242,169,0,0.35)] transition-all duration-200 ease-out group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
      >
        {tip}
      </span>
    </span>
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
            ? "inline-flex items-center gap-1.5 border border-military bg-military/20 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-military animate-presence-glow [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
            : "inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-military"
        }
      >
        {showDot ? <span className="size-1.5 bg-military animate-presence-glow" aria-hidden /> : null}
        {pr.online}
      </span>
    );
  }

  return (
    <span
      className={
        variant === "hud"
          ? "group/tooltip relative inline-flex items-center gap-1.5 border border-dim/20 bg-raised px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
          : "group/tooltip relative inline-flex items-center gap-1.5 font-mono text-xs text-dim"
      }
    >
      {showDot ? <span className="size-1.5 bg-zinc-500" aria-hidden /> : null}
      {timeText}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap border border-amber/50 bg-[#1e1c0a] px-3 py-1.5 font-mono text-xs font-semibold tracking-widest text-amber opacity-0 shadow-[0_4px_20px_rgba(0,0,0,0.7),0_0_14px_rgba(242,169,0,0.3)] transition-all duration-200 ease-out group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
      >
        {lastSeenAt ? new Date(lastSeenAt).toLocaleString(locale ?? undefined) : pr.never}
      </span>
    </span>
  );
}

type AvatarWithPresenceProps = {
  lastSeenAt: string | Date | null | undefined;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dotSize?: "sm" | "md" | "lg";
  locale?: string | null;
};

/** Wraps any avatar element with an absolute presence dot at the top-right inside — equal offsets, proportional to avatar size. */
export function AvatarWithPresence({ lastSeenAt, children, size = "md", dotSize, locale }: AvatarWithPresenceProps) {
  const dot = dotSize ?? (size === "lg" || size === "xl" ? "lg" : size === "sm" ? "sm" : "md");
  const offset =
    size === "xl" ? "top-2.5 right-2.5" : size === "lg" ? "top-2 right-2" : size === "md" ? "top-1.5 right-1.5" : "top-1 right-1";
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span className={`absolute ${offset} flex`}>
        <PresenceDot lastSeenAt={lastSeenAt} size={dot} bordered locale={locale} />
      </span>
    </span>
  );
}
