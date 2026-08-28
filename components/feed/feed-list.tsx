import Link from "next/link";
import type { FeedRow } from "@/lib/modules/season/repository/players";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  CubeIcon,
  FlagIcon,
  StarIcon,
  UserPlusIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

function payloadOf(entry: FeedRow): Record<string, unknown> {
  if (entry.payload && typeof entry.payload === "object") return entry.payload as Record<string, unknown>;
  return {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function diceStr(payload: Record<string, unknown>): string | null {
  const d = payload.dice;
  if (!Array.isArray(d)) return null;
  const nums = d.filter((x): x is number => typeof x === "number");
  return nums.length ? nums.join(" + ") : null;
}

type Variant = "amber" | "military" | "danger" | "sky" | "violet" | "dim" | "neutral";

function eventMeta(type: string): { variant: Variant; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string } {
  switch (type) {
    case "game_rolled":
    case "game_rerolled":
    case "reroll_requested":
      return { variant: "amber", Icon: CubeIcon, label: type };
    case "game_passed":
      return { variant: "military", Icon: CheckCircleIcon, label: type };
    case "game_dropped":
      return { variant: "danger", Icon: XCircleIcon, label: type };
    case "moved":
      return { variant: "sky", Icon: ArrowsRightLeftIcon, label: type };
    case "player_joined":
      return { variant: "violet", Icon: UserPlusIcon, label: type };
    case "season_started":
      return { variant: "amber", Icon: FlagIcon, label: type };
    case "admin_adjustment":
      return { variant: "dim", Icon: WrenchScrewdriverIcon, label: type };
    case "reroll_rejected":
      return { variant: "danger", Icon: XCircleIcon, label: type };
    default:
      return { variant: "neutral", Icon: SparklesIcon, label: type };
  }
}

const variantStyles: Record<Variant, string> = {
  amber: "border-amber bg-amber text-black",
  military: "border-military bg-military text-black",
  danger: "border-danger bg-danger text-white",
  sky: "border-sky-400 bg-sky-500 text-black",
  violet: "border-violet-400 bg-violet-500 text-white",
  dim: "border-dim/30 bg-raised text-dim",
  neutral: "border-dim/20 bg-raised text-dim",
};

const dotStyles: Record<Variant, string> = {
  amber: "bg-amber border-amber shadow-[0_0_8px_rgba(242,169,0,0.5)]",
  military: "bg-military border-military",
  danger: "bg-danger border-danger",
  sky: "bg-sky-500 border-sky-400",
  violet: "bg-violet-500 border-violet-400",
  dim: "bg-zinc-600 border-zinc-500",
  neutral: "bg-dim border-dim/40",
};

function PlayerLink({ entry, fallback }: { entry: FeedRow; fallback: string }) {
  const name = entry.displayName ?? entry.username ?? fallback;
  const username = entry.username;
  if (username) {
    return (
      <Link href={`/players/${username}`} className="font-semibold text-amber hover:underline">
        {name}
      </Link>
    );
  }
  return <span className="font-semibold text-amber">{name}</span>;
}

function EventLine({ entry, t }: { entry: FeedRow; t: Dictionary["feed"] }) {
  const p = payloadOf(entry);
  const dice = diceStr(p);
  const diceSuffix = dice ? ` ${format(t.diceSuffix, { dice })}` : null;
  switch (entry.eventType) {
    case "game_rolled": {
      const title = str(p.title) ?? t.unknownTitle;
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {format(t.actions.rolled, { title })}
        </>
      );
    }
    case "game_rerolled": {
      const title = str(p.title) ?? t.unknownTitle;
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {format(t.actions.rerolled, { title })}
        </>
      );
    }
    case "reroll_requested": {
      const reason = str(p.reason);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} /> requested reroll{reason ? `: “${reason}”` : ""}
        </>
      );
    }
    case "reroll_rejected": {
      const reason = str(p.reason);
      return (
        <>
          reroll rejected for <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {reason ? ` — ${reason}` : ""}
        </>
      );
    }
    case "game_passed":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {t.actions.passed}
          {diceSuffix}
        </>
      );
    case "game_dropped":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {t.actions.dropped}
          {diceSuffix}
        </>
      );
    case "moved": {
      const from = num(p.from);
      const to = num(p.to);
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {format(t.actions.movedFrom, { from: from ?? "?" })}
          <span className="ammo-counter font-bold text-amber">{to ?? "?"}</span>
          {diceSuffix}
        </>
      );
    }
    case "season_started":
      return <>{t.seasonStarted}</>;
    case "player_joined":
      return (
        <>
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {t.actions.joined}
        </>
      );
    case "admin_adjustment": {
      const reason = str(p.reason);
      return (
        <>
          {t.adminAdjustmentPrefix}
          <PlayerLink entry={entry} fallback={t.fallbackPlayer} />
          {reason ? format(t.adminAdjustmentReason, { reason }) : null}
        </>
      );
    }
    default:
      return <>{format(t.defaultEvent, { type: entry.eventType })}</>;
  }
}

