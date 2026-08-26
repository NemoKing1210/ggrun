import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { adminAuditLog, users } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

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
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {audit.heading}
      </h1>
      <div className="hazard-tape" aria-hidden />
      <section className="hud-card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-dim text-left border-b border-[#3d3d34]">
            <tr>
              <th className="p-2">{audit.colTime}</th>
              <th className="p-2">{audit.colWho}</th>
              <th className="p-2">{audit.colAction}</th>
              <th className="p-2">{audit.colTarget}</th>
              <th className="p-2">{audit.colPayload}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, username }) => (
              <tr key={entry.id} className="border-b border-[#2a2a22]">
                <td className="p-2 whitespace-nowrap font-mono text-xs">
                  {dateFmt.format(entry.createdAt)}
                </td>
                <td className="p-2">{username}</td>
                <td className="p-2 font-mono text-xs">{entry.actionType}</td>
                <td className="p-2 font-mono text-xs">
                  {entry.targetType}
                  {entry.targetId ? `:${entry.targetId.slice(0, 8)}` : ""}
                </td>
                <td className="p-2 font-mono text-xs text-dim max-w-md truncate">
                  {JSON.stringify(entry.payload)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
