"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  FilmIcon,
  IdentificationIcon,
  LinkIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  StarIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/status";
import { Textarea } from "@/components/ui/Textarea";
import { PresenceBadge, PresenceDot } from "@/components/ui/Presence";
import { FormShell } from "@/components/admin/FormShell";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { actionMeta, payloadSummary } from "@/components/admin/audit-meta";
import {
  blockUserAction,
  deleteUserAction,
  revokeAllSessionsAction,
  revokeSessionAction,
  updateUserAction,
} from "@/lib/modules/player/actions";
import {
  approveCompletionAction,
  approveRerollAction,
  rejectCompletionAction,
  rejectRerollAction,
} from "@/lib/modules/moderation/actions/moderation";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { getAccent } from "@/lib/shared/ui/accent";
import type { User } from "@/db/schema";
import type {
  AdminSessionRow,
  AdminUserAuditRow,
  AdminUserRollRow,
  AdminUserSeasonRow,
} from "@/lib/modules/player/service/admin";
import type {
  UserCompletionRequestRow,
  UserRerollRequestRow,
} from "@/lib/modules/catalog/repository/requests";

export type UserTab = "profile" | "data" | "sessions" | "activity" | "gameplay" | "moderation";

/** Server action shape accepted by FormShell (admin form state). */
type FormShellAction = (
  prev: import("@/lib/use-cases/admin/actions/types").AdminFormState,
  formData: FormData,
) => Promise<import("@/lib/use-cases/admin/actions/types").AdminFormState>;

const TABS: Array<{ key: UserTab; icon: typeof ClockIcon }> = [
  { key: "profile", icon: PencilSquareIcon },
  { key: "data", icon: IdentificationIcon },
  { key: "sessions", icon: DevicePhoneMobileIcon },
  { key: "activity", icon: ClockIcon },
  { key: "gameplay", icon: Squares2X2Icon },
  { key: "moderation", icon: ShieldCheckIcon },
];

const roles = ["admin", "judge", "player", "viewer"] as const;

function roleVariant(role: User["role"]): "amber" | "military" | "dim" | "sky" | "neutral" {
  switch (role) {
    case "admin":
      return "amber";
    case "judge":
      return "military";
    case "player":
      return "sky";
    default:
      return "neutral";
  }
}

function rollVariant(status: AdminUserRollRow["status"]): "military" | "danger" | "amber" | "dim" | "sky" {
  switch (status) {
    case "passed":
      return "military";
    case "dropped":
      return "danger";
    case "rerolled":
      return "amber";
    case "in_progress":
      return "sky";
    default:
      return "dim";
  }
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error("clipboard unavailable"));
}

/** Field row for the read-only account-data tab. */
function DataField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
      <dt className="font-display text-[10px] tracking-widest text-dim uppercase">{label}</dt>
      <dd className="mt-1.5 font-mono text-xs leading-relaxed text-zinc-200 sm:text-sm">{children}</dd>
    </div>
  );
}

/**
 * Admin user detail page (/admin/users/[id]) — header with stats and five tabs:
 * profile (edit), account data (read-only), sessions, admin activity and gameplay.
 * The active tab lives in the URL (?tab=) so views stay shareable.
 */
