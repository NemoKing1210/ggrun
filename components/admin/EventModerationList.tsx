"use client";

import { useActionState } from "react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { approveEventAction, rejectEventAction } from "@/lib/modules/iee/actions";

export type EventSubmission = {
  id: string;
  title: string;
  descriptionMd: string;
  proof: string | null;
  requiresProof: boolean;
  submittedAt: string | null;
  username: string;
  reward: { points?: number; itemKey?: string; effectKey?: string };
};

/** Judge queue for challenge submissions. */
export function EventModerationList({
  submissions,
  itemNames,
  effectNames,
}: {
  submissions: EventSubmission[];
  itemNames: Record<string, string>;
  effectNames: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const m = t.iee.events.moderation;
  const [approveState, approve, approving] = useActionState(approveEventAction, {});
  const [rejectState, reject, rejecting] = useActionState(rejectEventAction, {});
  const busy = approving || rejecting;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  const rewardText = (reward: EventSubmission["reward"]): string => {
    const parts: string[] = [];
    if (reward.points) parts.push(format(t.iee.events.rewardPoints, { count: String(reward.points) }));
    if (reward.itemKey) parts.push(itemNames[reward.itemKey] ?? reward.itemKey);
    if (reward.effectKey) parts.push(effectNames[reward.effectKey] ?? reward.effectKey);
    return parts.length > 0 ? parts.join(" · ") : t.iee.events.noReward;
  };

  if (submissions.length === 0) {
    return (
      <div className="hud-card p-8 text-center text-dim">
        <p className="font-mono text-sm uppercase tracking-widest">{m.empty}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(approveState.error || rejectState.error) && (
        <div className="hud-card border-danger/30 bg-danger/10 p-3">
          <p className="text-sm text-danger" role="alert">
            {approveState.error ?? rejectState.error}
          </p>
          <DebugError debug={approveState.debug ?? rejectState.debug} title="event" />
        </div>
      )}

      {submissions.map((row) => (
        <article key={row.id} className="hud-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-sm uppercase tracking-wider text-amber">
              {row.title}
            </span>
            <Badge variant="neutral">{row.username}</Badge>
            {row.submittedAt && (
              <span className="ammo-counter ml-auto text-[11px] text-dim">
                {format(m.submittedAt, { date: dateFmt.format(new Date(row.submittedAt)) })}
              </span>
            )}
          </div>

          <p className="mt-2 whitespace-pre-wrap text-xs text-dim">{row.descriptionMd}</p>

          <div className="mt-3 border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <p className="font-display text-[11px] uppercase tracking-widest text-zinc-400">
              {m.proof}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-100">
              {row.proof ?? <span className="text-dim">{m.noProof}</span>}
            </p>
          </div>

          <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-military">
            {m.willGrant} {rewardText(row.reward)}
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex-1 text-sm">
              <span className="font-mono text-xs uppercase tracking-widest text-dim">
                {m.noteLabel}
              </span>
              <input name="adminNote" form={`approve-${row.id}`} className="mt-1 w-full" />
            </label>
            <form id={`approve-${row.id}`} action={approve}>
              <input type="hidden" name="playerEventId" value={row.id} />
              <button
                type="submit"
                className="hud-btn hud-btn-primary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs"
                disabled={busy}
              >
                <CheckCircleIcon className="size-4" aria-hidden />
                {m.approve}
              </button>
            </form>
            <form action={reject}>
              <input type="hidden" name="playerEventId" value={row.id} />
              <button
                type="submit"
                className="hud-btn hud-btn-danger inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs"
                disabled={busy}
              >
                <XCircleIcon className="size-4" aria-hidden />
                {m.reject}
              </button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
