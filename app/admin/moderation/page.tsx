import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  FilmIcon,
  InboxIcon,
  StarIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { listPendingRerollRequests, listPendingCompletionRequests } from "@/lib/modules/catalog/repository";
import { approveRerollAction, rejectRerollAction, approveCompletionAction, rejectCompletionAction } from "@/lib/modules/moderation/actions/moderation";
import { FormShell } from "@/components/admin/FormShell";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { AvatarWithPresence } from "@/components/ui/Presence";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.moderation} — GGRun` };
}

/** One moderation request card: player + game + reason, with approve/reject panels. */
function RequestCard({
  accent,
  avatarUrl,
  lastSeenAt,
  name,
  username,
  userId,
  isAdmin,
  gameTitle,
  requestedAt,
  dateFmt,
  badges,
  children,
}: {
  accent: "amber" | "emerald";
  avatarUrl: string | null;
  lastSeenAt: Date | string | null;
  name: string;
  username: string;
  userId: string;
  isAdmin: boolean;
  gameTitle: string | null;
  requestedAt: Date;
  dateFmt: Intl.DateTimeFormat;
  badges: React.ReactNode;
  children: React.ReactNode;
}) {
  const nameEl = isAdmin ? (
    <Link
      href={`/admin/users/${userId}`}
      className="font-display text-sm uppercase tracking-wide text-amber transition-colors hover:text-zinc-100 hover:underline underline-offset-4"
    >
      {name}
    </Link>
  ) : (
    <span className="font-display text-sm uppercase tracking-wide text-amber">{name}</span>
  );
  return (
    <li className="hud-card overflow-hidden p-0">
      <div className={`h-1 w-full ${accent === "amber" ? "bg-amber/70" : "bg-emerald-500/70"}`} aria-hidden />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AvatarWithPresence lastSeenAt={lastSeenAt} size="md" href={isAdmin ? `/admin/users/${userId}` : `/players/${username}`}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} className="size-10 object-cover" />
              ) : (
                <span className="grid h-10 w-10 place-items-center bg-raised font-display text-xs tracking-widest text-amber">{name.slice(0, 2).toUpperCase()}</span>
              )}
            </AvatarWithPresence>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                {nameEl}
                <span className="font-mono text-xs text-dim">@{username}</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                <span className="inline-flex items-center gap-1 text-dim">
                  <FilmIcon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{gameTitle ?? "—"}</span>
                </span>
                <span className="hidden text-dim/40 sm:inline" aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 text-dim">
                  <ClockIcon className="size-3.5 shrink-0" aria-hidden />
                  {dateFmt.format(requestedAt)}
                </span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">{badges}</div>
        </div>
        {children}
      </div>
    </li>
  );
}

/** Pulsing "pending" status chip — amber for rerolls, emerald for completions. */
function PendingChip({ color, label }: { color: "amber" | "emerald"; label: string }) {
  const tone = color === "amber" ? "text-amber border-amber/40 bg-amber/10" : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  const dot = color === "amber" ? "bg-amber" : "bg-emerald-500";
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${tone} [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]`}>
      <span className={`size-1.5 animate-pulse ${dot} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
      <ClockIcon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** Empty state for a moderation tab. */
function EmptyState({ icon: Icon, title, hint }: { icon: typeof InboxIcon; title: string; hint: string }) {
  return (
    <div className="hud-card border-dashed p-10 text-center">
      <div className="mx-auto grid size-12 place-items-center border border-dim/20 bg-raised/40 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
        <Icon className="size-6 text-dim" aria-hidden />
      </div>
      <p className="mt-4 font-display text-sm uppercase tracking-widest text-dim">{title}</p>
      <p className="mt-1 font-mono text-xs tracking-wide text-dim">{hint}</p>
      <div className="mx-auto mt-4 h-px w-24 bg-dim/20" aria-hidden />
    </div>
  );
}

export default async function AdminRerollsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { t, locale } = await getT();
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const isAdmin = user.role === "admin";

  const { tab } = await searchParams;
  const activeTab = tab === "completions" ? "completions" : "rerolls";
  const [pending, pendingCompletions] = await Promise.all([
    listPendingRerollRequests(),
    listPendingCompletionRequests(),
  ]);
  const totalPending = pending.length + pendingCompletions.length;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  const tabLink = (tabName: "rerolls" | "completions", count: number) => {
    const active = activeTab === tabName;
    return (
      <a
        href={tabName === "rerolls" ? "/admin/moderation" : "/admin/moderation?tab=completions"}
        className={`inline-flex items-center gap-2 border px-4 py-2 font-display text-xs uppercase tracking-widest transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
          active ? "border-amber bg-amber text-black" : "border-[#3d3d34] bg-[#1a1a1a] text-dim hover:border-amber/40 hover:text-amber"
        }`}
      >
        {tabName === "rerolls" ? t.admin.completions.tabs.rerolls : t.admin.completions.tabs.completions}
        <span
          className={`inline-flex min-w-4 items-center justify-center px-1 font-mono text-[10px] [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${
            active ? "bg-black/15 text-black" : "bg-raised text-dim"
          }`}
        >
          {count}
        </span>
      </a>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="inline-flex items-center gap-3 font-display text-3xl uppercase tracking-widest text-amber">
            <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <ArrowPathIcon className="size-5" aria-hidden />
            </span>
            {t.admin.moderation.heading}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.admin.moderation.kicker}</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-xs uppercase tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
            totalPending > 0 ? "border-amber/30 bg-amber/10 text-amber" : "border-military/30 bg-military/10 text-military"
          }`}
        >
          <span className={`size-1.5 ${totalPending > 0 ? "animate-pulse bg-amber" : "bg-military"} [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]`} aria-hidden />
          {format(t.admin.moderation.pendingCount, { count: totalPending })}
        </span>
      </section>
      <div className="hazard-tape" aria-hidden />

      <div className="flex flex-wrap gap-2">
        {tabLink("rerolls", pending.length)}
        {tabLink("completions", pendingCompletions.length)}
      </div>

      {activeTab === "rerolls" ? (
        pending.length === 0 ? (
          <EmptyState icon={InboxIcon} title={t.admin.moderation.allClear} hint={t.admin.moderation.empty} />
        ) : (
          <ul className="flex flex-col gap-4">
            {pending.map((req) => (
              <RequestCard
                key={req.id}
                accent="amber"
                avatarUrl={req.avatarUrl ?? null}
                lastSeenAt={req.lastSeenAt ?? null}
                name={req.displayName ?? req.username}
                username={req.username}
                userId={req.userId}
                isAdmin={isAdmin}
                gameTitle={req.gameTitle}
                requestedAt={req.requestedAt}
                dateFmt={dateFmt}
                badges={
                  <>
                    {req.seasonTitle ? <Badge variant="dim" size="sm">{req.seasonTitle}</Badge> : null}
                    <PendingChip color="amber" label={t.admin.moderation.pending} />
                  </>
                }
              >
                <div className="mt-4 border border-[#3d3d34] bg-background/60 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                    <span className="inline-block h-px w-3 bg-dim/40" aria-hidden />
                    {t.admin.moderation.colReason}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed break-words">{req.reason}</p>
                </div>

                <div className="hazard-tape my-4 opacity-30" aria-hidden />

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="border border-emerald-900/50 bg-emerald-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                      <CheckCircleIcon className="size-3.5" aria-hidden />
                      {t.admin.moderation.approve}
                    </div>
                    <FormShell
                      action={approveRerollAction}
                      submitLabel={t.admin.moderation.approve}
                      submitClassName="hud-btn hud-btn-primary w-full"
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="requestId" value={req.id} />
                      <p className="text-xs leading-relaxed text-dim">
                        {format(t.admin.moderation.approveConfirm, { player: req.displayName ?? req.username })}
                      </p>
                    </FormShell>
                  </div>

                  <div className="border border-red-900/40 bg-red-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-red-300">
                      <XCircleIcon className="size-3.5" aria-hidden />
                      {t.admin.moderation.reject}
                    </div>
                    <FormShell
                      action={rejectRerollAction}
                      submitLabel={t.admin.moderation.reject}
                      submitClassName="hud-btn hud-btn-danger w-full"
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="requestId" value={req.id} />
                      <Textarea name="adminNote" required minLength={5} rows={2} placeholder={t.admin.moderation.rejectPlaceholder} aria-label={t.core.common.reason} />
                    </FormShell>
                  </div>
                </div>
              </RequestCard>
            ))}
          </ul>
        )
      ) : pendingCompletions.length === 0 ? (
        <EmptyState icon={InboxIcon} title={t.admin.moderation.allClear} hint={t.admin.completions.empty} />
      ) : (
        <ul className="flex flex-col gap-4">
          {pendingCompletions.map((req) => {
            const passed = req.outcome === "passed";
            return (
              <RequestCard
                key={req.id}
                accent="emerald"
                avatarUrl={req.avatarUrl ?? null}
                lastSeenAt={req.lastSeenAt ?? null}
                name={req.displayName ?? req.username}
                username={req.username}
                userId={req.userId}
                isAdmin={isAdmin}
                gameTitle={req.gameTitle}
                requestedAt={req.requestedAt}
                dateFmt={dateFmt}
                badges={
                  <>
                    {req.seasonTitle ? <Badge variant="dim" size="sm">{req.seasonTitle}</Badge> : null}
                    <Badge variant={passed ? "military" : "danger"} size="sm">
                      {passed ? t.admin.completions.outcomePassed : t.admin.completions.outcomeDropped}
                    </Badge>
                    <PendingChip color="emerald" label={t.admin.completions.pending} />
                  </>
                }
              >
                {req.reason || req.rating ? (
                  <div className="mt-4 border border-[#3d3d34] bg-background/60 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                      <span className="inline-block h-px w-3 bg-dim/40" aria-hidden />
                      {t.admin.completions.colReason}
                    </div>
                    {req.reason ? (
                      <p className="mt-1.5 text-sm leading-relaxed break-words">{req.reason}</p>
                    ) : null}
                    {req.rating ? (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-amber">
                        <StarIcon className="size-3.5" aria-hidden />
                        {t.admin.completions.colRating}: {req.rating}/10
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="hazard-tape my-4 opacity-30" aria-hidden />

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="border border-emerald-900/50 bg-emerald-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                      <CheckCircleIcon className="size-3.5" aria-hidden />
                      {t.admin.completions.approve}
                    </div>
                    <FormShell
                      action={approveCompletionAction}
                      submitLabel={t.admin.completions.approve}
                      submitClassName="hud-btn hud-btn-primary w-full"
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="requestId" value={req.id} />
                      <p className="text-xs leading-relaxed text-dim">
                        {format(t.admin.completions.approveConfirm, {
                          outcome: passed ? t.admin.completions.outcomePassed : t.admin.completions.outcomeDropped,
                          player: req.displayName ?? req.username,
                        })}
                      </p>
                    </FormShell>
                  </div>

                  <div className="border border-red-900/40 bg-red-950/20 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-red-300">
                      <XCircleIcon className="size-3.5" aria-hidden />
                      {t.admin.completions.reject}
                    </div>
                    <FormShell
                      action={rejectCompletionAction}
                      submitLabel={t.admin.completions.reject}
                      submitClassName="hud-btn hud-btn-danger w-full"
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="requestId" value={req.id} />
                      <Textarea name="adminNote" required minLength={5} rows={2} placeholder={t.admin.completions.rejectPlaceholder} aria-label={t.core.common.reason} />
                    </FormShell>
                  </div>
                </div>
              </RequestCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}