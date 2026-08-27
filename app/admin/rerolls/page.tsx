import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArrowPathIcon,
  ClockIcon,
  InboxIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  FilmIcon,
} from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listPendingRerollRequests, listPendingCompletionRequests } from "@/lib/repositories/games.repo";
import { approveRerollAction, rejectRerollAction, approveCompletionAction, rejectCompletionAction } from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { Badge } from "@/components/ui/Badge";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.rerolls} — GGRun` };
}

export default async function AdminRerollsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");

  const { tab } = await searchParams;
  const activeTab = tab === "completions" ? "completions" : "rerolls";
  const pending = await listPendingRerollRequests();
  const pendingCompletions = await listPendingCompletionRequests();

  const totalPending = pending.length + pendingCompletions.length;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="inline-flex items-center gap-3 font-display text-3xl uppercase tracking-widest text-amber">
            <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <ArrowPathIcon className="size-5" aria-hidden />
            </span>
            {t.admin.rerolls.heading}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{"// PENDING REVIEW"}</p>
        </div>
        <span className="inline-flex items-center gap-2 border border-amber/30 bg-amber/10 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <ClockIcon className="size-3.5" aria-hidden />
          {totalPending} pending
        </span>
      </section>
      <div className="hazard-tape" aria-hidden />

      <div className="flex gap-2 border-b border-[#3d3d34] pb-2">
        <a href="/admin/rerolls" className={`px-4 py-2 font-display text-xs uppercase tracking-widest border [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${activeTab === "rerolls" ? "bg-amber border-amber text-black" : "bg-[#1a1a1a] border-[#3d3d34] text-dim hover:border-amber/40"}`}>
          {t.admin.completions.tabs.rerolls} ({pending.length})
        </a>
        <a href="/admin/rerolls?tab=completions" className={`px-4 py-2 font-display text-xs uppercase tracking-widest border [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${activeTab === "completions" ? "bg-amber border-amber text-black" : "bg-[#1a1a1a] border-[#3d3d34] text-dim hover:border-amber/40"}`}>
          {t.admin.completions.tabs.completions} ({pendingCompletions.length})
        </a>
      </div>

      {activeTab === "rerolls" ? (
        pending.length === 0 ? (
          <div className="hud-card border-dashed p-10 text-center">
            <InboxIcon className="mx-auto size-8 text-dim" aria-hidden />
            <p className="mt-3 font-display text-sm uppercase tracking-widest text-dim">All clear</p>
            <p className="mt-1 font-mono text-xs tracking-wide text-dim">{t.admin.rerolls.empty}</p>
            <div className="mx-auto mt-4 h-px w-24 bg-dim/20" aria-hidden />
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {pending.map((req) => (
            <li key={req.id} className="hud-card p-0 overflow-hidden">
              <div className="h-1 w-full bg-amber/60" aria-hidden />
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-display text-sm uppercase tracking-wide">
                        <span className="inline-flex size-6 items-center justify-center bg-raised border border-[#3d3d34] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                          <UserIcon className="size-3.5 text-amber" aria-hidden />
                        </span>
                        <span className="text-amber">{req.displayName ?? req.username}</span>
                        <span className="font-mono text-xs text-dim">@{req.username}</span>
                      </span>
                      {req.seasonTitle ? <Badge variant="dim" size="sm">{req.seasonTitle}</Badge> : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs">
                      <span className="inline-flex items-center gap-1 text-dim">
                        <FilmIcon className="size-3.5" aria-hidden />
                        {req.gameTitle ?? "—"}
                      </span>
                      <span className="hidden text-dim/40 sm:inline">·</span>
                      <span className="inline-flex items-center gap-1 text-dim">
                        <ClockIcon className="size-3.5" aria-hidden />
                        {new Date(req.requestedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 border border-amber/40 bg-amber/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <span className="size-1.5 animate-pulse bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                    Pending
                  </span>
                </div>

                <div className="mt-3 border border-[#3d3d34] bg-background/60 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.rerolls.colReason}</div>
                  <p className="mt-1 text-sm leading-relaxed break-words">{req.reason}</p>
                </div>

                <div className="hazard-tape my-4 opacity-30" aria-hidden />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-emerald-900/50 bg-emerald-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                      <CheckCircleIcon className="size-3.5" aria-hidden />
                      Approve
                    </div>
                    <FormShell
                      action={approveRerollAction}
                      submitLabel={t.admin.rerolls.approve}
                      submitClassName="hud-btn hud-btn-primary w-full inline-flex items-center justify-center gap-1.5"
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="requestId" value={req.id} />
                      <p className="text-xs leading-relaxed text-dim">
                        {format(t.admin.rerolls.approveConfirm, { player: req.displayName ?? req.username })}
                      </p>
                    </FormShell>
                  </div>

                  <div className="border border-red-900/40 bg-red-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-red-300">
                      <XCircleIcon className="size-3.5" aria-hidden />
                      Reject
                    </div>
                    <FormShell
                      action={rejectRerollAction}
                      submitLabel={t.admin.rerolls.reject}
                      submitClassName="hud-btn hud-btn-danger w-full inline-flex items-center justify-center gap-1.5"
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
                </div>
              </div>
            </li>
          ))}
          </ul>
        )
      ) : (
        pendingCompletions.length === 0 ? (
          <div className="hud-card border-dashed p-10 text-center">
            <InboxIcon className="mx-auto size-8 text-dim" aria-hidden />
            <p className="mt-3 font-display text-sm uppercase tracking-widest text-dim">All clear</p>
            <p className="mt-1 font-mono text-xs tracking-wide text-dim">{t.admin.completions.empty}</p>
            <div className="mx-auto mt-4 h-px w-24 bg-dim/20" aria-hidden />
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {pendingCompletions.map((req) => (
              <li key={req.id} className="hud-card p-0 overflow-hidden">
                <div className="h-1 w-full bg-emerald-500/60" aria-hidden />
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 font-display text-sm uppercase tracking-wide">
                          <span className="inline-flex size-6 items-center justify-center bg-raised border border-[#3d3d34] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                            <UserIcon className="size-3.5 text-amber" aria-hidden />
                          </span>
                          <span className="text-amber">{req.displayName ?? req.username}</span>
                          <span className="font-mono text-xs text-dim">@{req.username}</span>
                        </span>
                        {req.seasonTitle ? <Badge variant="dim" size="sm">{req.seasonTitle}</Badge> : null}
                        <Badge variant={req.outcome === "passed" ? "military" : "danger"} size="sm">{req.outcome === "passed" ? t.admin.completions.outcomePassed : t.admin.completions.outcomeDropped}</Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs">
                        <span className="inline-flex items-center gap-1 text-dim">
                          <FilmIcon className="size-3.5" aria-hidden />
                          {req.gameTitle ?? "—"}
                        </span>
                        <span className="hidden text-dim/40 sm:inline">·</span>
                        <span className="inline-flex items-center gap-1 text-dim">
                          <ClockIcon className="size-3.5" aria-hidden />
                          {new Date(req.requestedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                      <span className="size-1.5 animate-pulse bg-emerald-500 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                      Pending
                    </span>
                  </div>
                  {req.reason ? (
                    <div className="mt-3 border border-[#3d3d34] bg-background/60 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.completions.colReason}</div>
                      <p className="mt-1 text-sm leading-relaxed break-words">{req.reason}</p>
                      {req.rating ? <p className="mt-1 font-mono text-xs text-amber">Rating: {req.rating}/10</p> : null}
                    </div>
                  ) : null}
                  <div className="hazard-tape my-4 opacity-30" aria-hidden />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border border-emerald-900/50 bg-emerald-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                      <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                        <CheckCircleIcon className="size-3.5" aria-hidden />
                        Approve
                      </div>
                      <FormShell action={approveCompletionAction} submitLabel={t.admin.completions.approve} submitClassName="hud-btn hud-btn-primary w-full inline-flex items-center justify-center gap-1.5" className="flex flex-col gap-2">
                        <input type="hidden" name="requestId" value={req.id} />
                        <p className="text-xs leading-relaxed text-dim">{format(t.admin.completions.approveConfirm, { outcome: req.outcome === "passed" ? t.admin.completions.outcomePassed : t.admin.completions.outcomeDropped, player: req.displayName ?? req.username })}</p>
                      </FormShell>
                    </div>
                    <div className="border border-red-900/40 bg-red-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                      <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-red-300">
                        <XCircleIcon className="size-3.5" aria-hidden />
                        Reject
                      </div>
                      <FormShell action={rejectCompletionAction} submitLabel={t.admin.completions.reject} submitClassName="hud-btn hud-btn-danger w-full inline-flex items-center justify-center gap-1.5" className="flex flex-col gap-2">
                        <input type="hidden" name="requestId" value={req.id} />
                        <label className="text-xs text-dim">
                          {t.core.common.reason}
                          <textarea name="adminNote" required minLength={5} rows={2} placeholder={t.admin.completions.rejectPlaceholder} className="mt-1" />
                        </label>
                      </FormShell>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
