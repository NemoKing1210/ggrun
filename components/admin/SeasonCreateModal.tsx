"use client";

import { useActionState, useEffect, useState } from "react";
import { PlusIcon, RocketLaunchIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { createSeasonAction } from "@/lib/modules/season/actions/seasons";
import { useI18n } from "@/lib/i18n/client";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { DebugError } from "@/components/ui/DebugError";
import { SeasonSlugFields } from "@/components/admin/SeasonSlugFields";

type SeasonOption = { id: string; title: string; slug: string };

/**
 * "New season" flow in a HUD modal: title + auto-transliterated slug live,
 * optional board cloning, server-side validation with inline errors.
 * Closes automatically on success (the list below revalidates).
 */
export function SeasonCreateModal({ seasons }: { seasons: SeasonOption[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createSeasonAction, {});
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    if (state?.ok && !justCreated) {
      setJustCreated(true);
      const timer = window.setTimeout(() => {
        setOpen(false);
        setJustCreated(false);
      }, 900);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hud-btn hud-btn-primary inline-flex items-center gap-2 !py-2"
      >
        <PlusIcon className="size-4" aria-hidden />
        {t.admin.overview.newSeason}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} panelClassName="max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center border border-amber/40 bg-amber/10 text-amber shadow-[0_0_14px_rgba(251,191,36,0.18)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <RocketLaunchIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl uppercase tracking-wider leading-none text-zinc-100">
                {t.admin.overview.newSeason}
              </h2>
              <p className="mt-1.5 max-w-md font-mono text-[11px] uppercase tracking-widest text-dim">
                {t.admin.createSeason.titlePlaceholder} · draft → active → finished
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="hud-btn !p-2 !text-dim hover:!text-amber"
            aria-label={t.core.common.cancel}
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        <div className="hazard-tape my-4 opacity-70" aria-hidden />

        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SeasonSlugFields />
            <Field label={t.admin.createSeason.cloneLabel} className="sm:col-span-2">
              <Select name="cloneFrom" defaultValue="">
                <option value="">{t.admin.createSeason.noCloneOption}</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} — {s.slug}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {state?.error && (
            <div className="border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <p className="text-sm text-red-300" role="alert">
                {state.error}
              </p>
              <DebugError debug={state.debug} title="new season" />
            </div>
          )}
          {state?.ok && (
            <div className="border border-emerald-800 bg-emerald-950/30 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <p className="text-sm text-emerald-300">{state.ok}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="hud-btn">
              {t.core.common.cancel}
            </button>
            <button type="submit" disabled={pending} className="hud-btn hud-btn-primary inline-flex min-w-28 items-center justify-center gap-2">
              {pending ? (
                "…"
              ) : (
                <>
                  <PlusIcon className="size-4" aria-hidden />
                  {t.core.common.create}
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}