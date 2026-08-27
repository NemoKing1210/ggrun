"use client";

import { useActionState, useState } from "react";
import {
  ShieldCheckIcon,
  Cog6ToothIcon,
  UserPlusIcon,
  LinkIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  TrashIcon,
  KeyIcon,
  GlobeAltIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

import {
  updateSiteSettingsAction,
  updateProviderKeysAction,
  createInviteAction,
} from "@/lib/use-cases/site-settings-actions";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { DebugError } from "@/components/ui/DebugError";
import { format } from "@/lib/i18n/format";

type Settings = {
  registrationEnabled: boolean;
  registrationMode: "open" | "manual_approval" | "email_link";
  maintenanceMode: boolean;
};

type Invite = {
  id: string;
  token: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string | null;
  createdAt: string;
};

type PendingUser = {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  isApproved: boolean;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  createdAt: string;
};

type ProviderKeysMeta = {
  rawgApiKeyMasked: string | null;
  igdbClientIdMasked: string | null;
  igdbClientSecretMasked: string | null;
  steamApiKeyMasked: string | null;
  hasDb: { rawg: boolean; igdb: boolean; steam: boolean };
  hasEnv: { rawg: boolean; igdb: boolean; steam: boolean };
};

export function GlobalSettingsForm({
  initial,
  providerKeys,
  invites,
  pending,
  t,
  baseUrl,
}: {
  initial: Settings;
  providerKeys?: ProviderKeysMeta;
  invites: Invite[];
  pending: PendingUser[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  baseUrl: string;
}) {
  const s = t.admin.siteSettings;
  const [registrationEnabled, setRegistrationEnabled] = useState(initial.registrationEnabled);
  const [registrationMode, setRegistrationMode] = useState<Settings["registrationMode"]>(initial.registrationMode);
  const [maintenanceMode, setMaintenanceMode] = useState(initial.maintenanceMode);
  const [activeTab, setActiveTab] = useState<"general" | "registration" | "invites" | "pending" | "integrations">("general");
  const [copied, setCopied] = useState<string | null>(null);

  const [state, formAction, pendingAction] = useActionState(updateSiteSettingsAction, {});
  const [inviteState, inviteAction, invitePending] = useActionState(createInviteAction, {});

  // Provider keys form
  const [providerState, providerFormAction, providerPending] = useActionState(updateProviderKeysAction, {});
  const [rawgInput, setRawgInput] = useState("");
  const [igdbIdInput, setIgdbIdInput] = useState("");
  const [igdbSecretInput, setIgdbSecretInput] = useState("");
  const [steamInput, setSteamInput] = useState("");
  const [clearFlags, setClearFlags] = useState({ rawg: false, igdbId: false, igdbSecret: false, steam: false });
  const [showKeys, setShowKeys] = useState({ rawg: false, igdbId: false, igdbSecret: false, steam: false });

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const buildInviteLink = (token: string) => `${baseUrl.replace(/\/$/, "")}/register?invite=${encodeURIComponent(token)}`;
  const buildVerifyLink = (token: string) => `${baseUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;

  const tabs = [
    { id: "general", label: s.tabs.general, icon: Cog6ToothIcon },
    { id: "registration", label: s.tabs.registration, icon: UserPlusIcon },
    { id: "integrations", label: s.tabs?.integrations ?? "Integrations", icon: KeyIcon },
    { id: "invites", label: s.tabs.invites, icon: LinkIcon },
    { id: "pending", label: `${s.tabs.pending} ${pending.length ? `(${pending.length})` : ""}`, icon: ClockIcon },
  ] as const;

  const hasAnyProvider = providerKeys
    ? providerKeys.hasDb.rawg || providerKeys.hasDb.igdb || providerKeys.hasDb.steam || providerKeys.hasEnv.rawg || providerKeys.hasEnv.igdb || providerKeys.hasEnv.steam
    : false;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">{"// "}{s.kicker}</p>
        <h1 className="font-display text-3xl uppercase tracking-widest text-amber">{s.heading}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{s.description}</p>
        <div className="hazard-tape my-4" aria-hidden />
      </header>

      {/* Status strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`hud-card p-3 flex items-center gap-3 ${maintenanceMode ? "border-danger/40 bg-danger/10" : "border-military/30"}`}>
          <div className={`size-8 flex items-center justify-center border ${maintenanceMode ? "border-danger/50 bg-danger/20 text-danger" : "border-military/40 bg-military/10 text-military"} [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]`}>
            <ShieldCheckIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-xs uppercase tracking-widest">{maintenanceMode ? s.maintenanceActive : s.maintenanceInactive}</p>
            <p className="text-xs text-zinc-500 truncate">{maintenanceMode ? "🔒 " + s.generalHint : "✓ site operational"}</p>
          </div>
        </div>
        <div className={`hud-card p-3 flex items-center gap-3 ${registrationEnabled ? "border-military/30" : "border-danger/30 bg-danger/5"}`}>
          <div className={`size-8 flex items-center justify-center border ${registrationEnabled ? "border-military/40 bg-military/10 text-military" : "border-danger/40 bg-danger/10 text-danger"} [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]`}>
            <UserPlusIcon className="size-4" />
          </div>
          <div>
            <p className="font-display text-xs uppercase tracking-widest">{registrationEnabled ? "Registration OPEN" : "Registration CLOSED"}</p>
            <p className="text-xs text-zinc-500">{registrationEnabled ? "New users can sign up" : "Invite links still work"}</p>
          </div>
        </div>
        <div className="hud-card p-3 flex items-center gap-3 border-amber/30 bg-amber/5">
          <div className="size-8 flex items-center justify-center border border-amber/40 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <EnvelopeIcon className="size-4" />
          </div>
          <div>
            <p className="font-display text-xs uppercase tracking-widest">
              {registrationMode === "open" ? s.modes.open : registrationMode === "manual_approval" ? s.modes.manual : s.modes.email}
            </p>
            <p className="text-xs text-zinc-500 truncate">
              {registrationMode === "open" ? s.modes.openDesc : registrationMode === "manual_approval" ? s.modes.manualDesc : s.modes.emailDesc}
            </p>
          </div>
        </div>
      </div>
      {providerKeys && (
        <div className={`hud-card p-3 flex items-center gap-3 ${hasAnyProvider ? "border-amber/20 bg-amber/5" : "border-[#3d3d34] bg-raised/20"}`}>
          <div className="size-8 flex items-center justify-center border border-amber/30 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <GlobeAltIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs uppercase tracking-widest">API Providers</p>
            <p className="text-xs text-zinc-500 truncate">
              {providerKeys.hasDb.rawg || providerKeys.hasEnv.rawg ? "RAWG ✓" : "RAWG —"} · {providerKeys.hasDb.igdb || providerKeys.hasEnv.igdb ? "IGDB ✓" : "IGDB —"} · {providerKeys.hasDb.steam || providerKeys.hasEnv.steam ? "Steam ✓" : "Steam —"}
              {!hasAnyProvider ? " — no keys configured, catalog search disabled" : " — catalog search uses configured providers"}
            </p>
          </div>
          <button type="button" onClick={() => setActiveTab("integrations")} className="hud-btn !py-1 !px-2 text-xs">Configure</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-[#3d3d34] pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={() => setActiveTab(tab.id as any)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 font-display text-xs uppercase tracking-widest transition-colors [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
              activeTab === tab.id ? "bg-amber text-black border border-amber" : "bg-[#1a1a1a] text-zinc-400 border border-[#3d3d34] hover:border-amber/40 hover:text-amber"
            }`}
          >
            <tab.icon className="size-3.5" aria-hidden />
            {tab.label}
          </button>
        ))}
      </div>

      {/* GENERAL */}
      {activeTab === "general" && (
        <section className="hud-card p-5 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <div className="flex items-center gap-2">
            <Cog6ToothIcon className="size-5 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">{s.generalHeading}</h2>
            <Badge variant="dim" size="sm" className="ml-2 font-mono">live</Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{s.generalHint}</p>

          <form action={formAction} className="mt-6 flex flex-col gap-6">
            {/* Hidden fields to submit current state */}
            <input type="hidden" name="registrationEnabled" value={registrationEnabled ? "true" : "false"} />
            <input type="hidden" name="registrationMode" value={registrationMode} />
            <input type="hidden" name="maintenanceMode" value={maintenanceMode ? "true" : "false"} />

            <div className={`rounded-sm border p-4 ${maintenanceMode ? "border-danger/40 bg-danger/10" : "border-[#2a2a22] bg-[#1a1a1a]"}`}>
              <Switch
                checked={maintenanceMode}
                onChange={setMaintenanceMode}
                label={s.maintenanceLabel}
                description={s.maintenanceDescription}
                variant={maintenanceMode ? "danger" : "default"}
              />
              {maintenanceMode && (
                <div className="mt-3 flex items-start gap-2 border border-danger/30 bg-danger/10 p-2 text-xs text-danger [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <ExclamationTriangleIcon className="size-4 shrink-0" aria-hidden />
                  <span>{s.maintenanceActive} — non-admins see a lock screen and cannot log in.</span>
                </div>
              )}
            </div>

            {/* Registration toggle also shown here for convenience */}
            <div className="border border-[#2a2a22] bg-[#1a1a1a] p-4">
              <Switch
                checked={registrationEnabled}
                onChange={setRegistrationEnabled}
                label={s.registrationEnabledLabel}
                description={s.registrationEnabledDescription}
                variant={registrationEnabled ? "military" : "danger"}
              />
              <div className="mt-4">
                <p className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{s.registrationModeLabel}</p>
                <p className="text-xs text-zinc-500">{s.registrationModeDescription}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["open", s.modes.open, s.modes.openDesc],
                      ["manual_approval", s.modes.manual, s.modes.manualDesc],
                      ["email_link", s.modes.email, s.modes.emailDesc],
                    ] as const
                  ).map(([val, label, desc]) => (
                    <button
                      key={val}
                      type="button"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onClick={() => setRegistrationMode(val as any)}
                      className={`text-left border p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] transition-colors ${
                        registrationMode === val ? "bg-amber border-amber text-black" : "bg-[#1a1a1a] border-[#3d3d34] text-zinc-300 hover:border-amber/40"
                      }`}
                    >
                      <span className="font-display text-xs uppercase tracking-widest">{label}</span>
                      <span className={`mt-1 block text-[11px] leading-snug ${registrationMode === val ? "text-black/70" : "text-zinc-500"}`}>{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {state.error && (
              <div>
                <p className="border border-danger/30 bg-danger/10 p-2 text-sm text-danger [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]" role="alert">
                  {state.error}
                </p>
                <DebugError debug={state.debug} title="settings" />
              </div>
            )}
            {state.ok && (
              <p className="border border-military/30 bg-military/10 p-2 text-sm text-military [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                ✓ {state.ok}
              </p>
            )}
            <button type="submit" className="hud-btn hud-btn-primary self-start" disabled={pendingAction}>
              {pendingAction ? "Saving…" : s.saveButton}
            </button>
          </form>
        </section>
      )}

      {/* REGISTRATION tab (same form, focused) */}
      {activeTab === "registration" && (
        <section className="hud-card p-5 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="size-5 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">{s.registrationHeading}</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{s.registrationHint}</p>
          <form action={formAction} className="mt-6 flex flex-col gap-6">
            <input type="hidden" name="registrationEnabled" value={registrationEnabled ? "true" : "false"} />
            <input type="hidden" name="registrationMode" value={registrationMode} />
            <input type="hidden" name="maintenanceMode" value={maintenanceMode ? "true" : "false"} />

            <div className="border border-[#2a2a22] bg-[#1a1a1a] p-4">
              <Switch
                checked={registrationEnabled}
                onChange={setRegistrationEnabled}
                label={s.registrationEnabledLabel}
                description={s.registrationEnabledDescription}
                variant={registrationEnabled ? "military" : "danger"}
              />
            </div>

            <div className="border border-[#2a2a22] bg-[#1a1a1a] p-4">
              <p className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{s.registrationModeLabel}</p>
              <p className="text-xs text-zinc-500">{s.registrationModeDescription}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["open", s.modes.open, s.modes.openDesc],
                    ["manual_approval", s.modes.manual, s.modes.manualDesc],
                    ["email_link", s.modes.email, s.modes.emailDesc],
                  ] as const
                ).map(([val, label, desc]) => (
                  <button
                    key={val}
                    type="button"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onClick={() => setRegistrationMode(val as any)}
                    className={`text-left border p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] transition-colors ${
                      registrationMode === val ? "bg-amber border-amber text-black" : "bg-[#1a1a1a] border-[#3d3d34] text-zinc-300 hover:border-amber/40"
                    }`}
                  >
                    <span className="font-display text-xs uppercase tracking-widest">{label}</span>
                    <span className={`mt-1 block text-[11px] leading-snug ${registrationMode === val ? "text-black/70" : "text-zinc-500"}`}>{desc}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <span className="size-1.5 bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                Invites bypass this — they work even when registration is closed.
              </div>
            </div>

            {/* Maintenance also editable here */}
            <div className="border border-[#2a2a22] bg-[#1a1a1a] p-4">
              <Switch
                checked={maintenanceMode}
                onChange={setMaintenanceMode}
                label={s.maintenanceLabel}
                description={s.maintenanceDescription}
                variant={maintenanceMode ? "danger" : "default"}
              />
            </div>

            {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
            {state.ok && <p className="text-sm text-military">✓ {state.ok}</p>}
            <button type="submit" className="hud-btn hud-btn-primary self-start" disabled={pendingAction}>
              {pendingAction ? "Saving…" : s.saveButton}
            </button>
          </form>
        </section>
      )}

      {/* INTEGRATIONS */}
      {activeTab === "integrations" && providerKeys && (
        <section className="hud-card p-5 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <div className="flex items-center gap-2">
            <KeyIcon className="size-5 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">{s.integrationsHeading ?? "API Integrations"}</h2>
            <Badge variant="dim" size="sm" className="ml-2 font-mono">{hasAnyProvider ? "configured" : "empty"}</Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{s.integrationsHint ?? "Add API keys for RAWG / IGDB / Steam. DB values override .env. Only configured providers appear in Games → Search."}</p>

          <form action={providerFormAction} className="mt-6 flex flex-col gap-5">
            <input type="hidden" name="rawgApiKey" value={clearFlags.rawg ? "" : rawgInput.trim() ? rawgInput.trim() : "__KEEP__"} />
            <input type="hidden" name="igdbClientId" value={clearFlags.igdbId ? "" : igdbIdInput.trim() ? igdbIdInput.trim() : "__KEEP__"} />
            <input type="hidden" name="igdbClientSecret" value={clearFlags.igdbSecret ? "" : igdbSecretInput.trim() ? igdbSecretInput.trim() : "__KEEP__"} />
            <input type="hidden" name="steamApiKey" value={clearFlags.steam ? "" : steamInput.trim() ? steamInput.trim() : "__KEEP__"} />

            <div className="border border-[#2a2a22] bg-[#1a1a1a] p-4 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xs uppercase tracking-widest flex items-center gap-2"><GlobeAltIcon className="size-4 text-amber" /> RAWG <Badge variant={providerKeys.hasDb.rawg || providerKeys.hasEnv.rawg ? "military" : "dim"} size="sm">{providerKeys.hasDb.rawg || providerKeys.hasEnv.rawg ? "active" : "not set"}</Badge></p>
                  <p className="mt-1 text-xs text-zinc-500">Free key from <a href="https://rawg.io/apidocs" target="_blank" rel="noreferrer" className="text-amber underline">rawg.io/apidocs</a> · used for catalog search & hybrid pools</p>
                </div>
                {providerKeys.rawgApiKeyMasked && <span className="font-mono text-xs text-amber">{providerKeys.rawgApiKeyMasked}</span>}
              </div>
              <div className="mt-3">
                <Field label={s.rawgApiKeyLabel ?? "RAWG API Key"}>
                  <div className="relative flex items-center">
                    <Input
                      type={showKeys.rawg ? "text" : "password"}
                      placeholder={providerKeys.rawgApiKeyMasked ? "••••" + providerKeys.rawgApiKeyMasked.slice(-4) + " — enter new to replace" : "Enter RAWG_API_KEY"}
                      value={clearFlags.rawg ? "" : rawgInput}
                      onChange={(e) => { setRawgInput(e.target.value); setClearFlags((p) => ({ ...p, rawg: false })); }}
                      disabled={clearFlags.rawg}
                    />
                    <button type="button" onClick={() => setShowKeys((p) => ({ ...p, rawg: !p.rawg }))} className="absolute right-2 p-1 text-dim hover:text-amber">
                      {showKeys.rawg ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-zinc-500">Source: {providerKeys.hasDb.rawg ? <span className="text-amber">DB override</span> : providerKeys.hasEnv.rawg ? <span className="text-military">ENV</span> : <span className="text-dim">none</span>}</span>
                {providerKeys.hasDb.rawg && !clearFlags.rawg && (
                  <button type="button" onClick={() => { setClearFlags((p) => ({ ...p, rawg: true })); setRawgInput(""); }} className="hud-btn !py-1 !px-2 text-xs">Clear override → fallback to ENV</button>
                )}
                {clearFlags.rawg && <span className="text-danger">Will clear DB value on save</span>}
                {providerKeys.hasEnv.rawg && <Badge variant="dim" size="sm" className="font-mono">env present</Badge>}
              </div>
            </div>

            <div className="border border-[#2a2a22] bg-[#1a1a1a] p-4 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xs uppercase tracking-widest flex items-center gap-2"><KeyIcon className="size-4 text-amber" /> IGDB <Badge variant={providerKeys.hasDb.igdb || providerKeys.hasEnv.igdb ? "military" : "dim"} size="sm">{providerKeys.hasDb.igdb || providerKeys.hasEnv.igdb ? "active" : "not set"}</Badge></p>
                  <p className="mt-1 text-xs text-zinc-500">Twitch app credentials · <a href="https://api-docs.igdb.com" target="_blank" rel="noreferrer" className="text-amber underline">api-docs.igdb.com</a></p>
                </div>
                <span className="font-mono text-xs text-amber">{providerKeys.igdbClientIdMasked ? providerKeys.igdbClientIdMasked : ""} {providerKeys.igdbClientSecretMasked ? "/ " + providerKeys.igdbClientSecretMasked : ""}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={s.igdbClientIdLabel ?? "IGDB Client ID"}>
                  <div className="relative flex items-center">
                    <Input
                      type={showKeys.igdbId ? "text" : "password"}
                      placeholder={providerKeys.igdbClientIdMasked ? "••••" + providerKeys.igdbClientIdMasked.slice(-4) : "Client ID"}
                      value={clearFlags.igdbId ? "" : igdbIdInput}
                      onChange={(e) => { setIgdbIdInput(e.target.value); setClearFlags((p) => ({ ...p, igdbId: false })); }}
                      disabled={clearFlags.igdbId}
                    />
                    <button type="button" onClick={() => setShowKeys((p) => ({ ...p, igdbId: !p.igdbId }))} className="absolute right-2 p-1 text-dim hover:text-amber">
                      {showKeys.igdbId ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </Field>
                <Field label={s.igdbClientSecretLabel ?? "IGDB Client Secret"}>
                  <div className="relative flex items-center">
                    <Input
                      type={showKeys.igdbSecret ? "text" : "password"}
                      placeholder={providerKeys.igdbClientSecretMasked ? "••••" + providerKeys.igdbClientSecretMasked.slice(-4) : "Client Secret"}
                      value={clearFlags.igdbSecret ? "" : igdbSecretInput}
                      onChange={(e) => { setIgdbSecretInput(e.target.value); setClearFlags((p) => ({ ...p, igdbSecret: false })); }}
                      disabled={clearFlags.igdbSecret}
                    />
                    <button type="button" onClick={() => setShowKeys((p) => ({ ...p, igdbSecret: !p.igdbSecret }))} className="absolute right-2 p-1 text-dim hover:text-amber">
                      {showKeys.igdbSecret ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-zinc-500">Source: {providerKeys.hasDb.igdb ? <span className="text-amber">DB override</span> : providerKeys.hasEnv.igdb ? <span className="text-military">ENV</span> : <span className="text-dim">none (needs both ID & Secret)</span>}</span>
                {providerKeys.hasDb.igdb && (
                  <button type="button" onClick={() => { setClearFlags((p) => ({ ...p, igdbId: true, igdbSecret: true })); setIgdbIdInput(""); setIgdbSecretInput(""); }} className="hud-btn !py-1 !px-2 text-xs">Clear override</button>
                )}
                {(clearFlags.igdbId || clearFlags.igdbSecret) && <span className="text-danger">Will clear on save</span>}
              </div>
            </div>

            <div className="border border-[#2a2a22] bg-[#1a1a1a] p-4 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xs uppercase tracking-widest flex items-center gap-2"><GlobeAltIcon className="size-4 text-amber" /> Steam <Badge variant={providerKeys.hasDb.steam || providerKeys.hasEnv.steam ? "military" : "dim"} size="sm">{providerKeys.hasDb.steam || providerKeys.hasEnv.steam ? "active" : "not set"}</Badge></p>
                  <p className="mt-1 text-xs text-zinc-500">Web API key · <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer" className="text-amber underline">steamcommunity.com/dev/apikey</a></p>
                </div>
                {providerKeys.steamApiKeyMasked && <span className="font-mono text-xs text-amber">{providerKeys.steamApiKeyMasked}</span>}
              </div>
              <div className="mt-3">
                <Field label={s.steamApiKeyLabel ?? "Steam Web API Key"}>
                  <div className="relative flex items-center">
                    <Input
                      type={showKeys.steam ? "text" : "password"}
                      placeholder={providerKeys.steamApiKeyMasked ? "••••" + providerKeys.steamApiKeyMasked.slice(-4) + " — enter new to replace" : "Enter STEAM_WEB_API_KEY"}
                      value={clearFlags.steam ? "" : steamInput}
                      onChange={(e) => { setSteamInput(e.target.value); setClearFlags((p) => ({ ...p, steam: false })); }}
                      disabled={clearFlags.steam}
                    />
                    <button type="button" onClick={() => setShowKeys((p) => ({ ...p, steam: !p.steam }))} className="absolute right-2 p-1 text-dim hover:text-amber">
                      {showKeys.steam ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-zinc-500">Source: {providerKeys.hasDb.steam ? <span className="text-amber">DB override</span> : providerKeys.hasEnv.steam ? <span className="text-military">ENV</span> : <span className="text-dim">none</span>}</span>
                {providerKeys.hasDb.steam && !clearFlags.steam && (
                  <button type="button" onClick={() => { setClearFlags((p) => ({ ...p, steam: true })); setSteamInput(""); }} className="hud-btn !py-1 !px-2 text-xs">Clear override → fallback to ENV</button>
                )}
                {clearFlags.steam && <span className="text-danger">Will clear DB value on save</span>}
              </div>
            </div>

            <div className="rounded border border-amber/20 bg-amber/5 p-3 text-xs leading-relaxed text-zinc-400 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-amber">How it works</p>
              <p className="mt-1">DB values take precedence over <span className="font-mono text-amber">.env</span>. Leave a field blank to keep current value. Clear override to fall back to env. Only providers with a key are shown in <span className="font-mono text-amber">/admin/games → Search</span>; unconfigured APIs are hidden from the list.</p>
            </div>

            {providerState.error && (
              <div>
                <p className="border border-danger/30 bg-danger/10 p-2 text-sm text-danger [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]" role="alert">{providerState.error}</p>
                <DebugError debug={providerState.debug} title="provider keys" />
              </div>
            )}
            {providerState.ok && (
              <p className="border border-military/30 bg-military/10 p-2 text-sm text-military [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">✓ {providerState.ok}</p>
            )}
            <button type="submit" className="hud-btn hud-btn-primary self-start" disabled={providerPending}>
              {providerPending ? "Saving…" : s.saveButton}
            </button>
          </form>
        </section>
      )}

      {/* INVITES */}
      {activeTab === "invites" && (
        <section className="hud-card p-5 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <div className="flex items-center gap-2">
            <LinkIcon className="size-5 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">{s.invitesHeading}</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{s.invitesHint}</p>

          <form action={inviteAction} className="mt-4 flex flex-wrap items-end gap-3 border border-[#2a2a22] bg-[#1a1a1a] p-4 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{s.inviteMaxUsesLabel}</span>
              <select name="maxUses" defaultValue="1" className="min-w-[120px] bg-[#1a1a1a] border border-[#3d3d34] px-2 py-1.5 text-sm [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="100">100</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{s.inviteExpiresLabel}</span>
              <select name="expires" defaultValue="never" className="min-w-[140px] bg-[#1a1a1a] border border-[#3d3d34] px-2 py-1.5 text-sm [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                <option value="never">{s.inviteExpiresNever}</option>
                <option value="24h">{s.inviteExpires24h}</option>
                <option value="7d">{s.inviteExpires7d}</option>
              </select>
            </label>
            <button type="submit" className="hud-btn hud-btn-primary !py-2" disabled={invitePending}>
              {invitePending ? "…" : s.createInvite}
            </button>
            {inviteState.error && <span className="text-xs text-danger">{inviteState.error}</span>}
            {inviteState.ok && <span className="text-xs text-military">✓ {inviteState.ok}</span>}
          </form>

          <div className="mt-4 flex flex-col gap-2">
            {invites.length === 0 ? (
              <p className="border border-dashed border-[#3d3d34] bg-[#151514] p-4 text-center text-sm text-zinc-500 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                {s.inviteEmpty}
              </p>
            ) : (
              invites.map((inv) => {
                const link = buildInviteLink(inv.token);
                const isExpired = inv.expiresAt ? new Date(inv.expiresAt) < new Date() : false;
                const isExhausted = inv.usesCount >= inv.maxUses;
                return (
                  <div
                    key={inv.id}
                    className={`flex flex-col gap-2 border p-3 sm:flex-row sm:items-center sm:justify-between [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${isExpired || isExhausted ? "border-[#3d3d34] bg-[#1a1a1a] opacity-60" : "border-amber/20 bg-amber/5"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-amber truncate">{link}</span>
                        <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${isExpired ? "border-danger/40 bg-danger/10 text-danger" : isExhausted ? "border-zinc-600 bg-zinc-800 text-zinc-400" : "border-military/40 bg-military/10 text-military"}`}>
                          {isExpired ? "expired" : isExhausted ? "exhausted" : "active"} · {format(s.inviteUses, { used: String(inv.usesCount), max: String(inv.maxUses) })}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-zinc-500">
                        {inv.expiresAt ? format(s.inviteExpiresAt, { date: new Date(inv.expiresAt).toLocaleString() }) : s.inviteNeverExpires}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copy(link, inv.id)}
                        className="hud-btn !py-1 !px-2 text-xs inline-flex items-center gap-1"
                      >
                        <ClipboardDocumentIcon className="size-3.5" aria-hidden />
                        {copied === inv.id ? s.inviteCopied : s.inviteCopy}
                      </button>
                      <form action={async (fd: FormData) => { const { deleteInviteAction } = await import("@/lib/use-cases/site-settings-actions"); await deleteInviteAction(fd); }}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button
                          type="submit"
                          className="hud-btn hud-btn-danger !py-1 !px-2 text-xs inline-flex items-center gap-1"
                        >
                          <TrashIcon className="size-3.5" aria-hidden />
                          {s.inviteDelete}
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* PENDING */}
      {activeTab === "pending" && (
        <section className="hud-card p-5 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <div className="flex items-center gap-2">
            <ClockIcon className="size-5 text-amber" aria-hidden />
            <h2 className="font-display text-sm uppercase tracking-widest">{s.pendingHeading}</h2>
            {pending.length > 0 && <Badge variant="amber" size="sm" className="font-mono">{pending.length}</Badge>}
          </div>
          <p className="mt-1 text-xs text-zinc-500">{s.pendingHint}</p>

          {pending.length === 0 ? (
            <div className="mt-4 border border-dashed border-[#3d3d34] bg-[#151514] p-6 text-center [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <CheckCircleIcon className="mx-auto size-8 text-military/40" aria-hidden />
              <p className="mt-2 text-sm text-zinc-400">{s.pendingEmpty}</p>
              <p className="text-xs text-zinc-600">{s.noPendingHint}</p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {pending.map((u) => {
                const isApproval = !u.isApproved && !u.emailVerificationToken;
                const verifyLink = u.emailVerificationToken ? buildVerifyLink(u.emailVerificationToken) : null;
                return (
                  <div key={u.id} className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-sm tracking-wide text-amber truncate">{u.displayName ?? u.username}</p>
                        <p className="font-mono text-xs text-zinc-400 truncate">@{u.username} · {u.email}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant={isApproval ? "amber" : "sky"} size="sm">{isApproval ? s.pendingApproval : s.pendingVerification}</Badge>
                          <span className="text-zinc-500 font-mono">{new Date(u.createdAt).toLocaleString()}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={async (fd: FormData) => { const { approveUserAction } = await import("@/lib/use-cases/site-settings-actions"); await approveUserAction(fd); }}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="hud-btn hud-btn-primary !py-1.5 !px-3 text-xs inline-flex items-center gap-1">
                            <CheckCircleIcon className="size-4" aria-hidden />
                            {s.approveButton}
                          </button>
                        </form>
                        <form action={async (fd: FormData) => { const { rejectUserAction } = await import("@/lib/use-cases/site-settings-actions"); await rejectUserAction(fd); }}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="hud-btn hud-btn-danger !py-1.5 !px-3 text-xs inline-flex items-center gap-1">
                            <XCircleIcon className="size-4" aria-hidden />
                            {s.rejectButton}
                          </button>
                        </form>
                      </div>
                    </div>
                    {verifyLink && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#2a2a22] pt-2">
                        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">{s.verificationLinkLabel}</span>
                        <span className="font-mono text-xs text-amber truncate max-w-[320px]">{verifyLink}</span>
                        <button type="button" onClick={() => copy(verifyLink, `v-${u.id}`)} className="hud-btn !py-1 !px-2 text-xs">
                          {copied === `v-${u.id}` ? s.inviteCopied : s.inviteCopy}
                        </button>
                        <form action={async (fd: FormData) => { const { resendVerificationAction } = await import("@/lib/use-cases/site-settings-actions"); await resendVerificationAction(fd); }}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="hud-btn !py-1 !px-2 text-xs inline-flex items-center gap-1">
                            <EnvelopeIcon className="size-3.5" aria-hidden />
                            {s.resendButton}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
