"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { bucketForDiff, diffSince, isOnline } from "@/lib/shared/presence";

// ---------------------------------------------------------------------------
// Tooltip text helper — shared between Dot/Badge/Avatar wrappers
// ---------------------------------------------------------------------------
function usePresenceTip(lastSeenAt: string | Date | null | undefined, locale?: string | null): string {
  const { t } = useI18n();
  const pr = t.profile.presence;
  // we hook a 30s tick so "minutes ago" stays fresh without page reload
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  return useMemo(() => {
    if (isOnline(lastSeenAt)) return pr.online;
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
  }, [lastSeenAt, locale, pr]);
}

// ---------------------------------------------------------------------------
// Legacy: PresenceDot — kept for backwards compat, now renders border-style
// Deprecated: prefer AvatarWithPresence with border
// ---------------------------------------------------------------------------
type PresenceDotProps = {
  lastSeenAt: string | Date | null | undefined;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  bordered?: boolean;
  className?: string;
  locale?: string | null;
};

export function PresenceDot({ lastSeenAt, size = "md", bordered = false, className, locale }: PresenceDotProps) {
  const online = isOnline(lastSeenAt);
  const tip = usePresenceTip(lastSeenAt, locale);
  const dim = size === "sm" ? "size-2" : size === "lg" ? "size-3" : "size-2.5";
  return (
    <span className="group/tooltip relative inline-block shrink-0 leading-none">
      <span
        aria-hidden
        className={[
          "inline-block shrink-0",
          dim,
          bordered ? (online ? "border-0" : "border-2 border-raised") : "border border-black/30",
          online ? "bg-military animate-presence-border" : "bg-zinc-500",
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

// ---------------------------------------------------------------------------
// Legacy: PresenceBadge
// ---------------------------------------------------------------------------
type PresenceBadgeProps = {
  lastSeenAt: string | Date | null | undefined;
  locale?: string | null;
  variant?: "hud" | "plain";
  showDot?: boolean;
};

export function PresenceBadge({ lastSeenAt, locale, variant = "hud", showDot = true }: PresenceBadgeProps) {
  const tip = usePresenceTip(lastSeenAt, locale);
  void tip; // tip computed for tooltip consistency, but badge now uses same wrapper logic
  const { t } = useI18n();
  const pr = t.profile.presence;
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
            ? "inline-flex items-center gap-1.5 border border-military bg-military/20 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-military animate-presence-border [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
            : "inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-military"
        }
      >
        {showDot ? <span className="size-1.5 bg-military animate-presence-border" aria-hidden /> : null}
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

// ---------------------------------------------------------------------------
// New: AvatarWithPresence — border around avatar + tooltip on avatar hover
// + optional link. This is the canonical presence wrapper going forward.
// ---------------------------------------------------------------------------
type AvatarWithPresenceProps = {
  lastSeenAt: string | Date | null | undefined;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  locale?: string | null;
  href?: string | null;
  className?: string;
};

const sizeToBorder: Record<string, string> = {
  sm: "border",
  md: "border-2",
  lg: "border-2",
  xl: "border-2",
};

const sizeToClip: Record<string, string> = {
  sm: "[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]",
  md: "[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]",
  lg: "[clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]",
  xl: "[clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]",
};

export function AvatarWithPresence({ lastSeenAt, children, size = "md", locale, href, className }: AvatarWithPresenceProps) {
  const online = isOnline(lastSeenAt);
  const tip = usePresenceTip(lastSeenAt, locale);
  const borderW = sizeToBorder[size] ?? "border-2";
  const clip = sizeToClip[size] ?? sizeToClip.md;
  const borderState = online ? "border-military animate-presence-border" : "border-[#2a2a22]";

  const frameClass = ["inline-flex shrink-0 overflow-hidden bg-raised", borderW, borderState, clip, className ?? ""]
    .filter(Boolean)
    .join(" ");

  const inner = <span className={frameClass}>{children}</span>;

  return (
    <span className="group/avatar relative inline-flex shrink-0 leading-none">
      {href ? (
        <Link href={href} className="inline-flex shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          {inner}
        </Link>
      ) : (
        inner
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap border border-amber/60 bg-[#1e1c0a] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-amber opacity-0 shadow-[0_4px_20px_rgba(0,0,0,0.7),0_0_16px_rgba(242,169,0,0.35)] transition-all duration-200 ease-out group-hover/avatar:translate-y-0 group-hover/avatar:opacity-100 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
      >
        {tip}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// All-in-one: renders initials/img + presence border + link + tooltip in one go
// ---------------------------------------------------------------------------
type PresenceAvatarProps = {
  username: string;
  userId?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  lastSeenAt?: string | Date | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  locale?: string | null;
  href?: string | null;
  variant?: "public" | "admin";
  className?: string;
};

const avatarDim: Record<string, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-20",
};
const avatarFont: Record<string, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-xl",
};

export function PresenceAvatar({
  username,
  userId,
  displayName,
  avatarUrl,
  lastSeenAt,
  size = "md",
  locale,
  href,
  variant = "public",
  className,
}: PresenceAvatarProps) {
  const resolvedHref =
    href !== undefined
      ? href
      : variant === "admin" && userId
        ? `/admin/users/${userId}`
        : `/players/${username}`;
  const dim = avatarDim[size] ?? avatarDim.md;
  const font = avatarFont[size] ?? avatarFont.md;
  const initials = (displayName ?? username).slice(0, 2).toUpperCase();

  const content = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt={displayName ?? username} loading="lazy" decoding="async" className={`${dim} object-cover`} />
  ) : (
    <span className={`inline-flex ${dim} items-center justify-center bg-raised font-display tracking-widest text-dim ${font}`}>{initials}</span>
  );

  return (
    <AvatarWithPresence lastSeenAt={lastSeenAt} size={size} locale={locale} href={resolvedHref} className={className}>
      {content}
    </AvatarWithPresence>
  );
}
