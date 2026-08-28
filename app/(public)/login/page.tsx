import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getActiveSeason } from "@/lib/modules/season/repository/seasons";
import { db } from "@/lib/infrastructure/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";
import { LoginForm } from "@/components/auth/LoginForm";
import { PageContainer } from "@/components/ui/PageContainer";
import {
  TrophyIcon,
  MapIcon,
  SignalIcon,
  ShieldCheckIcon,
  BoltIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.core.auth.loginMetaTitle };
}

export default async function LoginPage() {
  const { t } = await getT();
  const [activeSeason, [{ n: userCount }]] = await Promise.all([
    getActiveSeason(),
    db.select({ n: count() }).from(users),
  ]);

  return (
    <PageContainer>
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <div className="lg:col-span-3">
          <LoginForm />
          <p className="mt-3 text-center font-mono text-xs text-zinc-500">{t.core.auth.secureNote}</p>
        </div>

        {/* Info panel */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="hud-card relative overflow-hidden p-5 sm:p-6 bg-gradient-to-br from-amber/10 via-raised to-raised border-amber/20 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="absolute -right-6 -top-6 size-24 opacity-10 rotate-12 pointer-events-none">
              <ShieldCheckIcon className="size-full text-amber" aria-hidden />
            </div>
            <div className="inline-flex items-center gap-1.5 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              <BoltIcon className="size-3.5" aria-hidden /> {t.core.auth.heroBadge}
            </div>
            <h2 className="mt-3 font-display text-2xl uppercase tracking-wide leading-none">{t.core.auth.heroTitleLogin}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.core.auth.heroTextLogin}</p>

            {activeSeason && (
              <div className="mt-4 border border-amber/20 bg-[#1a1a18] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                <p className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.core.common.seasonKicker.replace("{season}", activeSeason.title)}</p>
                <p className="mt-1 font-display text-sm uppercase tracking-wide text-amber">{activeSeason.title} · {t.core.seasonStatuses[activeSeason.status]}</p>
              </div>
            )}

            <div className="mt-4 grid gap-2">
              <div className="flex gap-3 border border-dim/20 bg-raised/60 p-3 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <span className="size-8 shrink-0 inline-flex items-center justify-center border border-military/30 bg-military/10 text-military [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <SignalIcon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-xs uppercase tracking-widest">{t.core.auth.benefitTrack}</p>
                  <p className="font-mono text-xs text-dim">{t.core.auth.benefitTrackHint}</p>
                </div>
              </div>
              <div className="flex gap-3 border border-dim/20 bg-raised/60 p-3 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <span className="size-8 shrink-0 inline-flex items-center justify-center border border-amber/30 bg-amber/10 text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <MapIcon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-xs uppercase tracking-widest">{t.core.auth.benefitRoll}</p>
                  <p className="font-mono text-xs text-dim">{t.core.auth.benefitRollHint}</p>
                </div>
              </div>
              <div className="flex gap-3 border border-dim/20 bg-raised/60 p-3 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <span className="size-8 shrink-0 inline-flex items-center justify-center border border-violet-500/30 bg-violet-950/20 text-violet-300 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <TrophyIcon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-xs uppercase tracking-widest">{t.core.auth.benefitClimb}</p>
                  <p className="font-mono text-xs text-dim">{t.core.auth.benefitClimbHint}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="hud-card p-4 flex items-center gap-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <span className="size-8 shrink-0 inline-flex items-center justify-center border border-[#3d3d34] bg-raised text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              <UsersIcon className="size-4" aria-hidden />
            </span>
            <div>
              <div className="ammo-counter text-lg leading-none text-amber">{userCount}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">operators registered</div>
            </div>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-dim hidden sm:inline">GGRun · HUD</span>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
