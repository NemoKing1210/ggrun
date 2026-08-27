import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";
import {
  UserPlusIcon,
  BoltIcon,
  ShieldCheckIcon,
  ClockIcon,
  UsersIcon,
  TrophyIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.core.auth.registerMetaTitle };
}
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const [{ t }, settings, activeSeason, [{ n: userCount }]] = await Promise.all([
    getT(),
    import("@/lib/repositories/site-settings.repo").then((m) => m.getSiteSettings()),
    getActiveSeason(),
    db.select({ n: count() }).from(users),
  ]);

  return (
    <PageContainer>
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Info panel - on mobile show after form? Keep form first on mobile, info second */}
        <div className="lg:col-span-2 flex flex-col gap-4 order-2 lg:order-1">
          <div className="hud-card relative overflow-hidden p-5 sm:p-6 bg-gradient-to-br from-military/10 via-raised to-raised border-military/20 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="absolute -right-6 -top-6 size-24 opacity-10 rotate-12 pointer-events-none">
              <UserPlusIcon className="size-full text-military" aria-hidden />
            </div>
            <div className="inline-flex items-center gap-1.5 border border-military/30 bg-military/10 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-military [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              <BoltIcon className="size-3.5" aria-hidden /> {t.core.auth.heroBadge}
            </div>
            <h2 className="mt-3 font-display text-2xl uppercase tracking-wide leading-none">{t.core.auth.heroTitleRegister}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.core.auth.heroTextRegister}</p>

            <div className="mt-4 space-y-2">
              <div className="flex gap-2.5 items-center border border-military/20 bg-military/5 p-2.5 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <span className="size-6 shrink-0 inline-flex items-center justify-center bg-military text-black font-mono text-xs [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">1</span>
                <div>
                  <p className="font-display text-xs uppercase tracking-widest leading-none">{t.core.auth.step1}</p>
                  <p className="font-mono text-xs text-dim">{t.core.auth.email} · {t.core.auth.displayName}</p>
                </div>
              </div>
              <div className="flex gap-2.5 items-center border border-amber/20 bg-amber/5 p-2.5 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <span className="size-6 shrink-0 inline-flex items-center justify-center bg-amber text-black font-mono text-xs [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">2</span>
                <div>
                  <p className="font-display text-xs uppercase tracking-widest leading-none">{t.core.auth.step2}</p>
                  <p className="font-mono text-xs text-dim">{t.core.dashboard.rollHint}</p>
                </div>
              </div>
              <div className="flex gap-2.5 items-center border border-dim/20 bg-raised/60 p-2.5 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <span className="size-6 shrink-0 inline-flex items-center justify-center bg-raised border border-[#3d3d34] text-dim font-mono text-xs [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">3</span>
                <div>
                  <p className="font-display text-xs uppercase tracking-widest leading-none">{t.core.auth.step3}</p>
                  <p className="font-mono text-xs text-dim">{t.core.dashboard.boardProgressTitle}</p>
                </div>
              </div>
            </div>

            {activeSeason && (
              <div className="mt-4 border border-dim/20 bg-[#1a1a18] p-3 flex items-center gap-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                <ClockIcon className="size-4 text-amber" aria-hidden />
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.core.common.seasonKicker.replace("{season}", activeSeason.title)}</p>
                  <p className="font-display text-xs uppercase tracking-wide text-amber">{t.core.seasonStatuses[activeSeason.status]} · /{activeSeason.slug}</p>
                </div>
                <ArrowRightIcon className="ml-auto size-3 text-dim" aria-hidden />
              </div>
            )}
          </div>

          <div className="hud-card p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="flex items-center gap-3">
              <span className="size-8 shrink-0 inline-flex items-center justify-center border border-military/30 bg-military/10 text-military [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <ShieldCheckIcon className="size-4" aria-hidden />
              </span>
              <div>
                <p className="font-display text-xs uppercase tracking-widest">Secure by design</p>
                <p className="font-mono text-xs text-dim">{t.core.auth.secureNote}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="border border-dim/20 bg-raised p-2 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <div className="ammo-counter text-lg leading-none text-amber">{userCount}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-dim">operators</div>
              </div>
              <div className="border border-dim/20 bg-raised p-2 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <div className="flex justify-center"><TrophyIcon className="size-4 text-military" aria-hidden /></div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-dim">seasonal run</div>
              </div>
            </div>
          </div>

          <div className="hud-card p-3 flex items-center gap-2 border-dashed [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <UsersIcon className="size-4 text-dim" aria-hidden />
            <span className="font-mono text-xs text-dim">
              {settings.registrationEnabled ? "Registration open" : "Invite-only"} · {settings.maintenanceMode ? "Maintenance" : "Operational"}
            </span>
            <span className="ml-auto size-2 bg-military [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          <RegisterForm invite={invite ?? null} registrationEnabled={settings.registrationEnabled} maintenanceMode={settings.maintenanceMode} />
        </div>
      </div>
    </PageContainer>
  );
}