function Avatar({ entry, fallback }: { entry: FeedRow; fallback: string }) {
  const name = entry.displayName ?? entry.username ?? fallback;
  if (entry.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.avatarUrl} alt="" loading="lazy" decoding="async" className="size-8 shrink-0 border border-dim/20 object-cover" />;
  }
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center border border-dim/20 bg-raised font-display text-xs text-dim">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function DaySeparator({ date, t, locale }: { date: Date; t: Dictionary["feed"]; locale: Locale }) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday = date.toDateString() === y.toDateString();
  let label: string;
  if (isToday) label = t.today ?? "Today";
  else if (isYesterday) label = t.yesterday ?? "Yesterday";
  else
    label = new Intl.DateTimeFormat(dateLocales[locale], { day: "2-digit", month: "long", year: "numeric" }).format(date);
  return (
    <div className="sticky top-[57px] z-10 -mx-1 my-2 flex items-center gap-3 bg-background/80 px-1 py-1 backdrop-blur">
      <span className="h-px flex-1 bg-dim/20" aria-hidden />
      <span className="border border-dim/20 bg-raised px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim">{label}</span>
      <span className="h-px flex-1 bg-dim/20" aria-hidden />
    </div>
  );
}

// kept for compatibility with older page
export async function FeedList({ rows }: { rows: FeedRow[] }) {
  return <FeedTimeline rows={rows} activeFilter="all" allRows={rows} />;
}

