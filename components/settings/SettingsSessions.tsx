"use client";

import { useMemo } from "react";
import { DevicePhoneMobileIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { useI18n } from "@/lib/i18n/client";
import { revokeOtherSessionsAction, revokeOwnSessionAction } from "@/lib/modules/player/actions";
import type { AdminSessionRow } from "@/lib/modules/player/service/admin";

type Props = {
  sessions: AdminSessionRow[];
  currentSessionId: string | null;
  locale: string | null;
};

export function SettingsSessions({ sessions, currentSessionId, locale }: Props) {
  const { t } = useI18n();
  const s = t.settings.sessions;

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale ?? undefined, { dateStyle: "short", timeStyle: "short" }),
    [locale],
  );

  const activeCount = sessions.filter((s) => s.isActive).length;
  const hasOthers = sessions.length > 1 && currentSessionId !== null;

  return (
    <section className="hud-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <DevicePhoneMobileIcon className="h-5 w-5 text-amber" aria-hidden />
            <h2 className="font-display text-xl uppercase tracking-wider text-amber">
              {s.heading}
              <span className="ml-2 font-mono text-xs tracking-widest text-dim">[{sessions.length}]</span>
            </h2>
          </div>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-zinc-500">{s.hint}</p>
          {sessions.length > 0 ? (
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-dim">
              {activeCount} {s.activeBadge} · {sessions.length - activeCount} {s.expiredBadge}
            </p>
          ) : null}
        </div>
        {hasOthers ? (
          <form action={revokeOtherSessionsAction}>
            <ConfirmButton
              message={s.revokeOthersConfirm}
              className="hud-btn !px-3 !py-1.5 text-xs"
            >
              {s.revokeOthers}
            </ConfirmButton>
          </form>
        ) : null}
      </div>
      <div className="hazard-tape my-4 opacity-60" aria-hidden />

      {sessions.length === 0 ? (
        <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-dim">{s.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => {
            const isCurrent = session.id === currentSessionId;
            const isActive = session.isActive;
            return (
              <div
                key={session.id}
                className={`flex flex-wrap items-center justify-between gap-3 border p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
                  isCurrent
                    ? "border-amber/40 bg-amber/10"
                    : isActive
                      ? "border-[#3d3d34] bg-[#1a1a1a]"
                      : "border-[#2a2a22] bg-[#161615] opacity-70"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest ${
                        isCurrent ? "text-amber" : isActive ? "text-military" : "text-dim"
                      }`}
                    >
                      <span
                        className={`inline-block h-2 w-2 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)] ${
                          isCurrent ? "bg-amber animate-pulse" : isActive ? "bg-military" : "bg-dim"
                        }`}
                        aria-hidden
                      />
                      {isCurrent ? s.currentBadge : isActive ? s.activeBadge : s.expiredBadge}
                    </span>
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                        <ShieldCheckIcon className="h-3 w-3" aria-hidden />
                        you
                      </span>
                    ) : null}
                    <span className="truncate font-mono text-xs text-zinc-400">ID {session.id.slice(0, 8)}…</span>
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-dim">
                    {s.colCreated}: <span className="text-zinc-300">{dateFmt.format(session.createdAt)}</span>
                    <span className="mx-2 text-dim/50">·</span>
                    {s.colExpires}:{" "}
                    <span className={isActive ? "text-zinc-300" : "text-danger"}>{dateFmt.format(session.expiresAt)}</span>
                  </p>
                </div>
                <form action={revokeOwnSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <ConfirmButton
                    message={isCurrent ? s.revokeCurrentConfirm : s.revokeConfirm}
                    className={`hud-btn !px-2.5 !py-1.5 text-xs ${isCurrent ? "hud-btn-danger" : ""}`}
                  >
                    {s.revoke}
                  </ConfirmButton>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
