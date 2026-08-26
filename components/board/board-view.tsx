"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { BoardCell, SeasonPlayer } from "@/db/schema";

import { CELL_THEME } from "./cell-theme";
import { format } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";

/** Player marker on the board (subset of LeaderboardRow, RSC-serializable). */
export type BoardPlayer = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
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
  gameTitle: string | null;
  platform: string | null;
  /** ISO timestamp of the roll. */
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

/** Formats an elapsed duration as compact "2d 5h" / "3m 12s". */
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
        className={`${className ?? "size-7"} border border-dim/40 object-cover`}
      />
    );
  }
  return (
    <span
      title={displayName ?? username}
      className={`${className ?? "size-7"} inline-flex items-center justify-center border border-dim/50 bg-raised font-mono text-[10px] text-dim`}
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
        <Avatar key={p.username} {...p} className="size-6 ring-1 ring-background" />
      ))}
      {occupants.length > shown.length ? (
        <span className="inline-flex size-6 items-center justify-center border border-dim/50 bg-raised font-mono text-[10px] text-dim">
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
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="hud-card px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
        {label}
      </div>
      <div
        className={`ammo-counter mt-1 truncate font-display text-lg leading-tight ${
          accent ? "text-amber" : ""
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Full board experience: live event stats, "playing right now" panel,
 * two view modes (snake grid / linear top-down list) and a per-cell
 * details modal. Pure presentation — all data comes from the server page.
 */
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
  // Ticking clock; null until mounted to avoid SSR hydration mismatch.
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

  // Close the modal on Escape.
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
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(cells.slice(i, i + cols));
  }

  const selectedIndex =
    selectedPos === null ? -1 : cells.findIndex((c) => c.position === selectedPos);
  const selected = selectedIndex >= 0 ? cells[selectedIndex] : null;

  const stepSelection = (delta: 1 | -1) => {
    if (selectedIndex < 0) return;
    const nextIndex = Math.min(cells.length - 1, Math.max(0, selectedIndex + delta));
    setSelectedPos(cells[nextIndex].position);
  };

  const uptime =
    now !== null && seasonStartedAt
      ? formatDuration(now - new Date(seasonStartedAt).getTime(), t.board.units)
      : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* --- Event status bar --- */}
      <section aria-label={t.board.stats.title}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <StatTile label={t.board.stats.uptime} value={uptime} accent />
          <StatTile
            label={t.board.stats.participants}
            value={`${activeCount}/${players.length}`}
          />
          <StatTile label={t.board.stats.moves} value={String(stats.totalMoves)} />
          <StatTile
            label={t.board.stats.passed}
            value={String(stats.passedRolls)}
            accent
          />
          <StatTile label={t.board.stats.dropped} value={String(stats.droppedRolls)} />
          <StatTile label={t.board.stats.rerolls} value={String(stats.rerolls)} />
          <StatTile
            label={t.board.stats.leader}
            value={
              leader ? leader.displayName ?? leader.username : t.board.stats.noLeader
            }
            accent
          />
        </div>
      </section>

      {/* --- Playing right now --- */}
      <section aria-label={t.board.live.title}>
        <h2 className="mb-2 flex items-center gap-2 font-display text-sm uppercase tracking-widest">
          <span className="hud-loader-blink inline-block size-2 bg-amber" aria-hidden />
          {t.board.live.title}
        </h2>
        {rolls.length === 0 ? (
          <p className="font-mono text-xs text-dim">{t.board.live.empty}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rolls.map((r) => (
              <li key={r.username} className="hud-card flex items-center gap-3 p-3">
                <Avatar
                  username={r.username}
                  displayName={r.displayName}
                  avatarUrl={r.avatarUrl}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${r.username}`}
                    className="block truncate font-mono text-xs text-amber hover:underline"
                  >
                    {r.displayName ?? r.username}
                  </Link>
                  <div className="truncate text-sm" title={r.gameTitle ?? undefined}>
                    {r.gameTitle ?? t.board.live.unknownGame}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {r.platform ? (
                      <span className="border border-dim/50 px-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                        {r.platform}
                      </span>
                    ) : null}
                    <span className="ammo-counter font-mono text-[11px] text-dim">
                      {now !== null
                        ? format(t.board.live.since, {
                            time: formatDuration(
                              now - new Date(r.rolledAt).getTime(),
                              t.board.units,
                            ),
                          })
                        : ""}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Toolbar --- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="group" aria-label={t.board.pageTitle}>
          <button
            type="button"
            onClick={() => changeMode("grid")}
            className={`hud-btn px-3 py-1.5 text-xs ${
              mode === "grid" ? "hud-btn-primary" : ""
            }`}
            aria-pressed={mode === "grid"}
          >
            {t.board.view.grid}
          </button>
          <button
            type="button"
            onClick={() => changeMode("linear")}
            className={`hud-btn px-3 py-1.5 text-xs ${
              mode === "linear" ? "hud-btn-primary" : ""
            }`}
            aria-pressed={mode === "linear"}
          >
            {t.board.view.linear}
          </button>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
          {t.board.view.hint}
        </span>
      </div>

      {/* --- Board itself --- */}
      {mode === "grid" ? (
        <div ref={gridRef} className="w-full">
          <div className="flex flex-col gap-2 sm:gap-3">
            {rows.map((row, ri) => (
              <ol
                key={ri}
                className={`flex gap-2 sm:gap-3 ${ri % 2 === 1 ? "flex-row-reverse" : ""}`}
              >
                {row.map((cell) => {
                  const theme = CELL_THEME[cell.cellType];
                  const here = byPosition[cell.position] ?? [];
                  return (
                    <li key={cell.id} className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setSelectedPos(cell.position)}
                        className={`relative flex aspect-square w-full flex-col justify-between border p-2 text-left transition-colors hover:brightness-125 ${theme.box}`}
                      >
                        <span className="max-w-full truncate font-mono text-[10px] uppercase tracking-widest opacity-80">
                          {cell.label ?? t.core.cellTypes[cell.cellType]}
                        </span>
                        <span className="ammo-counter self-end text-2xl leading-none sm:text-3xl">
                          {cell.position}
                        </span>
                        {here.length > 0 ? (
                          <span className="absolute bottom-1 left-1.5">
                            <CellAvatarStack occupants={here} />
                          </span>
                        ) : null}
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
            return (
              <li key={cell.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPos(cell.position)}
                  className={`flex w-full items-center gap-3 border-l-4 bg-raised px-3 py-2 text-left transition-colors hover:brightness-125 ${theme.box}`}
                >
                  <span className="ammo-counter w-10 shrink-0 text-right font-display text-xl text-foreground/90">
                    {cell.position}
                  </span>
                  <span
                    className={`inline-block size-2.5 shrink-0 ${theme.dot}`}
                    aria-hidden
                  />
                  <span className="hidden w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-dim sm:block">
                    {t.core.cellTypes[cell.cellType]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {cell.label ?? t.core.cellTypes[cell.cellType]}
                  </span>
                  {here.length > 0 ? <CellAvatarStack occupants={here} /> : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {/* --- Cell details modal --- */}
      {selected ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setSelectedPos(null)}
        >
          <div
            className="hud-card relative w-full max-w-lg p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const theme = CELL_THEME[selected.cellType];
              const here = byPosition[selected.position] ?? [];
              const cfg = (selected.config ?? {}) as Record<string, unknown>;
              let effect = t.board.cell.noEffect;
              if (
                (selected.cellType === "penalty" || selected.cellType === "bonus") &&
                typeof cfg.amount === "number"
              ) {
                effect = format(t.board.cell.amount, { n: cfg.amount });
              } else if (
                selected.cellType === "teleport" &&
                typeof cfg.target === "number"
              ) {
                effect = format(t.board.cell.teleportTarget, { n: cfg.target });
              } else if (
                selected.cellType === "custom" &&
                typeof cfg.effectKey === "string"
              ) {
                effect = format(t.board.cell.effectKey, { key: cfg.effectKey });
              }
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block size-3 ${theme.dot}`}
                          aria-hidden
                        />
                        <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
                          #{selected.position} · {t.core.cellTypes[selected.cellType]}
                        </span>
                      </div>
                      <h3 className="mt-1 truncate font-display text-xl">
                        {selected.label ?? t.core.cellTypes[selected.cellType]}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPos(null)}
                      className="hud-btn shrink-0 px-2 py-1 font-mono text-xs"
                      aria-label="✕"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="mt-3 text-sm text-dim">
                    {t.board.descriptions[selected.cellType]}
                  </p>

                  <div className="mt-3 border border-dim/30 bg-background/60 p-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
                      {t.board.cell.effect}
                    </div>
                    <div className="mt-1 font-mono text-sm text-amber">{effect}</div>
                  </div>

                  <div className="mt-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
                      {t.board.cell.occupants}
                    </div>
                    {here.length === 0 ? (
                      <p className="mt-2 text-sm text-dim">{t.board.cell.nobody}</p>
                    ) : (
                      <ul className="mt-2 flex flex-col divide-y divide-dim/20 border border-dim/30">
                        {here.map((p) => (
                          <li key={p.username} className="flex items-center gap-3 p-2.5">
                            <Avatar {...p} />
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/players/${p.username}`}
                                className="block truncate font-mono text-xs text-amber hover:underline"
                              >
                                {p.displayName ?? p.username}
                              </Link>
                              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
                                {(t.core.playerStatuses as Record<string, string>)[p.status]} ·{" "}
                                {t.board.cell.balance}:{" "}
                                <span className="text-foreground">
                                  {p.balancePoints}
                                </span>
                                {p.streakPass > 0 ? (
                                  <span
                                    className="ml-1 text-military"
                                    title={t.board.cell.streakPass}
                                  >
                                    ×{p.streakPass}
                                  </span>
                                ) : null}
                                {p.streakDrop > 0 ? (
                                  <span
                                    className="ml-1 text-danger"
                                    title={t.board.cell.streakDrop}
                                  >
                                    ×{p.streakDrop}
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
                    <button
                      type="button"
                      onClick={() => stepSelection(-1)}
                      disabled={selectedIndex <= 0}
                      className="hud-btn px-3 py-1.5 text-xs"
                    >
                      ← {t.board.cell.prevCell}
                    </button>
                    <button
                      type="button"
                      onClick={() => stepSelection(1)}
                      disabled={selectedIndex >= cells.length - 1}
                      className="hud-btn px-3 py-1.5 text-xs"
                    >
                      {t.board.cell.nextCell} →
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
