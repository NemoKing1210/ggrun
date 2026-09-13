import { CheckCircleIcon } from "@heroicons/react/24/outline";

import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { RejectWithNoteButton } from "@/components/admin/RejectWithNoteButton";
import { format } from "@/lib/i18n/format";

type BulkLabels = {
  barLabel: string;
  approveAll: string;
  rejectAll: string;
  rejectTitle: string;
  confirmApprove: string;
  notePlaceholder: string;
  cancelLabel: string;
  tooShortError: string;
};

type BulkAction = (formData: FormData) => Promise<void>;

/**
 * Quick-action bar above a moderation queue: approve everything with one
 * confirm, or reject everything with a single shared reason collected in a
 * HUD modal.
 *
 * Server-rendered: both verdicts are plain void-shape `<form action>` posts
 * (the AGENTS.md simple-control recipe). Rendered only when `ids` is
 * non-empty. No inline inputs — the shared reason lives in the reject modal.
 */
export function ModerationBulkBar({
  ids,
  approveAction,
  rejectAction,
  labels,
}: {
  ids: string[];
  approveAction: BulkAction;
  rejectAction: BulkAction;
  labels: BulkLabels;
}) {
  if (ids.length === 0) return null;
  const joined = ids.join(",");
  return (
    <div className="hud-card flex flex-col gap-3 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] lg:flex-row lg:items-center">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim lg:min-w-0">
        <span className="inline-block h-3 w-[6px] animate-pulse bg-amber/70" aria-hidden />
        {"// "}
        {labels.barLabel}
        <span className="ammo-counter inline-flex min-w-5 items-center justify-center bg-raised px-1.5 py-0.5 text-xs text-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
          {ids.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:ml-auto">
        <form action={approveAction}>
          <input type="hidden" name="ids" value={joined} />
          <ConfirmButton
            message={format(labels.confirmApprove, { count: ids.length })}
            danger={false}
            className="hud-btn hud-btn-primary inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap !px-3 !py-2 text-xs sm:w-auto"
          >
            <CheckCircleIcon className="size-4" aria-hidden />
            {labels.approveAll}
            <span className="font-mono opacity-70">×{ids.length}</span>
          </ConfirmButton>
        </form>

        <form action={rejectAction}>
          <input type="hidden" name="ids" value={joined} />
          <RejectWithNoteButton
            fieldName="sharedNote"
            count={ids.length}
            submitLabel={labels.rejectAll}
            title={format(labels.rejectTitle, { count: ids.length })}
            notePlaceholder={labels.notePlaceholder}
            confirmLabel={labels.rejectAll}
            cancelLabel={labels.cancelLabel}
            tooShortError={labels.tooShortError}
            className="hud-btn hud-btn-danger inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap !px-3 !py-2 text-xs sm:w-auto"
          />
        </form>
      </div>
    </div>
  );
}
