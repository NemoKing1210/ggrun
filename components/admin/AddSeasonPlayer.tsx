"use client";

import { useActionState, useMemo, useState } from "react";
import { MagnifyingGlassIcon, UserPlusIcon } from "@heroicons/react/24/outline";

import { addPlayerToSeasonAction } from "@/lib/modules/season/actions/players";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DebugError } from "@/components/ui/DebugError";

type Candidate = { id: string; username: string; displayName: string | null };

/** Add-a-participant panel: live user filter + picker + submit with inline feedback. */
export function AddSeasonPlayer({
  seasonId,
  candidates,
  t,
}: {
  seasonId: string;
  candidates: Candidate[];
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState(addPlayerToSeasonAction, {} as never);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return candidates;
    const s = q.toLowerCase();
    return candidates.filter(
      (u) =>
        u.username.toLowerCase().includes(s) ||
        (u.displayName ?? "").toLowerCase().includes(s),
    );
  }, [candidates, q]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest">
          <span className="inline-flex size-7 items-center justify-center bg-amber/10 border border-amber/30 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <UserPlusIcon className="size-4" aria-hidden />
          </span>
          {t.admin.players.addHeading}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
          {"// "}
          {format(t.admin.players.availableCount, { count: String(filtered.length) })}
        </span>
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="seasonId" value={seasonId} />
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
          <Field label={t.admin.players.searchLabel}>
            <div className="relative">
              <MagnifyingGlassIcon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.admin.players.filterUsersPlaceholder}
                className="!pl-9"
              />
            </div>
          </Field>
          <Field label={t.admin.players.userLabel}>
            <Select name="userId" required defaultValue="">
              <option value="" disabled>
                {t.admin.players.pickUserOption}
              </option>
              {filtered.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName ?? u.username} (@{u.username})
                </option>
              ))}
            </Select>
          </Field>
          <button
            type="submit"
            disabled={pending}
            className="hud-btn hud-btn-primary inline-flex items-center justify-center gap-1.5 !px-4 !py-2 text-xs"
          >
            <UserPlusIcon className="size-4" aria-hidden />
            {t.core.common.add}
          </button>
        </div>

        {state?.error && (
          <div className="border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <p className="text-sm text-red-300" role="alert">
              {state.error}
            </p>
            <DebugError debug={state.debug} title="add player" />
          </div>
        )}
        {state?.ok && (
          <div className="border border-emerald-800 bg-emerald-950/30 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <p className="text-sm text-emerald-300">{state.ok}</p>
          </div>
        )}
      </form>
    </>
  );
}