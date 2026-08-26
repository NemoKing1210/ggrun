import { notFound, redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getSeasonById } from "@/lib/repositories/seasons.repo";
import { updateSeasonSettingsAction } from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { DEFAULT_SEASON_CONFIG } from "@/game-engine";

export default async function SeasonSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
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
        Настройки · {season.title}
      </h1>
      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          Конфиг правил (JSON) и текст правил
        </h2>
        <FormShell action={updateSeasonSettingsAction} submitLabel="Сохранить">
          <input type="hidden" name="seasonId" value={season.id} />
          <label className="text-dim text-sm">
            season.config (валидация по Zod-схеме SeasonConfigSchema)
            <textarea name="config" rows={16} className="font-mono text-xs" defaultValue={configJson} />
          </label>
          <label className="text-dim text-sm">
            Правила сезона (Markdown)
            <textarea
              name="rulesMd"
              rows={10}
              defaultValue={season.rulesMd ?? ""}
              placeholder="# Правила&#10;Текст для страницы /rules..."
            />
          </label>
        </FormShell>
      </section>
    </div>
  );
}
