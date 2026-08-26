import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listPendingRerollRequests } from "@/lib/repositories/games.repo";
import { approveRerollAction, rejectRerollAction } from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export default async function AdminRerollsPage() {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");

  const pending = await listPendingRerollRequests();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {t.admin.rerolls.heading}
      </h1>
      <div className="hazard-tape" aria-hidden />

      {pending.length === 0 ? (
        <div className="hud-card p-6">
          <p className="text-dim">{t.admin.rerolls.empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((req) => (
            <li key={req.id} className="hud-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm">
                  <span className="text-amber">{req.displayName ?? req.username}</span>
                  <span className="text-dim"> · {req.gameTitle ?? "—"}</span>
                  {req.seasonTitle ? <span className="text-dim"> · {req.seasonTitle}</span> : null}
                </span>
                <span className="font-mono text-xs text-dim">
                  {new Date(req.requestedAt).toLocaleString()}
                </span>
              </div>
              <div className="mt-3 border border-[#3d3d34] bg-background/60 p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
                  {t.admin.rerolls.colReason}
                </div>
                <p className="mt-1 text-sm break-words">{req.reason}</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormShell
                  action={approveRerollAction}
                  submitLabel={t.admin.rerolls.approve}
                  submitClassName="hud-btn hud-btn-primary w-full"
                  className="flex flex-col gap-2"
                >
                  <input type="hidden" name="requestId" value={req.id} />
                  <p className="text-xs text-dim">
                    {format(t.admin.rerolls.approveConfirm, { player: req.displayName ?? req.username })}
                  </p>
                </FormShell>

                <FormShell
                  action={rejectRerollAction}
                  submitLabel={t.admin.rerolls.reject}
                  submitClassName="hud-btn hud-btn-danger w-full"
                  className="flex flex-col gap-2"
                >
                  <input type="hidden" name="requestId" value={req.id} />
                  <label className="text-xs text-dim">
                    {t.core.common.reason}
                    <textarea
                      name="adminNote"
                      required
                      minLength={5}
                      rows={2}
                      placeholder={t.admin.rerolls.rejectPlaceholder}
                      className="mt-1"
                    />
                  </label>
                </FormShell>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
