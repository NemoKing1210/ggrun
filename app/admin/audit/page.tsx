import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClockIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { searchAdminAudit, type AuditPeriod } from "@/lib/infrastructure/events";
import { getT } from "@/lib/i18n/server";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";

const PAGE_SIZE = 40;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.audit} — GGRun` };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseAuditPeriod(value: string | undefined): AuditPeriod | undefined {
  return value === "24h" || value === "7d" || value === "30d" || value === "all" ? value : undefined;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t, locale } = await getT();
  const a = t.admin.audit;

  const sp = await searchParams;
  const requestedPage = Number(firstParam(sp.page));
  const requested = Number.isFinite(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const result = await searchAdminAudit({
    q: firstParam(sp.q),
    actionType: firstParam(sp.action),
    targetType: firstParam(sp.target),
    period: parseAuditPeriod(firstParam(sp.period)),
    page: requested,
    pageSize: PAGE_SIZE,
  });

  const page = Math.min(result.pages, requested);
  const filters = {
    q: firstParam(sp.q) ?? "",
    action: firstParam(sp.action) ?? "",
    target: firstParam(sp.target) ?? "",
    period: parseAuditPeriod(firstParam(sp.period)) ?? ("all" as AuditPeriod),
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="inline-flex items-center gap-3 font-display text-3xl uppercase tracking-widest text-amber">
            <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <ClockIcon className="size-5" aria-hidden />
            </span>
            {a.heading}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{a.kicker}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs uppercase tracking-widest text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <ShieldCheckIcon className="size-3.5" aria-hidden />
            {result.total}
          </span>
        </div>
      </section>
      <div className="hazard-tape" aria-hidden />

      <AuditLogViewer
        rows={result.rows}
        total={result.total}
        pages={result.pages}
        page={page}
        pageSize={PAGE_SIZE}
        actionTypes={result.actionTypes}
        targetTypes={result.targetTypes}
        filters={filters}
        locale={locale}
        isAdmin={user.role === "admin"}
      />
    </div>
  );
}