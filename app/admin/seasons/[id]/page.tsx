import { notFound, redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getSeasonById } from "@/lib/repositories/seasons.repo";
import { updateSeasonSettingsAction } from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { DEFAULT_SEASON_CONFIG } from "@/game-engine";

export default async function SeasonSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();

  const { id } = await params;
  const season = await getSeasonById(id);
  if (!season) notFound();

  const configJson = JSON.stringify(
    Object.keys(season.config as object).length > 0 ? season.config : DEFAULT_SEASON_CONFIG,
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {format(t.admin.settings.heading, { season: season.title })}
      </h1>
      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          {t.admin.settings.configHeading}
        </h2>
        <FormShell action={updateSeasonSettingsAction} submitLabel={t.core.common.save}>
          <input type="hidden" name="seasonId" value={season.id} />
          <label className="text-dim text-sm">
            {t.admin.settings.configLabel}
            <textarea name="config" rows={16} className="font-mono text-xs" defaultValue={configJson} />
          </label>
          <label className="text-dim text-sm">
            {t.admin.settings.rulesLabel}
            <textarea
              name="rulesMd"
              rows={10}
              defaultValue={season.rulesMd ?? ""}
              placeholder={t.admin.settings.rulesPlaceholder}
            />
          </label>
        </FormShell>
      </section>
    </div>
  );
}