export async function FeedTimeline({
  rows,
  allRows,
}: {
  rows: FeedRow[];
  activeFilter?: string;
  allRows: FeedRow[];
}) {
  const { t, locale } = await getT();

  if (allRows.length === 0) {
    return (
      <div className="hud-card p-10 text-center">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center border border-amber/20 bg-amber/5">
            <SparklesIcon className="h-6 w-6 text-amber" aria-hidden />
          </div>
          <p className="font-display text-lg uppercase tracking-wide text-amber">{t.feed.empty}</p>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.feed.emptyHint}</p>
          <div className="hazard-tape mt-6 h-1.5 opacity-60" aria-hidden />
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="hud-card p-10 text-center">
        <p className="font-mono text-sm uppercase tracking-widest text-dim">{t.feed.noFilterResults}</p>
        <a href="/feed" className="hud-btn hud-btn-primary mt-4 inline-flex">
          {t.feed.clearFilter}
        </a>
      </div>
    );
  }

  const timeFmt = new Intl.DateTimeFormat(dateLocales[locale], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateFmt = new Intl.DateTimeFormat(dateLocales[locale], {
    day: "2-digit",
    month: "short",
  });

  let lastDay = "";

  return (
    <div className="relative">
      {/* vertical rail */}
      <div className="pointer-events-none absolute bottom-0 left-[15px] top-2 w-px bg-gradient-to-b from-amber/40 via-dim/20 to-transparent sm:left-[19px]" aria-hidden />

      <ul className="space-y-3">
        {rows.map((entry) => {
          const p = payloadOf(entry);
          const dice = diceStr(p);
          const title = str(p.title);
          const cellType = str(p.cellType);
          const meta = eventMeta(entry.eventType);
          const Icon = meta.Icon;

          const dayKey = entry.createdAt.toDateString();
          const showSeparator = dayKey !== lastDay;
          if (showSeparator) lastDay = dayKey;

          const hour = timeFmt.format(entry.createdAt);
          const dateShort = dateFmt.format(entry.createdAt);

          return (
            <li key={entry.id}>
              {showSeparator ? <DaySeparator date={entry.createdAt} t={t.feed} locale={locale} /> : null}
              <div className="relative flex gap-3 sm:gap-4">
                {/* dot on rail */}
                <div className="relative z-10 flex shrink-0 flex-col items-center">
                  <span
                    className={`flex size-8 items-center justify-center border ${dotStyles[meta.variant]} [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="mt-1 font-mono text-[10px] leading-none text-dim">{hour}</span>
                </div>

                {/* card */}
                <div className="hud-card group flex min-w-0 flex-1 flex-col overflow-hidden p-0 hover:border-amber/20">
                  {/* top accent line by variant */}
                  <div className={`h-px w-full ${meta.variant === "amber" ? "bg-amber/40" : meta.variant === "military" ? "bg-military/40" : meta.variant === "danger" ? "bg-danger/40" : meta.variant === "sky" ? "bg-sky-400/40" : meta.variant === "violet" ? "bg-violet-400/40" : "bg-dim/20"}`} aria-hidden />

                  <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
                    {/* avatar + time */}
                    <div className="flex items-center gap-3">
                      <Avatar entry={entry} fallback={t.feed.fallbackPlayer} />
                      <div className="hidden sm:block">
                        <div className="font-mono text-[11px] uppercase tracking-widest text-dim">
                          {dateShort} • {hour}
                        </div>
                        <div className="font-mono text-[10px] text-dim/60">{entry.eventType}</div>
                      </div>
                    </div>

                    {/* main message */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-zinc-200">
                        <EventLine entry={entry} t={t.feed} />
                      </p>

                      {/* payload chips */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {title ? (
                          <span className="inline-flex max-w-full items-center gap-1.5 border border-amber/20 bg-amber/10 px-2 py-1 font-mono text-xs text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                            <CubeIcon className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">“{title}”</span>
                          </span>
                        ) : null}
                        {dice ? (
                          <span className={`inline-flex items-center gap-1 border px-2 py-1 font-mono text-xs tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${meta.variant === "military" ? "border-military/30 bg-military/10 text-military" : meta.variant === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-dim/20 bg-raised text-amber"}`}>
                            {dice} <span className="text-dim/60">{t.feed.diceLabel}</span>
                          </span>
                        ) : null}
                        {cellType ? (
                          <span className="border border-sky-400/20 bg-sky-500/10 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-sky-300 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                            {cellType}
                          </span>
                        ) : null}
                        {(() => {
                          const rating = num(p.rating);
                          const notes = str(p.notes) ?? str(p.comment) ?? str(p.reason);
                          return (
                            <>
                              {rating ? (
                                <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                                  <StarIcon className="h-3 w-3" aria-hidden /> {rating}/10
                                </span>
                              ) : null}
                              <span className={`hidden sm:inline-flex border px-2 py-0.5 font-display text-[11px] uppercase tracking-widest ${variantStyles[meta.variant]}`}>
                                {meta.label}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      {(() => {
                        const notes = str(p.notes) ?? str(p.comment) ?? str(p.reason);
                        const rating = num(p.rating);
                        // only show notes block for passed/dropped where it exists and not already shown as chip
                        if (!notes && rating === null) return null;
                        // for game_passed/dropped show full comment
                        if (entry.eventType === "game_passed" || entry.eventType === "game_dropped") {
                          return notes ? (
                            <p className="mt-3 line-clamp-3 border-l-2 border-amber/20 pl-3 text-sm leading-snug text-dim">“{notes}”</p>
                          ) : null;
                        }
                        return null;
                      })()}
                    </div>

                    {/* player badge on mobile */}
                    <div className="flex w-full items-center justify-between gap-2 border-t border-dim/10 pt-2 sm:hidden">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
                        {entry.displayName ?? entry.username ?? t.feed.fallbackPlayer}
                      </span>
                      <span className="font-mono text-[10px] text-dim">{hour}</span>
                    </div>
                  </div>

                  {/* quick link to player */}
                  {entry.username ? (
                    <Link
                      href={`/players/${entry.username}`}
                      className="flex items-center justify-between border-t border-dim/10 bg-raised/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-dim hover:text-amber sm:px-4"
                    >
                      <span>@{entry.username}</span>
                      <span>→</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
