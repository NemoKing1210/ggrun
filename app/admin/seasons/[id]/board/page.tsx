import { notFound, redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import {
  getBoardCells,
  getMainBoard,
  getSeasonById,
} from "@/lib/repositories/seasons.repo";
import { setBoardCellAction } from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

const cellTypes = [
  "normal",
  "start",
  "finish",
  "penalty",
  "bonus",
  "event",
  "teleport",
  "custom",
] as const;

const typeColor: Record<string, string> = {
  start: "text-military",
  event: "text-[#6ec6ff]",
  teleport: "text-[#a98fe0]",
};

export default async function BoardEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();
  const { id: seasonId } = await params;
  const season = await getSeasonById(seasonId);
  if (!season) notFound();
  const board = await getMainBoard(seasonId);
  if (!board) {
    return <p className="text-dim">{t.admin.boardEditor.noBoard}</p>;
  }
  const cells = await getBoardCells(board.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {format(t.admin.boardEditor.heading, { season: season.title })}
      </h1>
      <div className="hazard-tape" aria-hidden />
      <p className="text-dim text-sm">{t.admin.boardEditor.hint}</p>

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          {t.admin.boardEditor.formHeading}
        </h2>
        <FormShell action={setBoardCellAction} submitLabel={t.admin.boardEditor.saveCell} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <input type="hidden" name="boardId" value={board.id} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <label className="text-dim text-sm">
            {t.admin.boardEditor.positionLabel}
            <input name="position" type="number" min={0} required />
          </label>
          <label className="text-dim text-sm">
            {t.admin.boardEditor.typeLabel}
            <select name="cellType" defaultValue="normal">
              {cellTypes.map((ct) => (
                <option key={ct} value={ct}>
                  {t.core.cellTypes[ct]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-dim text-sm">
            {t.core.common.label}
            <input name="label" placeholder={t.admin.boardEditor.labelPlaceholder} />
          </label>
          <label className="text-dim text-sm">
            {t.admin.boardEditor.amountLabel}
            <input name="amount" type="number" placeholder="-5" />
          </label>
        </FormShell>
      </section>

      <section className="hud-card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-dim text-left border-b border-[#3d3d34]">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">{t.core.common.type}</th>
              <th className="p-2">{t.core.common.label}</th>
              <th className="p-2">Config</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.id} className="border-b border-[#2a2a22]">
                <td className="p-2 ammo-counter">{c.position}</td>
                <td className={`p-2 ${typeColor[c.cellType] ?? ""}`}>{c.cellType}</td>
                <td className="p-2">{c.label ?? "—"}</td>
                <td className="p-2 font-mono text-xs text-dim">
                  {Object.keys(c.config as object).length > 0 ? JSON.stringify(c.config) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

