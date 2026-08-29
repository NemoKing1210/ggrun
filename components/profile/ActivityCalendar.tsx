"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { format } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";

type Day = { date: string; count: number };

function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

const levelClass: Record<number, string> = {
  0: "bg-[#1a1a18] border border-[#2a2a22]",
  1: "bg-amber/15 border border-amber/25",
  2: "bg-amber/30 border border-amber/40",
  3: "bg-amber/60 border border-amber/70",
  4: "bg-amber border border-amber",
};

function ActivityTooltip({
  anchorRef,
  open,
  label,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  label: string;
}) {
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  const update = useCallback(() => {
    const a = anchorRef.current;
    const t = tipRef.current;
    if (!a || !t) return;
    const ar = a.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    let top = ar.top - tr.height - gap;
    let left = ar.left + ar.width / 2 - tr.width / 2;
    // flip below if not enough space above
    if (top < 8) top = ar.bottom + gap;
    // clamp horizontally
    left = Math.max(8, Math.min(left, vw - tr.width - 8));
    setPos({ top, left, ready: true });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) setPos((p) => ({ ...p, ready: false }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, update, label]);

  useEffect(() => {
    if (!open || !tipRef.current) return;
    const ro = new ResizeObserver(() => update());
    ro.observe(tipRef.current);
    return () => ro.disconnect();
  }, [open, update]);

  if (!open) return null;
  return createPortal(
    <span
      ref={tipRef}
      role="tooltip"
      style={{ top: pos.top, left: pos.left }}
      className={`pointer-events-none fixed z-[100] border border-amber/60 bg-[#1e1c0a] px-3 py-1.5 font-mono text-xs font-semibold tracking-widest text-amber opacity-0 shadow-[0_4px_20px_rgba(0,0,0,0.7),0_0_14px_rgba(242,169,0,0.3)] transition-all duration-150 ease-out [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${pos.ready ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
    >
      {label}
    </span>,
    document.body,
  );
}

export function ActivityCalendar({ days }: { days: Day[] }) {
  const { t, locale } = useI18n();
  const act = t.profile.activity;
  const byDate: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of days) m[d.date] = d.count;
    return m;
  }, [days]);

  const total = useMemo(() => days.reduce((a, d) => a + d.count, 0), [days]);

  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const WEEKS = 53;
    const DAYS = WEEKS * 7;
    const start = new Date(today);
    start.setDate(start.getDate() - DAYS + 1);
    // align to Monday
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    const end = new Date(today);
    const endDay = end.getDay();
    const diffToSunday = (7 - endDay) % 7;
    const alignedEnd = new Date(end);
    alignedEnd.setDate(alignedEnd.getDate() + diffToSunday);

    const weeksArr: Array<Array<{ date: Date; key: string; count: number; future: boolean }>> = [];
    const cur = new Date(start);
    let week: typeof weeksArr[number] = [];
    while (cur <= alignedEnd) {
      const key = cur.toISOString().slice(0, 10);
      const count = byDate[key] ?? 0;
      const future = cur > today;
      week.push({ date: new Date(cur), key, count, future });
      if (week.length === 7) {
        weeksArr.push(week);
        week = [];
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (week.length) weeksArr.push(week);

    // month labels: for each week, if week contains 1st of month, label that month
    const monthFmt = new Intl.DateTimeFormat(locale ?? undefined, { month: "short" });
    const labels: Array<{ weekIdx: number; label: string }> = [];
    let lastMonth = -1;
    for (let i = 0; i < weeksArr.length; i++) {
      const w = weeksArr[i];
      for (const d of w) {
        if (d.date.getDate() <= 7) {
          const m = d.date.getMonth();
          if (m !== lastMonth) {
            lastMonth = m;
            // only label if this week is first occurrence of month
            // avoid duplicate if month spans two weeks with 1st-7th
            const existing = labels.find((l) => l.label === monthFmt.format(d.date));
            if (!existing || i - existing.weekIdx > 2) labels.push({ weekIdx: i, label: monthFmt.format(d.date) });
            break;
          }
        }
      }
    }
    return { weeks: weeksArr, monthLabels: labels };
  }, [byDate, locale]);

  const [active, setActive] = useState<string | null>(null);
  const anchorRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale ?? undefined, { day: "2-digit", month: "short", year: "numeric" }),
    [locale],
  );

  const getTooltipLabel = useCallback(
    (d: Date, count: number) => {
      const dateStr = dateFmt.format(d);
      if (count === 0) return format(act.noContrib, { date: dateStr });
      if (count === 1) return format(act.countOne, { date: dateStr });
      return format(act.countOther, { count: String(count), date: dateStr });
    },
    [act, dateFmt],
  );

  const hasData = total > 0;
  const activeCell = active ? weeks.flat().find((c) => c.key === active) ?? null : null;
  const activeAnchorRef = useMemo(
    () => ({ current: active ? (anchorRefs.current[active] ?? null) : null }) as React.RefObject<HTMLElement | null>,
    [active],
  );

  if (weeks.length === 0) return null;

  return (
    <section aria-label={act.title} className="hud-card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest">
          <span className="size-1.5 bg-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" aria-hidden />
          {act.title}
          <span className="hidden font-mono text-[10px] tracking-widest text-dim sm:inline">— {act.hint}</span>
        </h2>
        <span className="font-mono text-[11px] tracking-widest text-dim">
          {hasData ? format(act.total, { count: String(total) }) : act.noData}
        </span>
      </div>

      {/* months */}
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="min-w-[640px]">
          <div className="relative ml-7 flex gap-[3px] font-mono text-[10px] leading-none tracking-widest text-dim">
            {weeks.map((_, idx) => {
              const label = monthLabels.find((l) => l.weekIdx === idx)?.label;
              return (
                <span key={idx} className="w-[13px] shrink-0 text-left">
                  {label ?? ""}
                </span>
              );
            })}
          </div>

          <div className="mt-1 flex gap-3">
            {/* weekday labels */}
            <div className="flex shrink-0 flex-col gap-[3px] font-mono text-[10px] leading-none text-dim">
              <span className="h-[13px] leading-[13px]">Mon</span>
              <span className="h-[13px] leading-[13px]">&nbsp;</span>
              <span className="h-[13px] leading-[13px]">Wed</span>
              <span className="h-[13px] leading-[13px]">&nbsp;</span>
              <span className="h-[13px] leading-[13px]">Fri</span>
              <span className="h-[13px] leading-[13px]">&nbsp;</span>
              <span className="h-[13px] leading-[13px]">&nbsp;</span>
            </div>

            {/* grid */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) => {
                    const lvl = cell.future ? 0 : levelFor(cell.count);
                    const isActive = active === cell.key;
                    const title = getTooltipLabel(cell.date, cell.count);
                    return (
                      <span
                        key={cell.key}
                        ref={(el) => {
                          anchorRefs.current[cell.key] = el;
                        }}
                        role="gridcell"
                        aria-label={title}
                        tabIndex={0}
                        onMouseEnter={() => setActive(cell.key)}
                        onMouseLeave={() => setActive((cur) => (cur === cell.key ? null : cur))}
                        onFocus={() => setActive(cell.key)}
                        onBlur={() => setActive((cur) => (cur === cell.key ? null : cur))}
                        className={`size-[13px] shrink-0 cursor-pointer outline-none transition-colors [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${levelClass[lvl]} ${isActive ? "ring-1 ring-amber/60" : ""} ${cell.future ? "opacity-30" : ""}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* legend */}
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-dim/10 pt-2 font-mono text-[11px] tracking-widest text-dim">
            <span>{act.less}</span>
            <span className="flex items-center gap-[3px]">
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} className={`size-[13px] shrink-0 [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${levelClass[l]}`} aria-hidden />
              ))}
            </span>
            <span>{act.more}</span>
          </div>
        </div>
      </div>

      <ActivityTooltip anchorRef={activeAnchorRef} open={!!activeCell} label={activeCell ? getTooltipLabel(activeCell.date, activeCell.count) : ""} />
    </section>
  );
}
