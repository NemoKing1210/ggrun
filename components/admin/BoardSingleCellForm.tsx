"use client";

import { useActionState, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { setBoardCellAction } from "@/lib/modules/season/actions/board";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { GENRES } from "@/lib/modules/catalog/pool/constants";

const cellTypes = ["normal", "start", "finish", "penalty", "bonus", "event", "teleport", "custom"] as const;

export function BoardSingleCellForm({
  boardId,
  seasonId,
  perCellGenre,
}: {
  boardId: string;
  seasonId: string;
  perCellGenre: boolean;
}) {
  const { t } = useI18n();
  const [genres, setGenres] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(setBoardCellAction, {});
  const toggle = (v: string) => setGenres((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const wrappedAction = (formData: FormData) => {
    if (perCellGenre) formData.set("genres", JSON.stringify(genres));
    return formAction(formData);
  };

  return (
    <div className="hud-card p-4">
      <h2 className="font-display text-xl uppercase tracking-wider mb-1">{t.admin.boardEditor.formHeading}</h2>
      <p className="mb-3 font-mono text-xs text-dim">{t.admin.boardEditor.hint}</p>
      <form action={wrappedAction} className={`grid gap-3 ${perCellGenre ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-5"}`}>
        <input type="hidden" name="boardId" value={boardId} />
        <input type="hidden" name="seasonId" value={seasonId} />
        <label className="flex flex-col gap-1 text-sm text-dim">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.boardEditor.positionLabel}</span>
          <Input name="position" type="number" min={0} required placeholder="0" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-dim">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.boardEditor.typeLabel}</span>
          <Select name="cellType" defaultValue="normal">
            {cellTypes.map((ct) => (
              <option key={ct} value={ct}>
                {(t.core.cellTypes as Record<string, string>)[ct] ?? ct}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-dim">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.core.common.label}</span>
          <Input name="label" placeholder={t.admin.boardEditor.labelPlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-dim">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.boardEditor.amountLabel}</span>
          <Input name="amount" type="number" placeholder="-5" />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={pending} className="hud-btn hud-btn-primary w-full !py-2 text-xs disabled:opacity-50">
            {pending ? "..." : t.admin.boardEditor.saveCell}
          </button>
        </div>
        {perCellGenre && (
          <div className="lg:col-span-5 col-span-1 border-t border-[#2a2a22] pt-3 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-amber flex items-center gap-1.5">
                <span className="inline-block size-1.5 bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                {t.admin.boardEditor.cellGenresLabel}
              </span>
              {genres.length > 0 ? (
                <Badge variant="amber" size="sm">
                  {genres.length} selected
                </Badge>
              ) : (
                <Badge variant="dim" size="sm">
                  {t.admin.boardEditor.genreFallbackHint}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <Chip key={g.value} active={genres.includes(g.value)} onClick={() => toggle(g.value)}>
                  {g.label}
                </Chip>
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500">{t.admin.boardEditor.cellGenresHint}</p>
          </div>
        )}
      </form>
      {state?.error && <p className="mt-2 text-xs text-danger border border-danger/30 bg-danger/10 p-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-xs text-emerald-300 border border-emerald-800 bg-emerald-950/30 p-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">{state.ok}</p>}
    </div>
  );
}
