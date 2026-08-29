"use client";

import { useActionState, useState } from "react";
import { SparklesIcon, TrashIcon, BoltIcon, Squares2X2Icon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useI18n } from "@/lib/i18n/client";
import { bulkSetCellGenresAction, randomizeBoardGenresAction } from "@/lib/modules/season/actions/board";
import { Chip } from "@/components/ui/Chip";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { GENRES } from "@/lib/modules/catalog/pool/constants";

export function BoardBulkGenreEditor({ boardId, seasonId, boardSize }: { boardId: string; seasonId: string; boardSize: number }) {
  const { t } = useI18n();
  const [genres, setGenres] = useState<string[]>([]);
  const [positions, setPositions] = useState("");
  const [applyAll, setApplyAll] = useState(false);
  const [state, formAction, pending] = useActionState(bulkSetCellGenresAction, {});
  const [rState, rAction, rPending] = useActionState(randomizeBoardGenresAction, {});

  const toggle = (v: string) => setGenres((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const submitBulk = (fd: FormData) => {
    fd.set("boardId", boardId);
    fd.set("seasonId", seasonId);
    fd.set("boardSize", String(boardSize));
    fd.set("genres", JSON.stringify(genres));
    fd.set("positions", positions);
    fd.set("applyToAll", applyAll ? "true" : "false");
    return formAction(fd);
  };

  const submitRandom = (fd: FormData) => {
    fd.set("boardId", boardId);
    fd.set("seasonId", seasonId);
    fd.set("boardSize", String(boardSize));
    fd.set("positions", positions);
    fd.set("applyToAll", applyAll ? "true" : "false");
    fd.set("poolGenres", JSON.stringify(genres));
    return rAction(fd);
  };

  const submitClear = (fd: FormData) => {
    fd.set("boardId", boardId);
    fd.set("seasonId", seasonId);
    fd.set("boardSize", String(boardSize));
    fd.set("positions", positions);
    fd.set("applyToAll", applyAll ? "true" : "false");
    fd.set("genres", JSON.stringify([]));
    return formAction(fd);
  };

  return (
    <section className="hud-card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3d3d34] bg-[#121210] px-4 py-3">
        <h3 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest">
          <SparklesIcon className="h-4 w-4 text-amber" aria-hidden />
          {t.admin.boardEditor.genreMatrixTitle}
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="amber" size="sm">
            {boardSize} cells
          </Badge>
          <Badge variant="dim" size="sm" className="hidden sm:inline-flex">
            per-cell genre
          </Badge>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 bg-[#0f0f0f]/40">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-amber">{t.admin.boardEditor.pickGenresLabel}</span>
            <span className="font-mono text-[11px] text-dim">
              {genres.length ? `${genres.length} selected` : t.admin.boardEditor.genreFallbackHint}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => (
              <Chip key={g.value} active={genres.includes(g.value)} onClick={() => toggle(g.value)}>
                {g.label}
              </Chip>
            ))}
          </div>
          <p className="mt-2 font-mono text-[11px] text-zinc-500">{t.admin.boardEditor.genreMatrixHint}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_auto] gap-3 items-end">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.boardEditor.positionsLabel}</span>
            <Input value={positions} onChange={(e) => setPositions(e.target.value)} placeholder="0-5, 10, 12-15" disabled={applyAll} />
            <span className="font-mono text-[11px] text-zinc-500">{t.admin.boardEditor.positionsHint}</span>
          </label>
          <label className="flex items-center gap-2 border border-[#3d3d34] bg-[#1a1a1a] px-3 py-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] cursor-pointer select-none">
            <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="accent-amber" />
            <span className="font-mono text-xs uppercase tracking-widest text-dim">{t.admin.boardEditor.applyToAllLabel}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <form action={submitBulk} className="contents">
            <button type="submit" disabled={pending || rPending} className="hud-btn hud-btn-primary !py-2.5 text-xs disabled:opacity-50 flex items-center justify-center gap-1.5">
              <BoltIcon className="h-4 w-4" aria-hidden />
              {pending ? "..." : t.admin.boardEditor.applyGenres}
            </button>
          </form>
          <form action={submitRandom} className="contents">
            <button type="submit" disabled={pending || rPending} className="hud-btn !py-2.5 text-xs disabled:opacity-50 flex items-center justify-center gap-1.5">
              <ArrowPathIcon className="h-4 w-4" aria-hidden />
              {rPending ? "..." : t.admin.boardEditor.randomizeGenres}
            </button>
          </form>
          <form action={submitClear} className="contents">
            <button type="submit" disabled={pending || rPending} className="hud-btn hud-btn-danger !py-2.5 text-xs disabled:opacity-50 flex items-center justify-center gap-1.5">
              <TrashIcon className="h-4 w-4" aria-hidden />
              {t.admin.boardEditor.clearGenres}
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[#2a2a22] pt-3">
          <Squares2X2Icon className="h-4 w-4 text-dim" aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.boardEditor.quickTipsTitle}:</span>
          <span className="font-mono text-[11px] text-zinc-500">{t.admin.boardEditor.quickTipsText}</span>
        </div>

        {(state?.ok || state?.error || rState?.ok || rState?.error) && (
          <div className={`border p-3 font-mono text-xs [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${state?.error || rState?.error ? "border-danger/30 bg-danger/10 text-red-300" : "border-emerald-800 bg-emerald-950/30 text-emerald-300"}`}>
            {state?.ok ?? rState?.ok ?? state?.error ?? rState?.error}
          </div>
        )}
      </div>
    </section>
  );
}
