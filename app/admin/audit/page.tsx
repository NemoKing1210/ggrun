import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ClockIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import { db } from "@/lib/db";
import { adminAuditLog, users } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/Badge";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.audit} — GGRun` };
}

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

function actionVariant(action: string): "amber" | "military" | "danger" | "dim" | "sky" | "violet" {
  if (action.includes("delete") || action.includes("block") || action.includes("blacklist")) return "danger";
  if (action.includes("create") || action.includes("add")) return "military";
  if (action.includes("update") || action.includes("change") || action.includes("approve")) return "amber";
  if (action.includes("search") || action.includes("import")) return "sky";
  return "dim";
}

export default async function AuditLogPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t, locale } = await getT();
  const audit = t.admin.audit;

  const rows = await db
    .select({
      entry: adminAuditLog,
      username: users.username,
    })
    .from(adminAuditLog)
    .innerJoin(users, eq(users.id, adminAuditLog.actorId))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(200);

  const dateFmt = new Intl.DateTimeFormat(dateLocales[locale], {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="inline-flex items-center gap-3 font-display text-3xl uppercase tracking-widest text-amber">
            <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <ClockIcon className="size-5" aria-hidden />
            </span>
            {audit.heading}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.admin.audit.kicker}</p>
        </div>
        <span className="inline-flex items-center gap-2 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs uppercase tracking-widest text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          <ShieldCheckIcon className="size-3.5" aria-hidden />
          {rows.length} / 200
        </span>
      </section>
      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <h2 className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-wider">
            <ClockIcon className="size-4 text-amber" aria-hidden />
            Event log
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.audit.mostRecent}</span>
        </div>

        {rows.length === 0 ? (
          <div className="m-4 border border-dashed border-dim/20 bg-background/20 p-8 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <ClockIcon className="mx-auto size-6 text-dim" aria-hidden />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.admin.audit.empty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-raised text-dim text-left border-b border-[#3d3d34]">
                <tr>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest whitespace-nowrap">{audit.colTime}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{audit.colWho}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{audit.colAction}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{audit.colTarget}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{audit.colPayload}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, username }) => (
                  <tr key={entry.id} className="border-b border-[#2a2a22] hover:bg-amber/[0.04] transition-colors">
                    <td className="p-3 whitespace-nowrap font-mono text-xs text-amber/80">{dateFmt.format(entry.createdAt)}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                        <span className="size-1.5 bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                        {username}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant={actionVariant(entry.actionType)} size="sm">
                        {entry.actionType}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 font-mono text-xs">
                        <span className="border border-dim/30 bg-background/60 px-1.5 py-0.5 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                          {entry.targetType}
                        </span>
                        {entry.targetId ? <span className="text-dim">:{entry.targetId.slice(0, 8)}</span> : null}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-dim max-w-[320px]">
                      <span className="block truncate" title={JSON.stringify(entry.payload)}>
                        {JSON.stringify(entry.payload) === "{}" ? "—" : JSON.stringify(entry.payload)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
