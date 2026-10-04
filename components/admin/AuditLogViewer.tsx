"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  EyeIcon,
  FingerPrintIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { AvatarWithPresence } from "@/components/ui/Presence";
import { AvatarFallback } from "@/components/ui/AvatarFallback";
import { actionMeta, auditActionLabel, auditFieldLabel, auditTargetLabel, describeAudit, isPlainObject, payloadSummary } from "@/components/admin/audit-meta";
import { useRealtime, useRealtimeConnects, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { AUDIT_ROOM } from "@/lib/realtime/protocol";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { AdminAuditRow, AuditPeriod } from "@/lib/infrastructure/events";

type FilterState = {
  q: string;
  action: string;
  target: string;
  period: AuditPeriod;
  page: number;
};

const PERIODS: AuditPeriod[] = ["24h", "7d", "30d", "all"];

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null) return <span className="font-mono text-xs italic text-dim">null</span>;
  if (typeof value === "string") return <span className="break-all font-mono text-xs text-zinc-300">&quot;{value}&quot;</span>;
  if (typeof value === "number") return <span className="font-mono text-xs text-amber">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="font-mono text-xs text-military">{String(value)}</span>;
  return <span className="font-mono text-xs text-zinc-400">{String(value)}</span>;
}

/** Recursive key/value tree for a payload — keys translated, no raw JSON blobs. */
function PayloadTree({ value, depth = 0, label }: { value: unknown; depth?: number; label?: (key: string) => string }) {
  const pad = depth * 14;
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="pl-0 font-mono text-xs text-dim">[ ]</p>;
    return (
      <div className="flex flex-col gap-1">
        {value.map((item, index) => (
          <div key={index} className="flex items-start gap-2" style={{ paddingLeft: pad }}>
            <span className="w-4 shrink-0 text-right font-mono text-[11px] leading-5 text-dim">{index}</span>
            {isPlainObject(item) || Array.isArray(item) ? (
              <div className="min-w-0 flex-1">
                <details className="group">
                  <summary className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-xs text-amber/80 transition-colors hover:text-amber">
                    <span className="text-dim transition-transform group-open:rotate-90">▸</span>
                    {Array.isArray(item) ? `array (${item.length})` : "object"}
                  </summary>
                  <PayloadTree value={item} depth={depth + 1} label={label} />
                </details>
              </div>
            ) : (
              <PrimitiveValue value={item} />
            )}
          </div>
        ))}
      </div>
    );
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return <p className="font-mono text-xs text-dim">{ }</p>;
    return (
      <div className="flex flex-col gap-1">
        {entries.map(([key, v]) => (
          <div key={key} className="flex items-start gap-2" style={{ paddingLeft: pad }}>
            <span className="shrink-0 font-mono text-xs leading-5 text-dim" title={key}>{label ? label(key) : key}</span>
            <span className="shrink-0 text-dim">:</span>
            <div className="min-w-0 flex-1">
              {isPlainObject(v) || Array.isArray(v) ? (
                <details className="group">
                  <summary className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-xs text-amber/80 transition-colors hover:text-amber">
                    <span className="text-dim transition-transform group-open:rotate-90">▸</span>
                    {Array.isArray(v) ? `array (${v.length})` : "object"}
                  </summary>
                  <PayloadTree value={v} depth={depth + 1} label={label} />
                </details>
              ) : (
                <PrimitiveValue value={v} />
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <PrimitiveValue value={value} />;
}

/** Actor username in the audit log — links to the admin profile for admins. */
function ActorName({
  actorId,
  username,
  isAdmin,
}: {
  actorId: string;
  username: string;
  isAdmin: boolean;
}) {
  if (!isAdmin) return <span className="text-zinc-300">{username}</span>;
  return (
    <Link
      href={`/admin/users/${actorId}`}
      onClick={(e) => e.stopPropagation()}
      className="text-zinc-300 transition-colors hover:text-amber"
    >
      {username}
    </Link>
  );
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error("clipboard unavailable"));
}

function exportCsv(
  rows: AdminAuditRow[],
  prefix: string,
  resolve: { action: (code: string) => string; target: (code: string) => string; summary: (entry: AdminAuditRow["entry"]) => string },
) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["time", "actor", "action", "action_code", "target", "target_type", "target_id", "entry_id", "summary", "payload"];
  const lines = rows.map(({ entry, username }) =>
    [
      esc(entry.createdAt.toISOString()),
      esc(username),
      esc(resolve.action(entry.actionType)),
      esc(entry.actionType),
      esc(resolve.target(entry.targetType)),
      esc(entry.targetType),
      esc(entry.targetId),
      esc(entry.id),
      esc(resolve.summary(entry)),
      esc(JSON.stringify(entry.payload ?? {})),
    ].join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  link.href = url;
  link.download = `${prefix}-${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Admin audit log viewer: server-driven filters (q/action/target/period live in
 * the URL so views stay shareable), debounced search, paginated table, CSV
 * export and a full-detail modal with a structured payload tree.
 */
export function AuditLogViewer({
  rows,
  total,
  pages,
  page,
  pageSize,
  actionTypes,
  targetTypes,
  filters,
  locale,
  isAdmin,
}: {
  rows: AdminAuditRow[];
  total: number;
  pages: number;
  page: number;
  pageSize: number;
  actionTypes: string[];
  targetTypes: string[];
  filters: { q: string; action: string; target: string; period: AuditPeriod };
  locale: Locale;
  isAdmin?: boolean;
}) {
  const { t } = useI18n();
  const a = t.admin.audit;
  const router = useRouter();
  const pathname = usePathname();
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState(filters.q);
  const [details, setDetails] = useState<AdminAuditRow | null>(null);
  const [copied, setCopied] = useState<"json" | "entry" | null>(null);
  const { connected } = useRealtime();
  const connects = useRealtimeConnects();
  /** Live rows arrived over the socket after the server snapshot — shown
   * immediately on page 1 when they match the active filters. */
  const [liveRows, setLiveRows] = useState<AdminAuditRow[]>([]);
  const liveIds = useMemo(() => new Set(liveRows.map((r) => r.entry.id)), [liveRows]);
  /** Entries that cannot be shown inline (other pages, unmatched filters). */
  const [pendingLive, setPendingLive] = useState(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pageRef = useRef(page);
  pageRef.current = page;
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;
  useRealtimeEvent(AUDIT_ROOM, "audit:created", (payload) => {
    const f = filtersRef.current;
    const row: AdminAuditRow = {
      entry: {
        id: payload.entry.id,
        actorId: payload.entry.actorId,
        actionType: payload.entry.actionType,
        targetType: payload.entry.targetType,
        targetId: payload.entry.targetId,
        payload: payload.entry.payload,
        createdAt: new Date(payload.entry.createdAt),
      },
      username: payload.username,
      avatarUrl: payload.avatarUrl,
      lastSeenAt: payload.lastSeenAt ? new Date(payload.lastSeenAt) : null,
    };
    // Only page 1 shows inline rows; free-text search cannot be matched
    // client-side, so those fall back to the refresh counter.
    if (pageRef.current !== 1) {
      setPendingLive((n) => n + 1);
      return;
    }
    if (f.q.trim()) {
      setPendingLive((n) => n + 1);
      return;
    }
    if (f.action && row.entry.actionType !== f.action) {
      setPendingLive((n) => n + 1);
      return;
    }
    if (f.target && row.entry.targetType !== f.target) {
      setPendingLive((n) => n + 1);
      return;
    }
    setLiveRows((prev) => {
      if (prev.some((r) => r.entry.id === row.entry.id)) return prev;
      return [row, ...prev].slice(0, pageSizeRef.current);
    });
  });

  // Server snapshot arrived (refresh / filter / page change) — drop live
  // rows it already contains so they never render twice.
  const serverIds = useMemo(() => new Set(rows.map((r) => r.entry.id)), [rows]);
  useEffect(() => {
    setLiveRows((prev) => (prev.length === 0 ? prev : prev.filter((r) => !serverIds.has(r.entry.id))));
  }, [serverIds]);

  // Reconnect refresh: rows written while offline never arrive over the
  // socket and the counter above cannot know about them — reload the
  // server snapshot on every fresh connect instead of showing a stale list.
  const lastConnectSeen = useRef(connects);
  useEffect(() => {
    if (lastConnectSeen.current === connects) return;
    lastConnectSeen.current = connects;
    router.refresh();
  });

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }),
    [locale],
  );
  const fullDateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "long" }),
    [locale],
  );
  const actionLabel = (code: string) => auditActionLabel(code, a);
  const targetLabel = (code: string) => auditTargetLabel(code, a);
  const summary = (entry: AdminAuditRow["entry"]) =>
    describeAudit({ actionType: entry.actionType, payload: (entry.payload ?? {}) as Record<string, unknown> }, a);


  const apply = (next: FilterState) => {
    // New server snapshot is coming — live backlog no longer applies.
    setPendingLive(0);
    setLiveRows([]);
    const params = new URLSearchParams();
    const trimmed = next.q.trim();
    if (trimmed) params.set("q", trimmed);
    if (next.action) params.set("action", next.action);
    if (next.target) params.set("target", next.target);
    if (next.period !== "all") params.set("period", next.period);
    if (next.page > 1) params.set("page", String(next.page));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Debounced text search; other controls apply instantly.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (q.trim() === filters.q) return;
      apply({ q, action: filters.action, target: filters.target, period: filters.period, page: 1 });
    }, 280);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // "/" focuses the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      e.preventDefault();
      searchBoxRef.current?.querySelector("input")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const hasFilters = Boolean(q.trim() || filters.action || filters.target || filters.period !== "all");
  const visibleRows = page === 1 ? [...liveRows, ...rows].slice(0, pageSize) : rows;
  const liveTotal = total + (page === 1 ? liveRows.length : 0);
  const from = liveTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = liveTotal === 0 ? 0 : (page - 1) * pageSize + visibleRows.length;
  const copiedTimer = useRef<number | null>(null);
  const flashCopied = (kind: "json" | "entry") => {
    setCopied(kind);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1500);
  };

  const onCopy = async (kind: "json" | "entry", text: string) => {
    try {
      await copyText(text);
      flashCopied(kind);
    } catch {
      // Clipboard blocked — silently ignore.
    }
  };

  const selected = details;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <section className="hud-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]">
          <Field label={a.searchLabel}>
            <div className="relative" ref={searchBoxRef} onClick={() => searchBoxRef.current?.querySelector("input")?.focus()}>
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={a.searchPlaceholder}
                className="pl-9 pr-10"
                aria-label={a.searchPlaceholder}
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border border-dim/30 bg-[#33332b] px-1.5 font-mono text-[10px] text-dim">
                /
              </kbd>
            </div>
          </Field>
          <Field label={a.actionLabel}>
            <Select
              value={filters.action}
              onChange={(e) => apply({ q, action: e.target.value, target: filters.target, period: filters.period, page: 1 })}
            >
              <option value="">{a.allActions}</option>
              {actionTypes.map((value) => (
                <option key={value} value={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={a.targetLabel}>
            <Select
              value={filters.target}
              onChange={(e) => apply({ q, action: filters.action, target: e.target.value, period: filters.period, page: 1 })}
            >
              <option value="">{a.allTargets}</option>
              {targetTypes.map((value) => (
                <option key={value} value={value}>
                  {targetLabel(value)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-dim">{a.timeLabel}</span>
            {PERIODS.map((period) => (
              <Chip
                key={period}
                size="sm"
                active={filters.period === period}
                onClick={() => apply({ q, action: filters.action, target: filters.target, period, page: 1 })}
              >
                {a.periods[period]}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  router.push(pathname, { scroll: false });
                }}
                className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs !text-dim hover:!text-amber"
              >
                <XMarkIcon className="size-3.5" aria-hidden />
                {a.clear}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setPendingLive(0); setLiveRows([]); router.refresh(); }}
              className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            >
              <ArrowPathIcon className="size-3.5" aria-hidden />
              {a.refresh}
            </button>
            {pendingLive > 0 && (
              <button
                type="button"
                onClick={() => { setPendingLive(0); setLiveRows([]); router.refresh(); }}
                className="inline-flex items-center gap-1.5 border border-amber/40 bg-amber px-2.5 py-1.5 font-mono text-xs uppercase tracking-widest text-black shadow-[0_0_12px_rgba(242,169,0,0.35)] hover:bg-amber/90 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
              >
                <span className="size-1.5 rounded-full bg-black animate-pulse" aria-hidden />
                {format(a.newEntries, { count: String(pendingLive) })}
              </button>
            )}
            <button
              type="button"
              onClick={() => exportCsv(visibleRows, "audit", { action: actionLabel, target: targetLabel, summary })}
              className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
              disabled={visibleRows.length === 0}
            >
              <ArrowDownTrayIcon className="size-3.5" aria-hidden />
              {a.exportCsv}
            </button>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="hud-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <h2 className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-wider">
            <ClockIcon className="size-4 text-amber" aria-hidden />
            {a.heading}
            <span
              className={
                connected
                  ? "inline-flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400"
                  : "inline-flex items-center gap-1.5 border border-dim/20 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-dim"
              }
            >
              <span className={connected ? "size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" : "size-1.5 rounded-full bg-dim/50"} aria-hidden />
              {a.live}
            </span>
          </h2>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-dim">
            <span className="text-amber">{format(a.range, { from, to, total: liveTotal })}</span>
            <span>{format(a.pageOf, { page, pages })}</span>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="m-4 border border-dashed border-dim/20 bg-background/20 p-10 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <FingerPrintIcon className="mx-auto size-7 text-dim" aria-hidden />
            <p className="mt-3 font-mono text-xs uppercase tracking-widest text-dim">
              {hasFilters ? a.noResults : a.empty}
            </p>
            {hasFilters && (
              <button type="button" onClick={() => { setQ(""); router.push(pathname, { scroll: false }); }} className="hud-btn mt-4 !px-3 !py-1.5 text-xs">
                {a.clear}
              </button>
            )}
          </div>
        ) : (
          <div className="max-h-[calc(100vh-16rem)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#26261f] text-left shadow-[0_1px_0_#3d3d34]">
                <tr>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest whitespace-nowrap">{a.colTime}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{a.colWho}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{a.colAction}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{a.colTarget}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{a.colPayload}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest text-right">{a.detailsButton}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ entry, username, avatarUrl, lastSeenAt }) => {
                  const meta = actionMeta(entry.actionType);
                  const Icon = meta.icon;
                  const payload = (entry.payload ?? {}) as Record<string, unknown>;
                  const isLive = liveIds.has(entry.id);
                  return (
                    <tr
                      key={entry.id}
                      className={
                        isLive
                          ? "group cursor-pointer border-b border-amber/40 bg-amber/[0.07] shadow-[inset_2px_0_0_0_#f2a900] transition-colors hover:bg-amber/[0.12]"
                          : "group cursor-pointer border-b border-[#2a2a22] transition-colors hover:bg-amber/[0.05]"
                      }
                      onClick={() => setDetails({ entry, username, avatarUrl, lastSeenAt })}
                    >
                      <td className="p-3 font-mono text-xs whitespace-nowrap text-amber/80">
                        <span className="inline-flex items-center gap-2">
                          {dateFmt.format(entry.createdAt)}
                          {isLive && (
                            <span className="border border-amber/50 bg-amber/15 px-1 py-px font-mono text-[9px] uppercase tracking-widest text-amber">
                              {a.isNew}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold">
                          <AvatarWithPresence lastSeenAt={lastSeenAt} size="sm" href={isAdmin ? `/admin/users/${entry.actorId}` : null}>
                            {avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatarUrl} alt={username} className="size-5 object-cover" />
                            ) : (
                              <AvatarFallback seed={entry.actorId ?? username} name={username} className="size-5" emojiClassName="text-[11px]" />
                            )}
                          </AvatarWithPresence>
                          <span className="text-zinc-300">
                            <ActorName actorId={entry.actorId} username={username} isAdmin={isAdmin ?? false} />
                          </span>
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge variant={meta.variant} size="sm" className="gap-1" title={entry.actionType}>
                          <Icon className="size-3" aria-hidden />
                          {actionLabel(entry.actionType)}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 font-mono text-xs" title={entry.targetType}>
                          <span className="border border-dim/30 bg-background/60 px-1.5 py-0.5 text-zinc-300 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                            {targetLabel(entry.targetType)}
                          </span>
                          {entry.targetId ? <span className="text-dim">:{entry.targetId.slice(0, 8)}</span> : null}
                        </span>
                      </td>
                      <td className="max-w-[280px] p-3 font-mono text-xs text-dim">
                        <span className="block truncate" title={payloadSummary(payload)}>
                          {Object.keys(payload).length === 0 ? a.summaryEmpty : summary(entry)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetails({ entry, username, avatarUrl, lastSeenAt });
                          }}
                          className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]"
                          aria-label={a.detailsButton}
                        >
                          <EyeIcon className="size-3.5" aria-hidden />
                          {a.detailsButton}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-[#3d3d34] bg-raised/40 px-4 py-3">
            <button
              type="button"
              onClick={() => apply({ q, action: filters.action, target: filters.target, period: filters.period, page: page - 1 })}
              disabled={page <= 1}
              className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
              aria-label={a.prevPage}
            >
              <ChevronLeftIcon className="size-3.5" aria-hidden />
              {a.prevPage}
            </button>
            <span className="font-mono text-[11px] tracking-widest text-dim">
              {format(a.pageOf, { page, pages })}
            </span>
            <button
              type="button"
              onClick={() => apply({ q, action: filters.action, target: filters.target, period: filters.period, page: page + 1 })}
              disabled={page >= pages}
              className="hud-btn inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
              aria-label={a.nextPage}
            >
              {a.nextPage}
              <ChevronRightIcon className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </section>

      {/* Detail modal */}
      {selected && (
        <EntryModal
          row={selected}
          a={a}
          fullDateFmt={fullDateFmt}
          copied={copied}
          onCopy={onCopy}
          onClose={() => setDetails(null)}
          isAdmin={isAdmin ?? false}
        />
      )}
    </div>
  );
}

function EntryModal({
  row,
  a,
  fullDateFmt,
  copied,
  onCopy,
  onClose,
  isAdmin,
}: {
  row: AdminAuditRow;
  a: ReturnType<typeof useI18n>["t"]["admin"]["audit"];
  fullDateFmt: Intl.DateTimeFormat;
  copied: "json" | "entry" | null;
  onCopy: (kind: "json" | "entry", text: string) => void;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const { entry, username, avatarUrl, lastSeenAt } = row;
  const meta = actionMeta(entry.actionType);
  const Icon = meta.icon;
  const payload = (entry.payload ?? {}) as Record<string, unknown>;
  const rawJson = JSON.stringify(payload, null, 2);
  const hasPayload = Object.keys(payload).length > 0;

  return (
    <Modal open onClose={onClose} panelClassName="max-w-2xl" labelledBy={a.modalTitle}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center border border-amber/40 bg-amber/10 text-amber shadow-[0_0_14px_rgba(251,191,36,0.18)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={a.modalTitle} className="font-display text-xl leading-none tracking-wider text-zinc-100 uppercase">
              {auditActionLabel(entry.actionType, a)}
            </h2>
            <p className="mt-1.5 font-mono text-[11px] tracking-widest text-dim uppercase">
              {fullDateFmt.format(entry.createdAt)} · {format(a.rawCode, { code: entry.actionType })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onCopy("json", rawJson)}
            disabled={!hasPayload}
            className="hud-btn inline-flex items-center gap-1.5 !px-2 !py-1 text-[11px]"
          >
            {copied === "json" ? (
              <>
                <CheckIcon className="size-3.5 text-military" aria-hidden />
                {a.copied}
              </>
            ) : (
              <>
                <ClipboardDocumentIcon className="size-3.5" aria-hidden />
                {a.copyJson}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="hud-btn !p-2 !text-dim hover:!text-amber"
            aria-label={a.close}
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="hazard-tape my-4 opacity-70" aria-hidden />

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <dt className="font-display text-[10px] tracking-widest text-dim uppercase">{a.actorLabel}</dt>
          <dd className="mt-1 inline-flex items-center gap-2 font-mono text-sm">
            <AvatarWithPresence lastSeenAt={lastSeenAt} size="sm" href={isAdmin ? `/admin/users/${entry.actorId}` : null}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={username} className="size-5 object-cover" />
              ) : (
                <AvatarFallback seed={entry.actorId ?? username} name={username} className="size-5" emojiClassName="text-[11px]" />
              )}
            </AvatarWithPresence>
            <span className="text-zinc-200">
              <ActorName actorId={entry.actorId} username={username} isAdmin={isAdmin} />
            </span>
          </dd>
          <dd className="mt-1 font-mono text-[11px] text-dim">id: {entry.actorId}</dd>
        </div>

        <div className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <dt className="font-display text-[10px] tracking-widest text-dim uppercase">{a.actionLabel}</dt>
          <dd className="mt-1">
            <Badge variant={meta.variant} size="sm" className="gap-1" title={entry.actionType}>
              <Icon className="size-3" aria-hidden />
              {auditActionLabel(entry.actionType, a)}
            </Badge>
            <p className="mt-1 font-mono text-[11px] text-dim">{format(a.rawCode, { code: entry.actionType })}</p>
          </dd>
        </div>

        <div className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <dt className="font-display text-[10px] tracking-widest text-dim uppercase">{a.targetLabel}</dt>
          <dd className="mt-1 flex items-center gap-2">
            <span className="border border-dim/30 bg-background/60 px-1.5 py-0.5 font-mono text-xs text-zinc-300 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" title={entry.targetType}>
              {auditTargetLabel(entry.targetType, a)}
            </span>
            {entry.targetId ? (
              <button
                type="button"
                onClick={() => onCopy("entry", entry.targetId ?? "")}
                className="group inline-flex items-center gap-1 font-mono text-xs text-amber/80 transition-colors hover:text-amber"
                title={entry.targetId}
              >
                {entry.targetId}
                {copied === "entry" ? (
                  <CheckIcon className="size-3.5 text-military" aria-hidden />
                ) : (
                  <ClipboardDocumentIcon className="size-3.5 text-dim transition-colors group-hover:text-amber" aria-hidden />
                )}
              </button>
            ) : (
              <span className="font-mono text-xs text-dim">—</span>
            )}
          </dd>
        </div>

        <div className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <dt className="font-display text-[10px] tracking-widest text-dim uppercase">{a.entryIdLabel}</dt>
          <dd className="mt-1 font-mono text-xs text-zinc-300">{entry.id}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <h3 className="inline-flex items-center gap-2 font-display text-xs tracking-widest text-zinc-300 uppercase">
          <ClipboardDocumentIcon className="size-4 text-amber" aria-hidden />
          {a.payloadLabel}
        </h3>
        <div className="mt-2 max-h-72 overflow-auto border border-[#3d3d34] bg-[#131312] p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          {hasPayload ? (
            <PayloadTree value={payload} label={(key) => auditFieldLabel(key, a)} />
          ) : (
            <p className="font-mono text-xs text-dim">{a.payloadEmpty}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}