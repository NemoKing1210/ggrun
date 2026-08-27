import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  PlusIcon,
  RocketLaunchIcon,
  Squares2X2Icon,
  TagIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listSeasons } from "@/lib/repositories/seasons.repo";
import {
  changeStatusAction,
  createSeasonAction,
  resetSeasonDirectAction,
} from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Badge } from "@/components/ui/Badge";
import { format } from "@/lib/i18n/format";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getT } from "@/lib/i18n/server";

const statusFlow: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["paused", "finished"],
  paused: ["active", "finished"],
  finished: ["archived"],
  archived: [],
};

const statusVariant: Record<string, "dim" | "military" | "amber" | "danger"> = {
  draft: "dim",
  active: "military",
  paused: "amber",
  finished: "danger",
  archived: "dim",
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.seasons} — GGRun` };
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();

  const seasons = await listSeasons();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <CalendarDaysIcon className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-3xl uppercase tracking-widest text-amber leading-none">
              {t.admin.nav.seasons}
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-widest text-dim">
              {seasons.length} {seasons.length === 1 ? "season" : "seasons"} · HUD tactical console
            </p>
          </div>
          <span className="ml-auto hidden items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dim sm:inline-flex">
            <span className="size-1.5 bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
            {t.admin.nav.console}
          </span>
        </div>
        <div className="hazard-tape my-4" aria-hidden />
      </section>

      {/* New season */}
      <section className="hud-card p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <span className="inline-flex size-7 items-center justify-center bg-amber text-black [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <RocketLaunchIcon className="size-4" aria-hidden />
          </span>
          <h2 className="font-display text-sm uppercase tracking-widest">{t.admin.overview.newSeason}</h2>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-dim">
            <PlusIcon className="size-3.5" aria-hidden /> {t.core.common.create}
          </span>
        </div>
        <div className="p-4">
          <FormShell
            action={createSeasonAction}
            submitLabel={t.core.common.create}
            submitClassName="hud-btn hud-btn-primary !px-6"
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <Field label={t.admin.createSeason.titleLabel}>
              <Input name="title" required placeholder={t.admin.createSeason.titlePlaceholder} />
            </Field>
            <Field label={t.admin.createSeason.slugLabel}>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim">
                  <TagIcon className="size-3.5" aria-hidden />
                </span>
                <Input name="slug" required pattern="[a-z0-9-]+" placeholder="run-1" className="!pl-7" />
              </div>
            </Field>
            <Field label={t.admin.createSeason.cloneLabel}>
              <Select name="cloneFrom" defaultValue="">
                <option value="">{t.admin.createSeason.noCloneOption}</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} — {s.slug}
                  </option>
                ))}
              </Select>
            </Field>
          </FormShell>
          <p className="mt-3 font-mono text-xs text-dim">
            Slug: <span className="text-amber">[a-z0-9-]</span> · clone copies board cells from existing season
          </p>
        </div>
      </section>

      {/* Seasons list */}
      <section className="hud-card p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <span className="inline-flex size-7 items-center justify-center border border-dim/30 bg-background text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <Squares2X2Icon className="size-4" aria-hidden />
          </span>
          <h2 className="font-display text-sm uppercase tracking-widest">{t.admin.overview.seasons}</h2>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-dim">
            {seasons.length === 0 ? t.admin.overview.empty : `${seasons.length} total`}
          </span>
        </div>

        {seasons.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-mono text-sm uppercase tracking-widest text-dim">{t.admin.overview.empty}</p>
            <p className="mt-2 text-xs text-dim">Create your first season above — draft → active → finished</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-raised/90 text-left backdrop-blur-sm">
                  <tr className="border-b border-[#3d3d34] font-mono text-[11px] uppercase tracking-widest text-dim">
                    <th className="px-4 py-3 font-normal">{t.admin.overview.colTitle}</th>
                    <th className="px-4 py-3 font-normal">{t.admin.overview.colSlug}</th>
                    <th className="px-4 py-3 font-normal">{t.admin.overview.colStatus}</th>
                    <th className="px-4 py-3 font-normal">{t.admin.overview.colActions}</th>
                    <th className="px-4 py-3 font-normal">{t.admin.overview.colSections}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a22]">
                  {seasons.map((s) => (
                    <tr key={s.id} className="group hover:bg-amber/[0.04] transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-display text-sm uppercase tracking-wide group-hover:text-amber transition-colors">{s.title}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <TagIcon className="size-3 text-dim" aria-hidden />
                          <span className="text-dim">{s.slug}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant[s.status] ?? "dim"} size="sm">
                          {t.core.seasonStatuses[s.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(statusFlow[s.status] ?? []).length === 0 ? (
                            <span className="font-mono text-xs text-dim">—</span>
                          ) : (
                            (statusFlow[s.status] ?? []).map((next) => (
                              <FormShell
                                key={next}
                                action={changeStatusAction}
                                submitLabel={t.core.seasonStatuses[next as keyof typeof t.core.seasonStatuses]}
                                className="inline-flex items-center gap-2"
                                submitClassName="hud-btn !py-1 !px-2.5 text-[11px] leading-none"
                              >
                                <input type="hidden" name="seasonId" value={s.id} />
                                <input type="hidden" name="status" value={next} />
                              </FormShell>
                            ))
                          )}
                          {s.status !== "draft" && s.status !== "archived" && (
                            <form action={resetSeasonDirectAction} className="inline-flex">
                              <input type="hidden" name="seasonId" value={s.id} />
                              <ConfirmButton
                                message={format(t.admin.overview.resetConfirm, { season: s.title })}
                                className="hud-btn hud-btn-danger !py-1 !px-2.5 text-[11px] leading-none inline-flex items-center gap-1"
                              >
                                <ArrowPathIcon className="size-3" aria-hidden />
                                {t.admin.overview.resetButton}
                              </ConfirmButton>
                            </form>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <Link href={`/admin/seasons/${s.id}`} className="hud-btn !px-2.5 !py-1 text-[11px] inline-flex items-center gap-1">
                            <Cog6ToothIcon className="size-3" aria-hidden /> {t.admin.overview.linkSettings}
                          </Link>
                          <Link href={`/admin/seasons/${s.id}/board`} className="hud-btn !px-2.5 !py-1 text-[11px] inline-flex items-center gap-1">
                            <Squares2X2Icon className="size-3" aria-hidden /> {t.admin.overview.linkBoard}
                          </Link>
                          <Link href={`/admin/seasons/${s.id}/players`} className="hud-btn !px-2.5 !py-1 text-[11px] inline-flex items-center gap-1">
                            <UsersIcon className="size-3" aria-hidden /> {t.admin.overview.linkPlayers}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 p-3 sm:hidden">
              {seasons.map((s) => (
                <div key={s.id} className="border border-[#3d3d34] bg-background p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-sm uppercase tracking-wide">{s.title}</span>
                    <Badge variant={statusVariant[s.status] ?? "dim"} size="sm">
                      {t.core.seasonStatuses[s.status]}
                    </Badge>
                  </div>
                  <span className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-dim">
                    <TagIcon className="size-3" aria-hidden /> {s.slug}
                  </span>
                  {((statusFlow[s.status] ?? []).length > 0 || (s.status !== "draft" && s.status !== "archived")) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(statusFlow[s.status] ?? []).map((next) => (
                        <FormShell
                          key={next}
                          action={changeStatusAction}
                          submitLabel={t.core.seasonStatuses[next as keyof typeof t.core.seasonStatuses]}
                          className="inline-flex"
                          submitClassName="hud-btn !py-1 !px-2.5 text-[11px]"
                        >
                          <input type="hidden" name="seasonId" value={s.id} />
                          <input type="hidden" name="status" value={next} />
                        </FormShell>
                      ))}
                      {s.status !== "draft" && s.status !== "archived" && (
                        <form action={resetSeasonDirectAction} className="inline-flex">
                          <input type="hidden" name="seasonId" value={s.id} />
                          <ConfirmButton
                            message={format(t.admin.overview.resetConfirm, { season: s.title })}
                            className="hud-btn hud-btn-danger !py-1 !px-2.5 text-[11px] inline-flex items-center gap-1"
                          >
                            <ArrowPathIcon className="size-3" aria-hidden />
                            {t.admin.overview.resetButton}
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Link href={`/admin/seasons/${s.id}`} className="hud-btn !px-2.5 !py-1 text-[11px] flex-1 justify-center">
                      {t.admin.overview.linkSettings}
                    </Link>
                    <Link href={`/admin/seasons/${s.id}/board`} className="hud-btn !px-2.5 !py-1 text-[11px] flex-1 justify-center">
                      {t.admin.overview.linkBoard}
                    </Link>
                    <Link href={`/admin/seasons/${s.id}/players`} className="hud-btn !px-2.5 !py-1 text-[11px] flex-1 justify-center">
                      {t.admin.overview.linkPlayers}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Quick links */}
      <section className="hud-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">NAVIGATE</span>
          <span className="h-3 w-px bg-dim/20" aria-hidden />
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/games-catalog" className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5">
              {t.admin.overview.catalogLink}
              <ArrowRightIcon className="h-3 w-3" aria-hidden />
            </Link>
            <Link href="/admin/audit" className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5">
              {t.admin.overview.auditLink}
              <ArrowRightIcon className="h-3 w-3" aria-hidden />
            </Link>
            <Link href="/admin/rerolls" className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5">
              {t.admin.nav.rerolls}
              <ArrowRightIcon className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
