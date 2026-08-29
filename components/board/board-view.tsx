"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowsRightLeftIcon,
  Bars3Icon,
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  FlagIcon,
  GiftIcon,
  PuzzlePieceIcon,
  QueueListIcon,
  SignalIcon,
  SparklesIcon,
  Squares2X2Icon,
  TrophyIcon,
  UserGroupIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import type { BoardCell, SeasonPlayer } from "@/db/schema";

import { CELL_THEME } from "./cell-theme";
import { Modal } from "@/components/ui/Modal";
import { format } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { AvatarWithPresence } from "@/components/ui/Presence";

export type BoardPlayer = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  position: number;
  balancePoints: number;
  status: SeasonPlayer["status"];
  streakPass: number;
  streakDrop: number;
  rerollsUsed: number;
};

export type BoardRoll = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  gameTitle: string | null;
  platform: string | null;
  rolledAt: string;
};

export type BoardStats = {
  totalMoves: number;
  passedRolls: number;
  droppedRolls: number;
  rerolls: number;
};

type ViewMode = "grid" | "linear";
const VIEW_STORAGE_KEY = "ggrun.board.viewMode";

function formatDuration(ms: number, units: Record<"d" | "h" | "m" | "s", string>) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}${units.d} ${h}${units.h}`;
  if (h > 0) return `${h}${units.h} ${m}${units.m}`;
  if (m > 0) return `${m}${units.m} ${s}${units.s}`;
  return `${s}${units.s}`;
}

function Avatar({
  username,
  displayName,
  avatarUrl,
  className,
}: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName ?? username}
        className={`${className ?? "size-7"} border border-dim/40 object-cover [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]`}
      />
    );
  }
  return (
    <span
      title={displayName ?? username}
      className={`${className ?? "size-7"} inline-flex items-center justify-center border border-dim/50 bg-[#1e1e1c] font-mono text-[10px] leading-none text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]`}
    >
      {(displayName ?? username).slice(0, 2).toUpperCase()}
    </span>
  );
}

function CellAvatarStack({ occupants }: { occupants: BoardPlayer[] }) {
  const shown = occupants.slice(0, 4);
  return (
    <span className="flex -space-x-1.5">
      {shown.map((p) => (
        <AvatarWithPresence key={p.username} lastSeenAt={p.lastSeenAt} size="sm">
          <Avatar {...p} className="size-6 ring-1 ring-background" />
        </AvatarWithPresence>
      ))}
      {occupants.length > shown.length ? (
        <span className="inline-flex size-6 items-center justify-center border border-dim/50 bg-raised font-mono text-[9px] leading-none text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
          +{occupants.length - shown.length}
        </span>
      ) : null}
    </span>
  );
}