export function UserDetailPage({
  user,
  actor,
  activeTab,
  sessions,
  audit,
  seasons,
  rolls,
  requests,
}: {
  user: User;
  actor: { id: string; username: string };
  activeTab: UserTab;
  sessions: AdminSessionRow[];
  audit: AdminUserAuditRow[];
  seasons: AdminUserSeasonRow[];
  rolls: AdminUserRollRow[];
  requests: { rerolls: UserRerollRequestRow[]; completions: UserCompletionRequestRow[] };
}) {
  const { t } = useI18n();
  const u = t.admin.users;
  const router = useRouter();
  const pathname = usePathname();
  const isSelf = user.id === actor.id;
  const name = user.displayName ?? user.username;
  const accent = getAccent(user.accent);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(user.locale ?? undefined, { dateStyle: "short", timeStyle: "short" }),
    [user.locale],
  );
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(user.locale ?? undefined, { dateStyle: "medium" }),
    [user.locale],
  );

  const [copiedId, setCopiedId] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const onCopyId = async () => {
    try {
      await copyText(user.id);
      setCopiedId(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(false), 1500);
    } catch {
      // Clipboard blocked — silently ignore.
    }
  };

  const onTab = (tab: UserTab) => {
    if (tab === activeTab) return;
    const params = new URLSearchParams();
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const activeSessions = sessions.filter((s) => s.isActive).length;
  const links = Array.isArray(user.links) ? (user.links as Array<{ network: string; url: string }>) : [];

  const tabLabels: Record<UserTab, string> = {
    profile: u.tabProfile,
    data: u.tabData,
    sessions: u.tabSessions,
    activity: u.tabActivity,
    gameplay: u.tabGameplay,
    moderation: u.tabModeration,
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/users"
        className="group inline-flex w-fit items-center gap-2 font-mono text-xs uppercase tracking-widest text-dim transition-colors hover:text-amber"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        {u.backToList}
      </Link>

      {/* Header card */}
      <section className="hud-card overflow-hidden p-0">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="relative inline-flex shrink-0">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={name}
                    className="h-14 w-14 shrink-0 border border-amber/40 object-cover [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  />
                ) : (
                  <span
                    className="grid h-14 w-14 shrink-0 place-items-center border font-display text-lg tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                    style={{ borderColor: accent.border, color: accent.primary, background: `${accent.primary}14` }}
                  >
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="absolute top-1 right-1">
                  <PresenceDot lastSeenAt={user.lastSeenAt} size="lg" bordered />
                </span>
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-2xl uppercase tracking-widest text-zinc-100 sm:text-3xl">
                    {name}
                  </h1>
                  {isSelf && <Badge variant="military" size="sm">{u.you}</Badge>}
                  <Badge variant={roleVariant(user.role)} size="sm">{u.roles[user.role]}</Badge>
                  <span
                    className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-xs uppercase tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${user.isBlocked ? "border-danger/40 bg-danger/10 text-danger" : "border-military/30 bg-military/10 text-military"}`}
                  >
                    {user.isBlocked ? <NoSymbolIcon className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden />}
                    {user.isBlocked ? u.blocked : u.activeUser}
                  </span>
                  <PresenceBadge lastSeenAt={user.lastSeenAt} locale={user.locale ?? undefined} />
                </div>
                <p className="mt-1.5 truncate font-mono text-sm text-dim">
                  @{user.username} · {user.email ?? "—"}
                </p>
                <p className="mt-1 font-mono text-xs text-dim">
                  {format(u.memberSince, { date: dayFmt.format(user.createdAt) })}
                  <span className="mx-2 text-dim/50">·</span>
                  <button
                    type="button"
                    onClick={onCopyId}
                    className="group inline-flex items-center gap-1 text-dim transition-colors hover:text-amber"
                    title={u.data.accountId}
                  >
                    ID: {user.id.slice(0, 8)}…
                    {copiedId ? (
                      <CheckIcon className="h-3 w-3 text-military" aria-hidden />
                    ) : (
                      <ClipboardDocumentIcon className="h-3 w-3 transition-colors group-hover:text-amber" aria-hidden />
                    )}
                  </button>
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid shrink-0 grid-cols-3 gap-2.5">
              {[
                { label: u.statSessions, value: sessions.length, sub: `${activeSessions} ${u.sessions.activeBadge}` },
                { label: u.statSeasons, value: seasons.length },
                { label: u.statRolls, value: rolls.length },
              ].map((stat) => (
                <div key={stat.label} className="min-w-[90px] border border-[#3d3d34] bg-[#1a1a1a] px-3 py-2 text-center [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <div className="font-display text-2xl leading-none tracking-widest text-amber">{stat.value}</div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim">{stat.label}</div>
                  {"sub" in stat && stat.sub ? <div className="mt-0.5 font-mono text-[10px] text-dim/70">{stat.sub}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-1 border-t border-[#3d3d34] bg-raised/40 px-3 py-2 sm:px-4" aria-label="tabs">
          {TABS.map(({ key, icon: Icon }) => {
            const active = key === activeTab;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTab(key)}
                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 font-display text-xs uppercase tracking-widest transition [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${
                  active
                    ? "border-amber bg-amber text-black shadow-[0_0_8px_rgb(var(--hud-amber-glow)/0.35)]"
                    : "border-[#3d3d34] bg-[#1a1a1a] text-zinc-400 hover:border-amber/50 hover:text-amber"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {tabLabels[key]}
              </button>
            );
          })}
        </nav>
      </section>

      {/* Panels */}
      {activeTab === "profile" && <ProfilePanel user={user} isSelf={isSelf} />}
      {activeTab === "data" && (
        <DataPanel
          user={user}
          dayFmt={dayFmt}
          accentSwatch={accent.swatch}
          links={links}
          copiedId={copiedId}
          onCopyId={onCopyId}
        />
      )}
      {activeTab === "sessions" && (
        <SessionsPanel user={user} sessions={sessions} dateFmt={dateFmt} />
      )}
      {activeTab === "activity" && <ActivityPanel audit={audit} dateFmt={dateFmt} />}
      {activeTab === "gameplay" && (
        <GameplayPanel seasons={seasons} rolls={rolls} dayFmt={dayFmt} dateFmt={dateFmt} />
      )}
      {activeTab === "moderation" && (
        <ModerationPanel
          requests={requests}
          playerName={name}
          userId={user.id}
          dateFmt={dateFmt}
        />
      )}
    </div>
  );
}

/* ------------------------------ Profile tab ------------------------------ */

function ProfilePanel({ user, isSelf }: { user: User; isSelf: boolean }) {
  const { t } = useI18n();
  const u = t.admin.users;

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <PencilSquareIcon className="h-5 w-5 text-amber" aria-hidden />
          <h2 className="font-display text-lg uppercase tracking-wider">{u.profileHeading}</h2>
        </div>
        <p className="font-mono text-xs tracking-widest text-dim">@{user.username}</p>
        <div className="hazard-tape my-3 opacity-60" aria-hidden />

        <FormShell
          action={updateUserAction}
          submitLabel={t.core.common.save}
          submitClassName="hud-btn hud-btn-primary w-full sm:col-span-2 sm:w-auto sm:justify-self-end"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="userId" value={user.id} />
          <Field label={t.core.auth.displayName}>
            <Input name="displayName" defaultValue={user.displayName ?? ""} placeholder={t.core.auth.displayName} />
          </Field>
          <Field label={u.usernameLabel}>
            <Input name="username" defaultValue={user.username} required />
          </Field>
          <Field label={u.emailLabel}>
            <Input name="email" type="email" defaultValue={user.email ?? ""} />
          </Field>
          <Field label={u.roleLabel}>
            <Select name="role" defaultValue={user.role}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {u.roles[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.core.auth.password} hint={u.passwordHintKeep}>
            <Input name="password" type="password" placeholder="••••••••" />
          </Field>
        </FormShell>
      </section>

      {/* Danger zone */}
      <section className="hud-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <TrashIcon className="h-5 w-5 text-danger" aria-hidden />
          <h2 className="font-display text-lg uppercase tracking-wider text-danger">{u.dangerHeading}</h2>
        </div>
        <div className="hazard-tape my-3 opacity-60" aria-hidden />

        <div className="grid gap-3 sm:grid-cols-2">
          <form action={blockUserAction} className="hud-card bg-[#1a1a1a] p-3">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="blocked" value={String(!user.isBlocked)} />
            <div className="flex items-center gap-2">
              {user.isBlocked ? <ShieldCheckIcon className="h-4 w-4 text-military" aria-hidden /> : <NoSymbolIcon className="h-4 w-4 text-danger" aria-hidden />}
              <span className="font-display text-xs uppercase tracking-widest">
                {user.isBlocked ? u.unblockButton : u.blockButton}
              </span>
            </div>
            <p className="mt-2 font-mono text-xs leading-relaxed text-dim">
              {user.isBlocked ? u.blockRestore : u.blockImmediate}
            </p>
            <ConfirmButton
              message={format(u.blockConfirm, { user: user.username })}
              className={`hud-btn mt-3 w-full text-xs ${user.isBlocked ? "hud-btn-primary" : ""}`}
              disabled={isSelf}
              danger={!user.isBlocked}
            >
              {user.isBlocked ? u.unblockButton : u.blockButton}
            </ConfirmButton>
            {isSelf && <p className="mt-2 font-mono text-xs text-danger">{u.cannotBlockSelf}</p>}
          </form>

          <form action={deleteUserAction} className="hud-card bg-danger/5 p-3">
            <div className="flex items-center gap-2">
              <TrashIcon className="h-4 w-4 text-danger" aria-hidden />
              <span className="font-display text-xs uppercase tracking-widest text-danger">{u.deleteButton}</span>
            </div>
            <p className="mt-2 font-mono text-xs leading-relaxed text-dim">{u.deleteWarning}</p>
            <ConfirmButton
              message={format(u.deleteConfirm, { user: user.username })}
              className="hud-btn hud-btn-danger mt-3 w-full text-xs"
              disabled={isSelf}
            >
              {u.deleteButton}
            </ConfirmButton>
            {isSelf && <p className="mt-2 font-mono text-xs text-danger">{u.cannotDeleteSelf}</p>}
          </form>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------- Data tab -------------------------------- */

function DataPanel({
  user,
  dayFmt,
  accentSwatch,
  links,
  copiedId,
  onCopyId,
}: {
  user: User;
  dayFmt: Intl.DateTimeFormat;
  accentSwatch: string;
  links: Array<{ network: string; url: string }>;
  copiedId: boolean;
  onCopyId: () => void;
}) {
  const { t } = useI18n();
  const u = t.admin.users;
  const d = u.data;
  const pendingVerification = !user.emailVerified && Boolean(user.emailVerificationToken);

  return (
    <section className="hud-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <IdentificationIcon className="h-5 w-5 text-amber" aria-hidden />
        <h2 className="font-display text-lg uppercase tracking-wider">{u.dataHeading}</h2>
      </div>
      <p className="font-mono text-xs tracking-widest text-dim">{u.dataHint}</p>
      <div className="hazard-tape my-3 opacity-60" aria-hidden />

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DataField label={d.accountId}>
          <button
            type="button"
            onClick={onCopyId}
            className="group inline-flex max-w-full items-center gap-1.5 text-left"
            title={user.id}
          >
            <span className="truncate">{user.id}</span>
            {copiedId ? (
              <CheckIcon className="h-3.5 w-3.5 shrink-0 text-military" aria-hidden />
            ) : (
              <ClipboardDocumentIcon className="h-3.5 w-3.5 shrink-0 text-dim group-hover:text-amber" aria-hidden />
            )}
          </button>
        </DataField>

        <DataField label={u.emailLabel}>
          <span className="break-all">{user.email ?? d.noValue}</span>
        </DataField>

        <DataField label={d.emailVerified}>
          {pendingVerification ? (
            <span className="inline-flex items-center gap-1.5 text-amber">
              <ClockIcon className="h-3.5 w-3.5" aria-hidden />
              {d.verificationPending}
            </span>
          ) : user.emailVerified ? (
            <span className="text-military">✓ {d.emailVerified}</span>
          ) : (
            <span className="text-danger">✕ {d.emailUnverified}</span>
          )}
        </DataField>

        <DataField label={d.approved}>
          {user.isApproved ? (
            <span className="text-military">✓ {d.approved}</span>
          ) : (
            <span className="text-amber">{d.approvalPending}</span>
          )}
        </DataField>

        <DataField label={d.locale}>
          <span className="uppercase">{user.locale ?? "en"}</span>
        </DataField>

        <DataField label={d.accent}>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3.5 w-3.5 border border-[#3d3d34] [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]"
              style={{ background: accentSwatch }}
              aria-hidden
            />
            {user.accent}
          </span>
        </DataField>

        <DataField label={d.twitchLogin}>
          {user.twitchLogin ? (
            <span className="text-zinc-200">@{user.twitchLogin}</span>
          ) : (
            <span className="text-dim">{d.noTwitch}</span>
          )}
        </DataField>

        <DataField label={t.core.common.status}>
          {user.isBlocked ? (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <NoSymbolIcon className="h-3.5 w-3.5" aria-hidden />
              {t.admin.users.blocked}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-military">
              <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden />
              {t.admin.users.activeUser}
            </span>
          )}
        </DataField>

        <DataField label={d.createdLabel}>
          {dayFmt.format(user.createdAt)}
        </DataField>

        <DataField label={d.bio}>
          {user.bio ? <span className="whitespace-pre-wrap">{user.bio}</span> : <span className="text-dim">{d.noBio}</span>}
        </DataField>

        <DataField label={d.links}>
          {links.length > 0 ? (
            <span className="flex flex-col gap-1">
              {links.map((link, index) => (
                <a
                  key={`${link.network}-${index}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-amber/80 transition-colors hover:text-amber"
                >
                  <LinkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{link.network} · {link.url}</span>
                </a>
              ))}
            </span>
          ) : (
            <span className="text-dim">{d.noLinks}</span>
          )}
        </DataField>

        <DataField label={d.avatar}>
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-10 w-10 border border-[#3d3d34] object-cover [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" />
          ) : (
            <span className="text-dim">{d.noAvatar}</span>
          )}
        </DataField>

        <DataField label={d.banner}>
          {user.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.bannerUrl} alt="" className="h-10 w-full max-w-[220px] border border-[#3d3d34] object-cover [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" />
          ) : (
            <span className="text-dim">{d.noBanner}</span>
          )}
        </DataField>
      </dl>
    </section>
  );
}

