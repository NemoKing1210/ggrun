"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
// Portal tooltip — teleported to document.body so no overflow:hidden parent
// can clip it. Fixed position, centered above anchor, flips below if needed.
// ---------------------------------------------------------------------------
function PresencePortalTip({
  anchorRef,
  open,
  children,
  online,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  children: React.ReactNode;
  online?: boolean;
}) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  const update = useCallback(() => {
    const a = anchorRef.current;
    const t = tipRef.current;
    if (!a || !t) return;
    const ar = a.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const gap = 8;
    const pad = 8;
    let top = ar.top - tr.height - gap;
    let left = ar.left + ar.width / 2 - tr.width / 2;
    // clamp horizontally inside viewport
    const minLeft = pad;
    const maxLeft = window.innerWidth - tr.width - pad;
    left = Math.max(minLeft, Math.min(left, maxLeft));
    // flip below if not enough room above
    if (top < pad) top = ar.bottom + gap;
    const maxTop = window.innerHeight - tr.height - pad;
    if (top > maxTop) top = Math.max(pad, maxTop);
    setPos({ top, left, ready: true });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      setPos((p) => ({ ...p, ready: false }));
      return;
    }
    const raf = requestAnimationFrame(update);
    const onScroll = () => update();
    const onResize = () => update();
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, update, children]);

  useEffect(() => {
    if (!open || !tipRef.current) return;
    const ro = new ResizeObserver(() => update());
    ro.observe(tipRef.current);
    return () => ro.disconnect();
  }, [open, update]);

  if (!open || typeof document === "undefined") return null;

  const toneClass = online
    ? "border-military bg-[#1c2416] text-military shadow-[0_4px_20px_rgba(0,0,0,0.7),0_0_16px_rgba(124,143,74,0.35)]"
    : "border-[#3d3d34] bg-[#1e1e1c] text-dim shadow-[0_4px_20px_rgba(0,0,0,0.7),0_0_12px_rgba(0,0,0,0.4)]";

  return createPortal(
    <span
      ref={tipRef}
      role="tooltip"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        opacity: pos.ready ? 1 : 0,
        transform: pos.ready ? "translateY(0)" : "translateY(4px)",
        transition: "opacity 150ms ease, transform 150ms ease",
      }}
      className={`pointer-events-none z-[100] whitespace-nowrap border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${toneClass}`}
    >
      {children}
    </span>,
    document.body,
  );
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
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-block shrink-0 leading-none"
      >
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
      </span>
      <PresencePortalTip anchorRef={anchorRef} open={open} online={online}>
        {tip}
      </PresencePortalTip>
    </>
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
  void tip;
  const { t } = useI18n();
  const pr = t.profile.presence;
  const online = isOnline(lastSeenAt);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

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

  const tooltipText = lastSeenAt ? new Date(lastSeenAt).toLocaleString(locale ?? undefined) : pr.never;

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={
          variant === "hud"
            ? "inline-flex items-center gap-1.5 border border-dim/20 bg-raised px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
            : "inline-flex items-center gap-1.5 font-mono text-xs text-dim"
        }
      >
        {showDot ? <span className="size-1.5 bg-zinc-500" aria-hidden /> : null}
        {timeText}
      </span>
      <PresencePortalTip anchorRef={anchorRef} open={open} online={false}>
        {tooltipText}
      </PresencePortalTip>
    </>
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

const sizeToPad: Record<string, string> = {
  sm: "p-0.5",
  md: "p-1",
  lg: "p-1",
  xl: "p-1",
};

export function AvatarWithPresence({ lastSeenAt, children, size = "md", locale, href, className }: AvatarWithPresenceProps) {
  const online = isOnline(lastSeenAt);
  const tip = usePresenceTip(lastSeenAt, locale);
  const borderW = sizeToBorder[size] ?? "border-2";
  const clip = sizeToClip[size] ?? sizeToClip.md;
  const pad = sizeToPad[size] ?? "p-0.5";
  const borderState = online ? "border-military" : "border-[#3d3d34]";
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const frameClass = ["inline-flex shrink-0 overflow-hidden bg-raised", borderW, borderState, pad, clip, className ?? ""]
    .filter(Boolean)
    .join(" ");

  const inner = <span className={frameClass}>{children}</span>;

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex shrink-0 leading-none"
      >
        {href ? (
          <Link
            href={href}
            className="inline-flex shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {inner}
          </Link>
        ) : (
          inner
        )}
      </span>
      <PresencePortalTip anchorRef={anchorRef} open={open} online={online}>
        {tip}
      </PresencePortalTip>
    </>
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
