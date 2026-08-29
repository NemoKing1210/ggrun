import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowsRightLeftIcon,
  BoltIcon,
  FlagIcon,
  GiftIcon,
  FireIcon,
  MapIcon,
  PuzzlePieceIcon,
  Squares2X2Icon,
  TrophyIcon,
  TagIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getBoardCells, getMainBoard, getSeasonById } from "@/lib/modules/season/repository/seasons";
import { SeasonTabs } from "@/components/admin/SeasonTabs";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine";
import { CELL_THEME } from "@/components/board/cell-theme";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { BoardSingleCellForm } from "@/components/admin/BoardSingleCellForm";
import { BoardBulkGenreEditor } from "@/components/admin/BoardBulkGenreEditor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getT();
  const season = await getSeasonById(id);
  const base = season ? season.title : t.admin.nav.seasons;
  return { title: `${base} · ${t.board.pageTitle}` };
}

const typeColor: Record<string, string> = {
  start: "text-emerald-400",
  finish: "text-amber",
  bonus: "text-emerald-400",
  penalty: "text-red-400",
  event: "text-[#6ec6ff]",
  teleport: "text-[#a98fe0]",
};

const typeBg: Record<string, string> = {
  start: "bg-zinc-600",
  finish: "bg-amber",
  bonus: "bg-emerald-500",
  penalty: "bg-red-500",
  event: "bg-sky-500",
  teleport: "bg-violet-500",
  normal: "bg-zinc-800",
  custom: "bg-zinc-700",
};

function CellMiniIcon({ type, className }: { type: string; className?: string }) {
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
      return <Squares2X2Icon className={`${cls} opacity-40`} aria-hidden />;
  }
}

function getCellGenres(cell: { config: unknown }): string[] {
  const c = cell.config as Record<string, unknown> | null;
  if (!c || !Array.isArray((c as Record<string, unknown>).genres)) return [];
  return (c.genres as string[]).map((x) => String(x)).filter(Boolean);
}