/* ----------------------------- Sessions tab ------------------------------ */

function SessionsPanel({ user, sessions, dateFmt }: { user: User; sessions: AdminSessionRow[]; dateFmt: Intl.DateTimeFormat }) {
  const { t } = useI18n();
  const u = t.admin.users.sessions;

  return (
    <section className="hud-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <DevicePhoneMobileIcon className="h-5 w-5 text-amber" aria-hidden />
            <h2 className="font-display text-lg uppercase tracking-wider">
              {u.heading}
              <span className="ml-2 font-mono text-xs tracking-widest text-dim">[{sessions.length}]</span>
            </h2>
          </div>
          <p className="font-mono text-xs leading-relaxed tracking-widest text-dim">{u.hint}</p>
        </div>
        {sessions.length > 0 && (
          <form action={revokeAllSessionsAction}>
            <input type="hidden" name="userId" value={user.id} />
            <ConfirmButton
              message={format(u.revokeAllConfirm, { user: user.username })}
              className="hud-btn !px-3 !py-1.5 text-xs"
            >
              {u.revokeAll}
            </ConfirmButton>
          </form>
        )}
      </div>
      <div className="hazard-tape my-3 opacity-60" aria-hidden />

      {sessions.length === 0 ? (
        <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-dim">{u.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex flex-wrap items-center justify-between gap-3 border p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
                session.isActive ? "border-[#3d3d34] bg-[#1a1a1a]" : "border-[#2a2a22] bg-[#161615] opacity-70"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest ${session.isActive ? "text-military" : "text-dim"}`}>
                    <span
                      className={`inline-block h-2 w-2 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)] ${session.isActive ? "bg-military" : "bg-dim"}`}
                      aria-hidden
                    />
                    {session.isActive ? u.activeBadge : u.expiredBadge}
                  </span>
                  <span className="truncate font-mono text-xs text-zinc-400">{session.id.slice(0, 8)}</span>
                </div>
                <p className="mt-1.5 font-mono text-xs text-dim">
                  {u.colCreated}: <span className="text-zinc-300">{dateFmt.format(session.createdAt)}</span>
                  <span className="mx-2 text-dim/50">·</span>
                  {u.colExpires}: <span className={session.isActive ? "text-zinc-300" : "text-danger"}>{dateFmt.format(session.expiresAt)}</span>
                </p>
              </div>
              <form action={revokeSessionAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="sessionId" value={session.id} />
                <ConfirmButton message={u.revokeConfirm} className="hud-btn !px-2.5 !py-1.5 text-xs">
                  {u.revoke}
                </ConfirmButton>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ----------------------------- Activity tab ------------------------------ */

function ActivityPanel({ audit, dateFmt }: { audit: AdminUserAuditRow[]; dateFmt: Intl.DateTimeFormat }) {
  const { t } = useI18n();
  const a = t.admin.users.activity;

  return (
    <section className="hud-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <ClockIcon className="h-5 w-5 text-amber" aria-hidden />
        <h2 className="font-display text-lg uppercase tracking-wider">{a.heading}</h2>
      </div>
      <p className="font-mono text-xs tracking-widest text-dim">{a.hint}</p>
      <div className="hazard-tape my-3 opacity-60" aria-hidden />

      {audit.length === 0 ? (
        <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-dim">{a.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {audit.map(({ entry, isByUser, actorName }) => {
            const meta = actionMeta(entry.actionType);
            const Icon = meta.icon;
            const payload = (entry.payload ?? {}) as Record<string, unknown>;
            return (
              <div
                key={`${entry.id}-${entry.createdAt.getTime()}`}
                className="grid grid-cols-1 gap-2 border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] sm:grid-cols-[180px_1fr_auto] sm:items-center"
              >
                <span className="font-mono text-xs whitespace-nowrap text-amber/80">{dateFmt.format(entry.createdAt)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-grid size-6 shrink-0 place-items-center border border-dim/40 bg-raised text-dim [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <Badge variant={meta.variant} size="sm">
                      {entry.actionType}
                    </Badge>
                    <span
                      className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${
                        isByUser ? "border-sky-500/30 bg-sky-500/10 text-sky-400" : "border-amber/30 bg-amber/10 text-amber"
                      }`}
                    >
                      {isByUser ? a.byUser : a.onUser}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate font-mono text-xs text-dim" title={payloadSummary(payload)}>
                    <span className="text-zinc-300">{isByUser ? `@${actorName}` : actorName}</span>
                    <ArrowRightIcon className="mx-1.5 inline size-3 text-dim/50" aria-hidden />
                    {entry.targetId ? (
                      <span>
                        {entry.targetType}
                        <span className="text-amber/70">:{entry.targetId.slice(0, 8)}</span>
                        <span className="mx-1.5 text-dim/50">·</span>
                      </span>
                    ) : (
                      <span>
                        {entry.targetType}
                        <span className="mx-1.5 text-dim/50">·</span>
                      </span>
                    )}
                    {Object.keys(payload).length === 0 ? "—" : payloadSummary(payload)}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-dim sm:text-right">{entry.id.slice(0, 8)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ----------------------------- Gameplay tab ------------------------------ */

function GameplayPanel({
  seasons,
  rolls,
  dayFmt,
  dateFmt,
}: {
  seasons: AdminUserSeasonRow[];
  rolls: AdminUserRollRow[];
  dayFmt: Intl.DateTimeFormat;
  dateFmt: Intl.DateTimeFormat;
}) {
  const { t } = useI18n();
  const g = t.admin.users.gameplay;

  return (
    <div className="flex flex-col gap-6">
      {/* Season participation */}
      <section className="hud-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <Squares2X2Icon className="h-5 w-5 text-amber" aria-hidden />
          <h2 className="font-display text-lg uppercase tracking-wider">
            {g.seasonsHeading}
            <span className="ml-2 font-mono text-xs tracking-widest text-dim">[{seasons.length}]</span>
          </h2>
        </div>
        <div className="hazard-tape my-3 opacity-60" aria-hidden />

        {seasons.length === 0 ? (
          <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-dim">{g.seasonsEmpty}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {seasons.map((season) => (
              <div key={season.seasonId} className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/seasons/${season.seasonId}`}
                    className="truncate font-display text-sm uppercase tracking-wide text-zinc-100 transition-colors hover:text-amber"
                  >
                    {season.seasonTitle}
                  </Link>
                  <StatusBadge status={season.seasonStatus} label={t.core.seasonStatuses[season.seasonStatus]} />
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-dim">/{season.seasonSlug}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="border border-[#2a2a22] bg-background/40 px-2 py-1.5 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    <div className="font-mono text-xs text-dim uppercase">{g.colPosition}</div>
                    <div className="mt-0.5 font-display text-lg leading-none text-amber">#{season.position}</div>
                  </div>
                  <div className="border border-[#2a2a22] bg-background/40 px-2 py-1.5 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    <div className="font-mono text-xs text-dim uppercase">{g.colBalance}</div>
                    <div className="mt-0.5 font-display text-lg leading-none text-amber">{season.balancePoints}</div>
                  </div>
                  <div className="border border-[#2a2a22] bg-background/40 px-2 py-1.5 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    <div className="font-mono text-xs text-dim uppercase">{g.colStatus}</div>
                    <div className="mt-1">
                      <StatusBadge status={season.status} label={t.core.playerStatuses[season.status]} />
                    </div>
                  </div>
                  <div className="border border-[#2a2a22] bg-background/40 px-2 py-1.5 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    <div className="font-mono text-xs text-dim uppercase">{g.colWhen}</div>
                    <div className="mt-0.5 font-mono text-[11px] leading-none text-zinc-300">{dayFmt.format(season.joinedAt)}</div>
                  </div>
                </div>
                <p className="mt-2 font-mono text-[11px] text-dim">
                  {format(g.streaks, { pass: season.streakPass, drop: season.streakDrop })}
                  <span className="mx-2 text-dim/50">·</span>
                  {format(g.rerolls, { count: season.rerollsUsed })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent rolls */}
      <section className="hud-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-amber" aria-hidden />
          <h2 className="font-display text-lg uppercase tracking-wider">
            {g.rollsHeading}
            <span className="ml-2 font-mono text-xs tracking-widest text-dim">[{rolls.length}]</span>
          </h2>
        </div>
        <div className="hazard-tape my-3 opacity-60" aria-hidden />

        {rolls.length === 0 ? (
          <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-dim">{g.rollsEmpty}</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#26261f] text-left shadow-[0_1px_0_#3d3d34]">
                <tr>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{g.colGame}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{g.colOutcome}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{g.colHours}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{g.colRating}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{g.colSeason}</th>
                  <th className="p-3 font-mono text-[11px] uppercase tracking-widest">{g.colWhen}</th>
                </tr>
              </thead>
              <tbody>
                {rolls.map((roll) => (
                  <tr key={roll.rollId} className="border-b border-[#2a2a22] transition-colors hover:bg-amber/[0.05]">
                    <td className="max-w-[240px] p-3">
                      <span className="flex items-center gap-2">
                        {roll.gameCover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={roll.gameCover} alt="" className="h-8 w-8 shrink-0 border border-[#3d3d34] object-cover [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" />
                        ) : null}
                        <span className="truncate font-mono text-xs text-zinc-200" title={roll.gameTitle ?? undefined}>
                          {roll.gameTitle ?? "—"}
                        </span>
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant={rollVariant(roll.status)} size="sm">
                        {t.profile.rollStats[roll.status]}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs text-zinc-300">
                      {roll.hoursSpent ? format(g.hours, { hours: roll.hoursSpent }) : "—"}
                    </td>
                    <td className="p-3">
                      {roll.rating ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-amber">
                          <StarIcon className="h-3.5 w-3.5" aria-hidden />
                          {roll.rating}/10
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-dim">—</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs text-dim">{roll.seasonTitle}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap text-amber/80">{dateFmt.format(roll.rolledAt)}</td>
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

/* ---------------------------- Moderation tab ----------------------------- */

type RequestStatus = "pending" | "approved" | "rejected";

/** Status chip for a moderation request — amber pulse / military / danger. */
function RequestStatusChip({
  status,
  pendingLabel,
  approvedLabel,
  rejectedLabel,
}: {
  status: RequestStatus;
  pendingLabel: string;
  approvedLabel: string;
  rejectedLabel: string;
}) {
  if (status === "approved") return <Badge variant="military" size="sm">{approvedLabel}</Badge>;
  if (status === "rejected") return <Badge variant="danger" size="sm">{rejectedLabel}</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5 border border-amber/40 bg-amber/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
      <span className="size-1.5 animate-pulse bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
      {pendingLabel}
    </span>
  );
}

/** Approve / reject mini-panels for one pending request (also revalidates the user page). */
function RequestActions({
  requestId,
  userId,
  approveAction,
  rejectAction,
  approveLabel,
  rejectLabel,
  approveConfirm,
  rejectPlaceholder,
}: {
  requestId: string;
  userId: string;
  approveAction: FormShellAction;
  rejectAction: FormShellAction;
  approveLabel: string;
  rejectLabel: string;
  approveConfirm: string;
  rejectPlaceholder: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <FormShell
        action={approveAction}
        submitLabel={approveLabel}
        submitClassName="hud-btn hud-btn-primary w-full"
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="userId" value={userId} />
        <p className="text-xs leading-relaxed text-dim">{approveConfirm}</p>
      </FormShell>
      <FormShell
        action={rejectAction}
        submitLabel={rejectLabel}
        submitClassName="hud-btn hud-btn-danger w-full"
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="userId" value={userId} />
        <Textarea name="adminNote" required minLength={5} rows={2} placeholder={rejectPlaceholder} aria-label={t.core.common.reason} />
      </FormShell>
    </div>
  );
}

/** Moderation requests of this user — same approve/reject flow as /admin/moderation. */
function ModerationPanel({
  requests,
  playerName,
  userId,
  dateFmt,
}: {
  requests: { rerolls: UserRerollRequestRow[]; completions: UserCompletionRequestRow[] };
  playerName: string;
  userId: string;
  dateFmt: Intl.DateTimeFormat;
}) {
  const { t } = useI18n();
  const u = t.admin.users;
  const m = t.admin.moderation;
  const c = t.admin.completions;

  return (
    <section className="hud-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheckIcon className="h-5 w-5 text-amber" aria-hidden />
        <h2 className="font-display text-lg uppercase tracking-wider">
          {u.tabModeration}
          <span className="ml-2 font-mono text-xs tracking-widest text-dim">
            [{requests.rerolls.length + requests.completions.length}]
          </span>
        </h2>
      </div>
      <p className="font-mono text-xs tracking-widest text-dim">{u.moderation.hint}</p>
      <div className="hazard-tape my-3 opacity-60" aria-hidden />

      <div className="flex flex-col gap-6">
        {/* Reroll requests */}
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-widest text-zinc-300">
            <ArrowPathIcon className="size-4 text-amber" aria-hidden />
            {c.tabs.rerolls}
            <span className="font-mono text-xs text-dim">[{requests.rerolls.length}]</span>
          </h3>
          {requests.rerolls.length === 0 ? (
            <p className="mt-2 py-6 text-center font-mono text-xs uppercase tracking-widest text-dim">{u.moderation.emptyRerolls}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {requests.rerolls.map((req) => (
                <div key={req.id} className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                        <span className="inline-flex items-center gap-1.5 text-zinc-200">
                          <FilmIcon className="size-3.5 shrink-0 text-amber" aria-hidden />
                          {req.gameTitle ?? "—"}
                        </span>
                        <Link href={`/admin/seasons/${req.seasonId}`} className="text-dim transition-colors hover:text-amber">
                          {req.seasonTitle ?? "—"}
                        </Link>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[11px] text-dim">{dateFmt.format(req.requestedAt)}</span>
                      <RequestStatusChip
                        status={req.status}
                        pendingLabel={m.pending}
                        approvedLabel={m.approved}
                        rejectedLabel={m.rejected}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed break-words text-zinc-400">{req.reason}</p>

                  {req.status === "pending" ? (
                    <RequestActions
                      requestId={req.id}
                      userId={userId}
                      approveAction={approveRerollAction}
                      rejectAction={rejectRerollAction}
                      approveLabel={m.approve}
                      rejectLabel={m.reject}
                      approveConfirm={format(m.approveConfirm, { player: playerName })}
                      rejectPlaceholder={m.rejectPlaceholder}
                    />
                  ) : (
                    <p className="mt-2 border-t border-[#2a2a22] pt-2 font-mono text-[11px] text-dim">
                      {req.adminNote ?? "—"}
                      {req.resolvedAt ? <span> · {dateFmt.format(req.resolvedAt)}</span> : null}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completion requests */}
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-widest text-zinc-300">
            <FilmIcon className="size-4 text-amber" aria-hidden />
            {c.tabs.completions}
            <span className="font-mono text-xs text-dim">[{requests.completions.length}]</span>
          </h3>
          {requests.completions.length === 0 ? (
            <p className="mt-2 py-6 text-center font-mono text-xs uppercase tracking-widest text-dim">{u.moderation.emptyCompletions}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {requests.completions.map((req) => {
                const passed = req.outcome === "passed";
                return (
                  <div key={req.id} className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                          <span className="inline-flex items-center gap-1.5 text-zinc-200">
                            <FilmIcon className="size-3.5 shrink-0 text-amber" aria-hidden />
                            {req.gameTitle ?? "—"}
                          </span>
                          <Link href={`/admin/seasons/${req.seasonId}`} className="text-dim transition-colors hover:text-amber">
                            {req.seasonTitle ?? "—"}
                          </Link>
                          <Badge variant={passed ? "military" : "danger"} size="sm">
                            {passed ? c.outcomePassed : c.outcomeDropped}
                          </Badge>
                          {req.rating ? (
                            <span className="inline-flex items-center gap-1 text-amber">
                              <StarIcon className="size-3" aria-hidden />
                              {req.rating}/10
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[11px] text-dim">{dateFmt.format(req.requestedAt)}</span>
                        <RequestStatusChip
                          status={req.status}
                          pendingLabel={c.pending}
                          approvedLabel={c.approved}
                          rejectedLabel={c.rejected}
                        />
                      </div>
                    </div>
                    {req.reason ? (
                      <p className="mt-2 text-sm leading-relaxed break-words text-zinc-400">{req.reason}</p>
                    ) : null}

                    {req.status === "pending" ? (
                      <RequestActions
                        requestId={req.id}
                        userId={userId}
                        approveAction={approveCompletionAction}
                        rejectAction={rejectCompletionAction}
                        approveLabel={c.approve}
                        rejectLabel={c.reject}
                        approveConfirm={format(c.approveConfirm, {
                          outcome: passed ? c.outcomePassed : c.outcomeDropped,
                          player: playerName,
                        })}
                        rejectPlaceholder={c.rejectPlaceholder}
                      />
                    ) : (
                      <p className="mt-2 border-t border-[#2a2a22] pt-2 font-mono text-[11px] text-dim">
                        {req.adminNote ?? "—"}
                        {req.resolvedAt ? <span> · {dateFmt.format(req.resolvedAt)}</span> : null}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}