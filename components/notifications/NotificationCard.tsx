"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { NotificationBroadcast } from "@/lib/realtime/protocol";

import { NotificationIcon } from "./icons";

export interface NotificationView {
  id: string;
  kind: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  severity: string;
  icon: string | null;
  imageUrl: string | null;
  href: string | null;
  actions: Array<{ id: string; labelKey: string; href?: string; style?: string }>;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const SEVERITY_BAR: Record<string, string> = {
  info: "bg-sky",
  success: "bg-success",
  warning: "bg-amber",
  danger: "bg-danger",
};

function strParams(params: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return out;
}

/** Resolves title/body/actions through the `notifications` dictionary. */
export function useNotificationText(item: NotificationView): {
  title: string;
  body: string;
  actions: Array<{ id: string; label: string; href?: string }>;
} {
  const { t } = useI18n();
  return useMemo(() => {
    const params = strParams(item.params);
    const titles = t.notifications.title as Record<string, string>;
    const bodies = t.notifications.body as Record<string, string>;
    const labels = t.notifications.actions as Record<string, string>;
    return {
      title: titles[item.titleKey] ? format(titles[item.titleKey], params) : item.kind,
      body: bodies[item.bodyKey] ? format(bodies[item.bodyKey], params) : "",
      actions: item.actions.map((a) => ({
        id: a.id,
        label: labels[a.labelKey] ?? a.labelKey,
        href: a.href,
      })),
    };
  }, [t, item]);
}

export function toView(b: NotificationBroadcast): NotificationView {
  return {
    id: b.id,
    kind: b.kind,
    titleKey: b.titleKey,
    bodyKey: b.bodyKey,
    params: b.params,
    severity: b.severity,
    icon: b.icon,
    imageUrl: b.imageUrl,
    href: b.href,
    actions: b.actions,
    data: b.data,
    readAt: b.readAt,
    createdAt: b.createdAt,
  };
}

/** One inbox card: accent bar, icon, title/body, image, action buttons. */
export function NotificationCard({
  item,
  unread,
  variant = "card",
  children,
}: {
  item: NotificationView;
  unread: boolean;
  /** `bare` drops the outer frame for nested surfaces (header dropdown). */
  variant?: "card" | "bare";
  children?: React.ReactNode;
}) {
  const { locale } = useI18n();
  const { title, body, actions } = useNotificationText(item);
  const bar = SEVERITY_BAR[item.severity] ?? SEVERITY_BAR.info;
  const time = (() => {
    const ms = Date.parse(item.createdAt);
    if (Number.isNaN(ms)) return null;
    return new Date(ms).toLocaleString(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  })();
  const frame =
    variant === "card"
      ? `hud-card hud-lift relative flex gap-3 p-3 pl-4 ${unread ? "border-amber/60" : ""}`
      : "relative flex gap-3 py-1 pl-3";
  const inner = (
    <article className={frame}>
      <span className={`absolute top-0 bottom-0 left-0 w-1 ${bar}`} aria-hidden />
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border border-line bg-black/40 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
        <NotificationIcon icon={item.icon} className="h-5 w-5 text-amber" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate font-display text-sm tracking-wider text-foreground uppercase">
            {title}
          </h3>
          {unread && <span className="h-1.5 w-1.5 shrink-0 bg-amber" aria-hidden />}
          {time && (
            <time className="ml-auto shrink-0 font-mono text-[10px] tracking-widest text-dim">
              {time}
            </time>
          )}
        </div>
        {body && <p className="mt-1 text-sm break-words text-dim">{body}</p>}
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="mt-2 h-16 w-16 border border-line object-cover" />
        )}
        {actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((a) =>
              a.href ? (
                <Link key={a.id} href={a.href} className="hud-btn !px-2 !py-1 text-[11px]">
                  {a.label}
                </Link>
              ) : (
                <span key={a.id} className="hud-btn !px-2 !py-1 text-[11px]">
                  {a.label}
                </span>
              ),
            )}
          </div>
        )}
        {children}
      </div>
    </article>
  );
  return item.href ? (
    <Link href={item.href} className="block no-underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}