function StatTile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="hud-card relative overflow-hidden px-3 py-2.5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent" aria-hidden />
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
        <Icon className="size-3.5 opacity-60" aria-hidden />
        {label}
      </div>
      <div
        className={`ammo-counter mt-1 truncate font-display text-lg leading-none ${accent ? "text-amber" : "text-foreground"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function CellTypeIcon({
  type,
  className,
}: {
  type: BoardCell["cellType"];
  className?: string;
}) {
  const cls = className ?? "size-3.5";
  switch (type) {
    case "start":
      return <FlagIcon className={cls} aria-hidden />;
    case "finish":
      return <TrophyIcon className={cls} aria-hidden />;
    case "penalty":
      return <FireIcon className={cls} aria-hidden />;
    case "bonus":
      return <GiftIcon className={cls} aria-hidden />;
    case "teleport":
      return <ArrowsRightLeftIcon className={cls} aria-hidden />;
    case "event":
      return <BoltIcon className={cls} aria-hidden />;
    case "custom":
      return <PuzzlePieceIcon className={cls} aria-hidden />;
    default:
      return <SignalIcon className={cls + " opacity-40"} aria-hidden />;
  }
}

function CellWatermark({
  type,
}: {
  type: BoardCell["cellType"];
}) {
  if (type === "normal") return null;
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]">
      <CellTypeIcon type={type} className="size-12 sm:size-14" />
    </span>
  );
}

function MicroEffectBadge({ cell }: { cell: BoardCell }) {
  const cfg = (cell.config ?? {}) as Record<string, unknown>;
  let text: string | null = null;
  let tone = "text-dim border-dim/30 bg-background/60";
  if ((cell.cellType === "penalty" || cell.cellType === "bonus") && typeof cfg.amount === "number") {
    const n = cfg.amount as number;
    text = n > 0 ? `+${n}` : `${n}`;
    tone = cell.cellType === "bonus" ? "text-emerald-300 border-emerald-600/40 bg-emerald-950/40" : "text-red-300 border-red-600/40 bg-red-950/40";
  } else if (cell.cellType === "teleport" && typeof cfg.target === "number") {
    text = `→ ${cfg.target}`;
    tone = "text-violet-300 border-violet-500/40 bg-violet-950/40";
  } else if (cell.cellType === "event") {
    text = "!?";
    tone = "text-sky-300 border-sky-500/40 bg-sky-950/40";
  } else if (cell.cellType === "custom" && typeof cfg.effectKey === "string") {
    text = String(cfg.effectKey).slice(0, 10);
    tone = "text-zinc-300 border-zinc-600/40 bg-zinc-800/50";
  }
  if (!text) return null;
  return (
    <span
      className={`pointer-events-none inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-widest ${tone} [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]`}
    >
      {text}
    </span>
  );
}

export function BoardView({
  cells,
  players,
  rolls,
  stats,
  seasonStartedAt,
}: {
  cells: BoardCell[];
  players: BoardPlayer[];
  rolls: BoardRoll[];
  stats: BoardStats;
  seasonStartedAt: string | null;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ViewMode>("grid");
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(6);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "grid" || saved === "linear") setMode(saved);
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) setCols(Math.min(8, Math.max(3, Math.floor(w / 148))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const changeMode = (next: ViewMode) => {
    setMode(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  useEffect(() => {
    if (selectedPos === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedPos(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPos]);

  const byPosition = useMemo(() => {
    const acc: Record<number, BoardPlayer[]> = {};
    for (const p of players) {
      (acc[p.position] ??= []).push(p);
    }
    return acc;
  }, [players]);

  const leader = useMemo(
    () =>
      players.reduce<BoardPlayer | null>(
        (best, p) =>
          !best ||
          p.position > best.position ||
          (p.position === best.position && p.balancePoints > best.balancePoints)
            ? p
            : best,
        null,
      ),
    [players],
  );

  const activeCount = players.filter((p) => p.status === "active").length;

  const rows: BoardCell[][] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));

  const selectedIndex = selectedPos === null ? -1 : cells.findIndex((c) => c.position === selectedPos);
  const selected = selectedIndex >= 0 ? cells[selectedIndex] : null;

  const stepSelection = (delta: 1 | -1) => {
    if (selectedIndex < 0) return;
    const nextIndex = Math.min(cells.length - 1, Math.max(0, selectedIndex + delta));
    setSelectedPos(cells[nextIndex].position);
  };

  const uptime = now !== null && seasonStartedAt ? formatDuration(now - new Date(seasonStartedAt).getTime(), t.board.units) : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Event status */}
      <section aria-label={t.board.stats.title}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <StatTile label={t.board.stats.uptime} value={uptime} accent icon={ClockIcon} />
          <StatTile label={t.board.stats.participants} value={`${activeCount}/${players.length}`} icon={UserGroupIcon} />
          <StatTile label={t.board.stats.moves} value={String(stats.totalMoves)} icon={SignalIcon} />
          <StatTile label={t.board.stats.passed} value={String(stats.passedRolls)} accent icon={CheckCircleIcon} />
          <StatTile label={t.board.stats.dropped} value={String(stats.droppedRolls)} icon={XCircleIcon} />
          <StatTile label={t.board.stats.rerolls} value={String(stats.rerolls)} icon={ArrowPathIcon} />
          <StatTile
            label={t.board.stats.leader}
            value={leader ? (leader.displayName ?? leader.username) : t.board.stats.noLeader}
            accent
            icon={TrophyIcon}
          />
        </div>
      </section>

      {/* Playing right now */}
      <section aria-label={t.board.live.title} className="hud-card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest">
            <span className="relative inline-flex size-2.5 items-center justify-center" aria-hidden>
              <span className="absolute inline-flex size-2.5 animate-ping bg-amber opacity-40 [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" />
              <span className="relative inline-block size-2 bg-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" />
            </span>
            {t.board.live.title}
            <span className="hidden font-mono text-[10px] tracking-widest text-dim sm:inline">— LIVE FEED</span>
          </h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:block">
            {rolls.length} {rolls.length === 1 ? "player" : "players"} in run
          </span>
        </div>

        {rolls.length === 0 ? (
          <p className="border border-dashed border-dim/20 bg-background/40 px-3 py-6 text-center font-mono text-xs tracking-wide text-dim">
            {t.board.live.empty}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rolls.map((r) => (
              <li key={r.username} className="hud-card group flex items-center gap-3 p-3 transition-colors hover:border-amber/40">
                <div className="absolute inset-x-0 top-0 h-px bg-amber/0 transition-colors group-hover:bg-amber/30" aria-hidden />
                <AvatarWithPresence lastSeenAt={r.lastSeenAt} size="sm">
                  <Avatar username={r.username} displayName={r.displayName} avatarUrl={r.avatarUrl} />
                </AvatarWithPresence>
                <div className="min-w-0 flex-1">
                  <Link href={`/players/${r.username}`} className="block truncate font-mono text-xs font-semibold tracking-wide text-amber hover:underline">
                    {r.displayName ?? r.username}
                  </Link>
                  <div className="truncate text-sm leading-tight" title={r.gameTitle ?? undefined}>
                    {r.gameTitle ?? t.board.live.unknownGame}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {r.platform ? (
                      <span className="border border-dim/40 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] leading-none uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                        {r.platform}
                      </span>
                    ) : null}
                    <span className="ammo-counter font-mono text-[11px] leading-none text-dim">
                      {now !== null ? format(t.board.live.since, { time: formatDuration(now - new Date(r.rolledAt).getTime(), t.board.units) }) : ""}
                    </span>
                  </div>
                </div>
                <span className="hidden size-1.5 shrink-0 bg-amber opacity-60 group-hover:opacity-100 sm:inline-block [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" aria-hidden />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-none border border-[#3d3d34] bg-raised p-1 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <button
            type="button"
            onClick={() => changeMode("grid")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-display text-xs uppercase tracking-widest transition-colors [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${mode === "grid" ? "bg-amber text-black shadow-[0_0_8px_rgba(242,169,0,0.35)]" : "bg-transparent text-dim hover:bg-white/5 hover:text-foreground"}`}
            aria-pressed={mode === "grid"}
          >
            <Squares2X2Icon className="size-3.5" aria-hidden />
            {t.board.view.grid}
          </button>
          <button
            type="button"
            onClick={() => changeMode("linear")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-display text-xs uppercase tracking-widest transition-colors [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${mode === "linear" ? "bg-amber text-black shadow-[0_0_8px_rgba(242,169,0,0.35)]" : "bg-transparent text-dim hover:bg-white/5 hover:text-foreground"}`}
            aria-pressed={mode === "linear"}
          >
            <QueueListIcon className="size-3.5" aria-hidden />
            {t.board.view.linear}
          </button>
        </div>
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dim">
          <span className="hidden size-1 bg-amber sm:inline-block [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
          {t.board.view.hint}
        </span>
      </div>

      {/* Board */}
      <div className="hud-card overflow-hidden bg-[#121210] p-2 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#2a2a22] pb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            {"// TRACK MAP "}<span className="text-amber">[{String(cells.length).padStart(2, "0")} CELLS]</span>
          </span>
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
            <span className="flex items-center gap-1">
              <Bars3Icon className="size-3" aria-hidden /> {cols} cols
            </span>
            <span className="hidden h-3 w-px bg-dim/30 sm:block" aria-hidden />
            <span className="hidden sm:inline">click cell for intel</span>
          </span>
        </div>

        {mode === "grid" ? (
          <div ref={gridRef} className="w-full">
            <div className="flex flex-col gap-2 sm:gap-2.5">
              {rows.map((row, ri) => (
                <ol key={ri} className={`flex gap-2 sm:gap-2.5 ${ri % 2 === 1 ? "flex-row-reverse" : ""}`}>
                  {row.map((cell) => {
                    const theme = CELL_THEME[cell.cellType];
                    const here = byPosition[cell.position] ?? [];
                    const isSpecial = cell.cellType !== "normal";
                    return (
                      <li key={cell.id} className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setSelectedPos(cell.position)}
                          className={`group relative flex aspect-square w-full flex-col justify-between overflow-hidden border p-2 text-left transition-all hover:-translate-y-0.5 hover:brightness-[1.12] hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${theme.box} ${cell.cellType === "start" || cell.cellType === "finish" ? "ring-1 ring-amber/30" : ""}`}
                        >
                          <CellWatermark type={cell.cellType} />
                          {/* top */}
                          <span className="relative flex items-start justify-between gap-1">
                            <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${isSpecial ? "text-foreground/90" : "text-dim"}`}>
                              <CellTypeIcon type={cell.cellType} className="size-3.5 opacity-80" />
                              <span className="hidden truncate sm:inline">{cell.label ?? t.core.cellTypes[cell.cellType]}</span>
                              <span className="truncate sm:hidden">{(cell.label ?? t.core.cellTypes[cell.cellType]).slice(0, 3)}</span>
                            </span>
                            {isSpecial ? <span className={`size-1.5 shrink-0 ${theme.dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden /> : null}
                          </span>

                          {/* micro badge centered if special */}
                          <span className="pointer-events-none absolute left-1/2 top-[46%] hidden -translate-x-1/2 -translate-y-1/2 sm:inline-flex">
                            {isSpecial ? <MicroEffectBadge cell={cell} /> : null}
                          </span>

                          {/* position */}
                          <span className="relative flex items-end justify-between gap-1">
                            {here.length > 0 ? (
                              <span className="absolute -bottom-0.5 -left-0.5">
                                <CellAvatarStack occupants={here} />
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="ammo-counter ml-auto text-xl leading-none tracking-tight sm:text-2xl">
                              {String(cell.position).padStart(2, "0")}
                            </span>
                          </span>

                          {/* hover corner */}
                          <span className="pointer-events-none absolute right-0 top-0 size-3 border-r border-t border-amber/0 transition-colors group-hover:border-amber/50" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {cells.map((cell) => {
              const theme = CELL_THEME[cell.cellType];
              const here = byPosition[cell.position] ?? [];
              const isSpecial = cell.cellType !== "normal";
              return (
                <li key={cell.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPos(cell.position)}
                    className={`group relative flex w-full items-center gap-3 border bg-raised px-3 py-2.5 text-left transition-all hover:brightness-[1.08] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${theme.box} border-l-4 ${isSpecial ? "" : "border-l-dim/30"}`}
                  >
                    <span className="ammo-counter w-10 shrink-0 text-right font-display text-xl leading-none text-foreground/90">
                      {String(cell.position).padStart(2, "0")}
                    </span>
                    <span className="hidden size-8 shrink-0 items-center justify-center border border-dim/20 bg-background/40 sm:inline-flex [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                      <CellTypeIcon type={cell.cellType} className={`size-4 ${isSpecial ? "" : "opacity-40"}`} />
                    </span>
                    <span className={`inline-block size-2 shrink-0 sm:hidden ${theme.dot} [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]`} aria-hidden />
                    <span className="hidden w-28 shrink-0 font-mono text-[10px] uppercase tracking-widest text-dim sm:block">
                      {t.core.cellTypes[cell.cellType]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {cell.label ?? t.core.cellTypes[cell.cellType]}
                    </span>
                    {isSpecial ? <MicroEffectBadge cell={cell} /> : null}
                    {here.length > 0 ? <CellAvatarStack occupants={here} /> : null}
                    <ArrowRightIcon className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-3 h-1.5 w-full overflow-hidden border border-[#2a2a22] bg-[#1a1a14] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,rgba(242,169,0,0.18)_0_18px,transparent_18px_28px)] opacity-60" aria-hidden />
        </div>
      </div>

      {/* Cell details modal */}
      <Modal open={selectedPos !== null} onClose={() => setSelectedPos(null)} labelledBy="cell-detail-modal">
        {selected
          ? (() => {
              const theme = CELL_THEME[selected.cellType];
              const here = byPosition[selected.position] ?? [];
              const cfg = (selected.config ?? {}) as Record<string, unknown>;
              let effect = t.board.cell.noEffect;
              if ((selected.cellType === "penalty" || selected.cellType === "bonus") && typeof cfg.amount === "number") {
                effect = format(t.board.cell.amount, { n: cfg.amount });
              } else if (selected.cellType === "teleport" && typeof cfg.target === "number") {
                effect = format(t.board.cell.teleportTarget, { n: cfg.target });
              } else if (selected.cellType === "custom" && typeof cfg.effectKey === "string") {
                effect = format(t.board.cell.effectKey, { key: cfg.effectKey });
              }
              const isSpecial = selected.cellType !== "normal";
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex size-7 items-center justify-center border bg-raised [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${theme.box}`}>
                          <CellTypeIcon type={selected.cellType} className="size-4" />
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
                          #{String(selected.position).padStart(2, "0")} · {t.core.cellTypes[selected.cellType]}
                        </span>
                        {isSpecial ? <span className={`size-1.5 ${theme.dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden /> : null}
                      </div>
                      <h3 id="cell-detail-modal" className="mt-2 truncate font-display text-xl uppercase tracking-wide">
                        {selected.label ?? t.core.cellTypes[selected.cellType]}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-dim">{t.board.descriptions[selected.cellType]}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedPos(null)} className="hud-btn shrink-0 !px-2 !py-1.5" aria-label="Close">
                      <XMarkIcon className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <div className={`mt-4 border p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${isSpecial ? theme.box : "border-dim/30 bg-background/40"}`}>
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
                      <SparklesIcon className="size-3.5" aria-hidden />
                      {t.board.cell.effect}
                    </div>
                    <div className={`mt-1.5 inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-sm font-semibold [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${isSpecial ? "border-current/20 bg-background/40 text-amber" : "border-dim/30 bg-raised text-foreground"}`}>
                      {isSpecial ? <CellTypeIcon type={selected.cellType} className="size-3.5 opacity-70" /> : null}
                      {effect}
                    </div>
                    {selected.cellType === "penalty" || selected.cellType === "bonus" ? (
                      <p className="mt-2 font-mono text-[11px] leading-relaxed text-dim">
                        {selected.cellType === "penalty" ? "Stepping here drains points." : "Grants bonus points on landing."}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
                      <UserGroupIcon className="size-3.5" aria-hidden />
                      {t.board.cell.occupants}
                      <span className="ml-auto font-mono text-[10px] text-amber">{here.length} on cell</span>
                    </div>
                    {here.length === 0 ? (
                      <p className="mt-2 border border-dashed border-dim/20 bg-background/30 px-3 py-4 text-center text-sm text-dim">{t.board.cell.nobody}</p>
                    ) : (
                      <ul className="mt-2 flex flex-col divide-y divide-dim/20 border border-dim/30 bg-background/20 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                        {here.map((p) => (
                          <li key={p.username} className="flex items-center gap-3 p-2.5">
                            <AvatarWithPresence lastSeenAt={p.lastSeenAt} size="sm">
                              <Avatar {...p} />
                            </AvatarWithPresence>
                            <div className="min-w-0 flex-1">
                              <Link href={`/players/${p.username}`} className="block truncate font-mono text-xs font-semibold text-amber hover:underline">
                                {p.displayName ?? p.username}
                              </Link>
                              <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                                <span className="border border-dim/30 bg-raised px-1 py-0.5 leading-none [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
                                  {(t.core.playerStatuses as Record<string, string>)[p.status]}
                                </span>
                                <span>
                                  {t.board.cell.balance}: <span className="text-foreground">{p.balancePoints}</span>
                                </span>
                                {p.streakPass > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-400" title={t.board.cell.streakPass}>
                                    <CheckCircleIcon className="size-3" />×{p.streakPass}
                                  </span>
                                ) : null}
                                {p.streakDrop > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-danger" title={t.board.cell.streakDrop}>
                                    <XCircleIcon className="size-3" />×{p.streakDrop}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => stepSelection(-1)} disabled={selectedIndex <= 0} className="hud-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                      <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
                      {t.board.cell.prevCell}
                    </button>
                    <span className="font-mono text-[11px] tracking-widest text-dim">
                      {selectedIndex + 1} / {cells.length}
                    </span>
                    <button type="button" onClick={() => stepSelection(1)} disabled={selectedIndex >= cells.length - 1} className="hud-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                      {t.board.cell.nextCell}
                      <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </>
              );
            })()
          : null}
      </Modal>
    </div>
  );
}
