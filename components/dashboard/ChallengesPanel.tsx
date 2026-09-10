"use client";

import { useActionState, useEffect, useState } from "react";
import { FlagIcon } from "@heroicons/react/24/outline";

import { EntryDescription } from "@/components/iee/EntryDescription";
import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { submitEventProofAction } from "@/lib/modules/iee/actions";

export type ChallengeRow = {
  id: string;
  title: string;
  descriptionMd: string;
  status: "assigned" | "submitted" | "approved" | "rejected" | "expired";
  requiresProof: boolean;
  proof: string | null;
  adminNote: string | null;
  dueAt: string | null;
  reward: { points?: number; itemKey?: string; effectKey?: string };
};

const STATUS_VARIANT: Record<ChallengeRow["status"], "amber" | "military" | "danger" | "dim"> = {
  assigned: "amber",
  submitted: "dim",
  approved: "military",
  rejected: "danger",
  expired: "dim",
};

/** Challenges assigned to the player, and the form that sends proof. */
export function ChallengesPanel({
  challenges,
  itemNames,
  effectNames,
}: {
  challenges: ChallengeRow[];
  itemNames: Record<string, string>;
  effectNames: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const e = t.iee.events;
  const [state, formAction, pending] = useActionState(submitEventProofAction, {});
  const [proving, setProving] = useState<ChallengeRow | null>(null);

  useEffect(() => {
    if (state.ok) setProving(null);
  }, [state.ok]);

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  const rewardText = (reward: ChallengeRow["reward"]): string => {
    const parts: string[] = [];
    if (reward.points) parts.push(format(e.rewardPoints, { count: String(reward.points) }));
    if (reward.itemKey) parts.push(itemNames[reward.itemKey] ?? reward.itemKey);
    if (reward.effectKey) parts.push(effectNames[reward.effectKey] ?? reward.effectKey);
    return parts.length > 0 ? parts.join(" · ") : e.noReward;
  };

  return (
    <section className="hud-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <FlagIcon className="size-4 text-amber" aria-hidden />
        <h2 className="font-display text-sm uppercase tracking-widest text-amber">{e.heading}</h2>
        {challenges.length > 0 && (
          <span className="ammo-counter ml-auto text-xs text-dim">{challenges.length}</span>
        )}
      </div>

      {challenges.length === 0 ? (
        <p className="text-xs text-dim">{e.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {challenges.map((row) => (
            <li
              key={row.id}
              className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm uppercase tracking-wider text-zinc-100">
                  {row.title}
                </span>
                <Badge variant={STATUS_VARIANT[row.status]}>{e.status[row.status]}</Badge>
                <span className="ammo-counter ml-auto text-[11px] text-dim">
                  {row.dueAt
                    ? format(e.dueAt, { date: dateFmt.format(new Date(row.dueAt)) })
                    : e.noDeadline}
                </span>
              </div>

              <EntryDescription className="whitespace-pre-wrap">{row.descriptionMd}</EntryDescription>

              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-military">
                {e.reward}: {rewardText(row.reward)}
              </p>

              {row.adminNote && (
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {e.adminNote}: {row.adminNote}
                </p>
              )}

              {row.status === "assigned" && (
                <button
                  type="button"
                  className="hud-btn hud-btn-primary mt-2 !px-3 !py-1 text-xs"
                  onClick={() => setProving(row)}
                  disabled={pending}
                >
                  {e.submit}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {state.error && (
        <div className="mt-3">
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
          <DebugError debug={state.debug} title="challenge" />
        </div>
      )}

      <Modal open={proving !== null} onClose={() => setProving(null)}>
        <div>
          <h3 className="font-display text-lg uppercase tracking-widest">{proving?.title}</h3>
          <div className="hazard-tape mt-3 opacity-60" aria-hidden />
        </div>
        <p className="mt-3 whitespace-pre-wrap text-xs text-dim">{proving?.descriptionMd}</p>

        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="playerEventId" value={proving?.id ?? ""} />
          <Field label={e.proofLabel} hint={e.proofHint}>
            <Textarea
              name="proof"
              rows={3}
              required={proving?.requiresProof}
              minLength={proving?.requiresProof ? 5 : undefined}
              placeholder={e.proofPlaceholder}
              disabled={pending}
            />
          </Field>
          {state.error && (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" className="hud-btn hud-btn-primary" disabled={pending}>
              {e.send}
            </button>
            <button
              type="button"
              className="hud-btn"
              onClick={() => setProving(null)}
              disabled={pending}
            >
              {e.cancel}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
