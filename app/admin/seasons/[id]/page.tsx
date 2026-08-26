import { notFound, redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getSeasonById } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/game-engine";
import SeasonSettingsForm from "@/components/admin/SeasonSettingsForm";

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

  const parsed = SeasonConfigSchema.safeParse(season.config);
  const config = parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {format(t.admin.settings.heading, { season: season.title })}
      </h1>
      <div className="hazard-tape" aria-hidden />
      <p className="text-sm text-zinc-400">
        Flexible run settings: templates, dice, board cells and game pool — all editable at any time. No JSON required.
      </p>
      <SeasonSettingsForm seasonId={season.id} initialConfig={config} initialRulesMd={season.rulesMd ?? ""} />
    </div>
  );
}