export default async function BoardEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();
  const { id: seasonId } = await params;
  const season = await getSeasonById(seasonId);
  if (!season) notFound();
  const board = await getMainBoard(seasonId);
  if (!board) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/admin/seasons" label={t.admin.nav.seasons} />
        <SeasonTabs seasonId={seasonId} active="board" />
        <p className="text-dim">{t.admin.boardEditor.noBoard}</p>
      </div>
    );
  }
  const cells = await getBoardCells(board.id);
  const parsed = SeasonConfigSchema.safeParse(season.config);
  const cfg = parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
  const perCellGenre = Boolean(cfg.board.perCellGenre);
  const counts = cells.reduce(
    (acc, c) => {
      acc[c.cellType] = (acc[c.cellType] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const sorted = cells.slice().sort((a, b) => a.position - b.position);

  const genreStats = perCellGenre
    ? sorted.reduce(
        (acc, c) => {
          const gs = getCellGenres(c);
          if (gs.length === 0) acc.__none = (acc.__none ?? 0) + 1;
          else for (const g of gs) acc[g] = (acc[g] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      )
    : null;

  const distinctGenres = genreStats ? Object.keys(genreStats).filter((k) => k !== "__none").sort() : [];

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/seasons" label={t.admin.nav.seasons} />
      <SeasonTabs seasonId={seasonId} active="board" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl uppercase tracking-widest text-amber">
            <MapIcon className="h-7 w-7" aria-hidden />
            {format(t.admin.boardEditor.heading, { season: season.title })}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dim">{t.admin.boardEditor.hint}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="dim" size="sm" className="font-mono">
            <TagIcon className="mr-1 h-3 w-3" aria-hidden />
            board {board.id.slice(0, 8)}
          </Badge>
          {perCellGenre && (
            <Badge variant="amber" size="sm" className="font-mono">
              <SparklesIcon className="mr-1 h-3 w-3" aria-hidden />
              per-cell genre
            </Badge>
          )}
        </div>
      </header>

      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="neutral" size="sm">
            {t.admin.boardEditor.configTarget}
          </Badge>
          <Badge variant="emerald" size="sm">
            bonus {cfg.board.bonusCount}
          </Badge>
          <Badge variant="danger" size="sm">
            penalty {cfg.board.penaltyCount}
          </Badge>
          <Badge variant="violet" size="sm">
            teleport {cfg.board.teleportCount}
          </Badge>
          <Badge variant="sky" size="sm">
            event {cfg.board.eventCount}
          </Badge>
          <Badge variant="dim" size="sm">
            size {cfg.board.size}
          </Badge>
          <Badge variant="dim" size="sm">
            {cfg.board.distribution}
          </Badge>
          <Badge variant={cfg.board.loop ? "amber" : "dim"} size="sm">
            {cfg.board.loop ? "loop" : "linear"}
          </Badge>
          <Badge variant={perCellGenre ? "amber" : "dim"} size="sm">
            <SparklesIcon className="mr-1 h-3 w-3" aria-hidden />
            {perCellGenre ? t.admin.boardEditor.perCellGenreOn : t.admin.boardEditor.perCellGenreOff}
          </Badge>
        </div>
        <div className="mt-2 font-mono text-[11px] tracking-wide text-zinc-500">
          {t.admin.boardEditor.actualCounts}: {(Object.entries(counts) as [string, number][]).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
          {perCellGenre && genreStats && (
            <span className="ml-2 text-amber">
              · genres: {distinctGenres.length ? distinctGenres.map((g) => `${g} ${genreStats[g]}`).join(" · ") : "—"} {genreStats.__none ? `· fallback ${genreStats.__none}` : ""}
            </span>
          )}
        </div>
        {!perCellGenre && (
          <div className="mt-3 flex items-start gap-2 border border-amber/20 bg-amber/10 px-3 py-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber" aria-hidden />
            <p className="text-xs leading-relaxed text-zinc-300">
              {t.admin.boardEditor.perCellGenreDisabledHint}{" "}
              <Link href={`/admin/seasons/${seasonId}`} className="underline decoration-amber/50 underline-offset-4 hover:text-amber font-medium">
                {t.admin.boardEditor.perCellGenreEnableLink}
              </Link>
            </p>
          </div>
        )}
      </section>

      {/* Visual preview */}
      <section className="hud-card overflow-hidden bg-[#121210] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#2a2a22] pb-2">
          <h3 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest">
            <Squares2X2Icon className="h-4 w-4 text-amber" aria-hidden />
            {t.admin.boardEditor.previewHeading}
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {sorted.length} / {cfg.board.size} {perCellGenre && distinctGenres.length ? `· ${distinctGenres.length} genres` : ""}
          </span>
        </div>

        {sorted.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs tracking-wide text-dim">— {t.admin.boardEditor.noBoard} —</p>
        ) : (
          <>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-12">
              {sorted.map((c) => {
                const theme = CELL_THEME[c.cellType as keyof typeof CELL_THEME] ?? CELL_THEME.normal;
                const gs = getCellGenres(c);
                const primaryGenre = gs[0];
                return (
                  <div
                    key={c.id}
                    title={`#${c.position} ${c.cellType} ${c.label ?? ""}${gs.length ? ` · ${gs.join(", ")}` : ""}`}
                    className={`group relative flex aspect-square flex-col items-center justify-center border p-1 text-center transition hover:scale-[1.06] hover:brightness-110 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${theme.box}`}
                  >
                    <span className={`absolute right-1 top-1 size-1 ${theme.dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
                    <span className="ammo-counter text-xs leading-none">{String(c.position).padStart(2, "0")}</span>
                    <span className="mt-0.5">
                      <CellMiniIcon type={c.cellType} className="size-3 opacity-70" />
                    </span>
                    {perCellGenre && primaryGenre && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 max-w-[90%] truncate font-mono text-[7px] uppercase tracking-widest leading-none text-amber bg-black/70 px-0.5 [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
                        {primaryGenre.slice(0, 6)}
                      </span>
                    )}
                    {perCellGenre && gs.length > 1 && (
                      <span className="absolute bottom-0 right-0.5 font-mono text-[7px] leading-none text-zinc-400">+{gs.length - 1}</span>
                    )}
                    {perCellGenre && !primaryGenre && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-zinc-600" title="fallback to global genres" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex h-1.5 overflow-hidden border border-[#2a2a22] bg-[#1a1a14] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              {sorted.map((c) => (
                <div key={c.id} className={`flex-1 ${typeBg[c.cellType] ?? "bg-zinc-800"}`} title={`${c.position}:${c.cellType}`} />
              ))}
            </div>
            {perCellGenre && distinctGenres.length > 0 && (
              <div className="mt-3 flex h-1.5 overflow-hidden border border-[#2a2a22] bg-[#1a1a14] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                {sorted.map((c) => {
                  const gs = getCellGenres(c);
                  const g = gs[0];
                  const bg = !g ? "bg-zinc-800" : `bg-amber`;
                  return <div key={c.id} className={`flex-1 ${bg} opacity-80`} title={`${c.position}:${g ?? "fallback"}`} />;
                })}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(CELL_THEME) as Array<keyof typeof CELL_THEME>)
                .filter((k) => k !== "normal")
                .map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                    <span className={`inline-block size-2 ${CELL_THEME[k].dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
                    {k}
                  </span>
                ))}
            </div>
          </>
        )}
      </section>

      {/* Single cell editor — now with genre support */}
      <BoardSingleCellForm boardId={board.id} seasonId={seasonId} perCellGenre={perCellGenre} />

      {/* Bulk genre matrix — only when enabled */}
      {perCellGenre && <BoardBulkGenreEditor boardId={board.id} seasonId={seasonId} boardSize={cfg.board.size} />}

      <section className="hud-card p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <h3 className="font-display text-sm uppercase tracking-widest">{t.admin.boardEditor.colConfig} · {sorted.length}</h3>
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.boardEditor.sortedByNumber}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-dim text-left border-b border-[#3d3d34]">
              <tr>
                <th className="p-2 font-mono text-[11px] uppercase tracking-widest">#</th>
                <th className="p-2 font-mono text-[11px] uppercase tracking-widest">{t.core.common.type}</th>
                <th className="p-2 font-mono text-[11px] uppercase tracking-widest">{t.core.common.label}</th>
                {perCellGenre && <th className="p-2 font-mono text-[11px] uppercase tracking-widest">{t.admin.boardEditor.colGenres}</th>}
                <th className="p-2 font-mono text-[11px] uppercase tracking-widest">{t.admin.boardEditor.colConfig}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const gs = getCellGenres(c);
                const cfgJson = (() => {
                  const copy = { ...(c.config as Record<string, unknown>) };
                  if (perCellGenre) delete copy.genres;
                  return Object.keys(copy).length > 0 ? JSON.stringify(copy) : "—";
                })();
                return (
                  <tr key={c.id} className="border-b border-[#2a2a22] transition hover:bg-white/[0.03]">
                    <td className={`p-2 ammo-counter ${typeColor[c.cellType] ?? ""}`}>{String(c.position).padStart(2, "0")}</td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-1.5 ${CELL_THEME[c.cellType as keyof typeof CELL_THEME]?.dot ?? "bg-zinc-700"} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
                        <span className={`font-mono text-xs uppercase tracking-widest ${typeColor[c.cellType] ?? "text-dim"}`}>{c.cellType}</span>
                        <CellMiniIcon type={c.cellType} className="size-3.5 opacity-60" />
                      </span>
                    </td>
                    <td className="p-2 max-w-[180px] truncate">{c.label ?? "—"}</td>
                    {perCellGenre && (
                      <td className="p-2 max-w-[220px]">
                        {gs.length ? (
                          <span className="flex flex-wrap gap-1">
                            {gs.map((g) => (
                              <Badge key={g} variant="amber" size="sm" className="!px-1.5 !py-0 text-[10px]">
                                {g}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-zinc-500">— {t.admin.boardEditor.genreFallbackHint}</span>
                        )}
                      </td>
                    )}
                    <td className="p-2 font-mono text-xs text-dim max-w-[280px] truncate">{cfgJson}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
