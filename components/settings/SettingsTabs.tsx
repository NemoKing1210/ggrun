"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DevicePhoneMobileIcon, UserCircleIcon } from "@heroicons/react/24/outline";

import { useI18n } from "@/lib/i18n/client";
import { SettingsForm } from "./SettingsForm";
import { SettingsSessions } from "./SettingsSessions";
import type { AdminSessionRow } from "@/lib/modules/player/service/admin";

type TabKey = "profile" | "sessions";

type Props = {
  initialTab: TabKey;
  user: {
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    accent: string | null;
    locale: string | null;
    links: unknown;
  };
  sessions: AdminSessionRow[];
  currentSessionId: string | null;
};

export function SettingsTabs({ initialTab, user, sessions, currentSessionId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const switchTab = useCallback(
    (tab: TabKey) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "profile") params.delete("tab");
      else params.set("tab", tab);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [activeTab, pathname, router, searchParams],
  );

  const tabs: Array<{ key: TabKey; icon: typeof UserCircleIcon; count?: number }> = [
    { key: "profile", icon: UserCircleIcon },
    { key: "sessions", icon: DevicePhoneMobileIcon, count: sessions.length },
  ];

  const labels: Record<TabKey, string> = {
    profile: t.settings.tabs.profile,
    sessions: t.settings.tabs.sessions,
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab strip */}
      <nav className="flex flex-wrap gap-1.5 border-b border-[#3d3d34] pb-1" aria-label="Settings tabs">
        {tabs.map(({ key, icon: Icon, count }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-2 font-display text-xs uppercase tracking-widest transition-colors [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
                isActive
                  ? "border border-amber bg-amber text-black"
                  : "border border-[#3d3d34] bg-[#1a1a1a] text-zinc-400 hover:border-amber/40 hover:text-amber"
              }`}
            >
              <Icon className="size-3.5" aria-hidden />
              {labels[key]}
              {typeof count === "number" ? (
                <span
                  className={`ml-0.5 inline-flex min-w-[20px] items-center justify-center border px-1 py-px font-mono text-[10px] leading-none [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${
                    isActive ? "border-black/20 bg-black/10 text-black" : "border-[#3d3d34] bg-[#1a1a1a] text-amber"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Panels */}
      {activeTab === "profile" ? (
        <SettingsForm
          displayName={user.displayName}
          bio={user.bio}
          avatarUrl={user.avatarUrl}
          bannerUrl={user.bannerUrl}
          accent={user.accent}
          locale={user.locale}
          links={user.links}
        />
      ) : (
        <SettingsSessions sessions={sessions} currentSessionId={currentSessionId} locale={user.locale} />
      )}
    </div>
  );
}
