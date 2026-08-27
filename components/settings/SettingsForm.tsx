"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";

import { updateUserSettingsAction } from "@/lib/use-cases/user-actions";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { ACCENTS, ACCENT_KEYS, getAccent, type AccentKey } from "@/lib/accent";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { NETWORKS } from "@/lib/networks";
import { MAX_BIO_LENGTH } from "@/lib/profile";

type LinkRow = { network: string; url: string };

type Props = {
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  accent: string | null;
  locale: string | null;
  links: unknown;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Applies an accent to the document root CSS vars (live preview). */
function applyAccent(key: AccentKey) {
  const a = getAccent(key);
  const root = document.documentElement;
  root.style.setProperty("--hud-amber", a.primary);
  root.style.setProperty("--hud-amber-border", a.border);
  root.style.setProperty("--hud-amber-glow", a.glow);
}

function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not-an-image"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      reject(new Error("too-large"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-failed"));
      img.onload = () => {
        const SIZE = 128;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("no-canvas"));
          return;
        }
        // Cover-crop to a square
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function SettingsForm({ displayName, bio, avatarUrl, accent, locale, links }: Props) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(updateUserSettingsAction, {});

  const [name, setName] = useState(displayName ?? "");
  const [bioText, setBioText] = useState(bio ?? "");
  const [avatar, setAvatar] = useState(avatarUrl ?? "");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [accentKey, setAccentKey] = useState<AccentKey>(
    (accent && accent in ACCENTS ? accent : "amber") as AccentKey,
  );
  const [localeKey, setLocaleKey] = useState<Locale>(
    (locale === "en" || locale === "ru" || locale === "uk" ? locale : "en") as Locale,
  );
  const [rows, setRows] = useState<LinkRow[]>(() => {
    const raw = Array.isArray(links) ? (links as Array<Record<string, unknown>>) : [];
    return raw
      .filter(
        (l) =>
          l && typeof l === "object" && typeof l.network === "string" && typeof l.url === "string",
      )
      .slice(0, 6)
      .map((l) => ({ network: l.network as string, url: l.url as string }));
  });
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Apply the user's saved accent on mount (before save).
  useEffect(() => {
    applyAccent(accentKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickAvatar = (file: File | undefined) => {
    setAvatarError(null);
    if (!file) return;
    resizeAvatar(file)
      .then((dataUrl) => setAvatar(dataUrl))
      .catch(() => setAvatarError(t.settings.avatarHint));
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickAvatar(e.target.files?.[0]);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    pickAvatar(e.dataTransfer.files?.[0]);
  };

  const setRow = (i: number, patch: Partial<LinkRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const handleSubmit = (formData: FormData) => {
    formData.set("displayName", name);
    formData.set("bio", bioText);
    formData.set("avatarUrl", avatar);
    formData.set("accent", accentKey);
    formData.set("locale", localeKey);
    formData.set("links", JSON.stringify(rows.filter((r) => r.network && r.url.trim())));
    return formAction(formData);
  };

  return (
    <form
      action={handleSubmit}
      className="flex flex-col gap-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Profile */}
      <section className="hud-card p-5">
        <h2 className="font-display text-xl uppercase tracking-wider text-amber mb-4">
          {t.settings.profileHeading}
        </h2>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <div className="relative size-24 overflow-hidden border border-dim/40 bg-raised [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="size-full object-cover" />
                ) : (
                  <span className="inline-flex size-full items-center justify-center font-display text-3xl text-dim">
                    {(name || "?").slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPick}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="hud-btn !py-1 !px-3 text-xs"
                >
                  {t.settings.uploadAvatar}
                </button>
                {avatar ? (
                  <button
                    type="button"
                    onClick={() => setAvatar("")}
                    className="hud-btn hud-btn-danger !py-1 !px-3 text-xs"
                  >
                    {t.settings.removeAvatar}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <Field label={t.settings.displayNameLabel}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder={t.settings.displayNamePlaceholder}
                />
              </Field>
              <Field label={t.settings.bioLabel} hint={t.settings.bioHint}>
                <Textarea
                  value={bioText}
                  onChange={(e) => setBioText(e.target.value)}
                  maxLength={MAX_BIO_LENGTH}
                  rows={3}
                  placeholder={t.settings.bioPlaceholder}
                />
                <span className="text-right text-xs text-zinc-500">
                  {bioText.length} / {MAX_BIO_LENGTH}
                </span>
              </Field>
            </div>
          </div>
          {avatarError && <p className="text-xs text-danger">{avatarError}</p>}
        </div>
      </section>

      {/* Appearance */}
      <section className="hud-card p-5">
        <h2 className="font-display text-xl uppercase tracking-wider text-amber mb-1">
          {t.settings.appearanceHeading}
        </h2>
        <p className="mb-4 text-xs text-zinc-500">{t.settings.accentHint}</p>
        <Field label={t.settings.accentLabel}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {ACCENT_KEYS.map((key) => {
              const a = ACCENTS[key];
              const active = accentKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={t.settings.accentNames[key]}
                  aria-pressed={active}
                  onClick={() => {
                    setAccentKey(key);
                    applyAccent(key);
                  }}
                  className={`flex flex-col items-center gap-1.5 border p-2 transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
                    active
                      ? "border-amber bg-amber/10"
                      : "border-[#3d3d34] bg-[#151515] hover:border-amber/50"
                  }`}
                >
                  <span
                    className="size-6 border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                    style={{ background: a.swatch }}
                  />
                  <span
                    className={`text-[10px] uppercase tracking-wider ${active ? "text-amber" : "text-zinc-500"}`}
                  >
                    {t.settings.accentNames[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      </section>

      {/* Language */}
      <section className="hud-card p-5">
        <h2 className="font-display text-xl uppercase tracking-wider text-amber mb-1">
          {t.settings.languageHeading}
        </h2>
        <p className="mb-4 text-xs text-zinc-500">{t.settings.languageHint}</p>
        <div className="flex flex-wrap gap-2">
          {(["en", "ru", "uk"] as Locale[]).map((loc) => {
            const active = localeKey === loc;
            return (
              <button
                key={loc}
                type="button"
                aria-pressed={active}
                onClick={() => setLocaleKey(loc)}
                className={`hud-btn !py-1.5 !px-4 text-xs ${active ? "hud-btn-primary" : ""}`}
              >
                {LOCALE_LABELS[loc]}
              </button>
            );
          })}
        </div>
      </section>

      {/* External links */}
      <section className="hud-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl uppercase tracking-wider text-amber">
              {t.settings.linksHeading}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">{t.settings.linksHint}</p>
          </div>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { network: "twitch", url: "" }])}
            disabled={rows.length >= 6}
            className="hud-btn !py-1 !px-3 text-xs"
          >
            + {t.settings.addLink}
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">{t.settings.linksHint}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_auto] items-end gap-2">
                <Field label={t.settings.networkLabel}>
                  <Select
                    value={row.network}
                    onChange={(e) => setRow(i, { network: e.target.value })}
                  >
                    {NETWORKS.map((n) => (
                      <option key={n} value={n}>
                        {t.settings.network[n]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.settings.urlLabel}>
                  <Input
                    type="url"
                    value={row.url}
                    onChange={(e) => setRow(i, { url: e.target.value })}
                    placeholder={t.settings.urlPlaceholder}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="hud-btn hud-btn-danger !px-2 !py-2"
                  aria-label={t.settings.removeLink}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rows
            .filter((r) => r.network && r.url.trim())
            .map((r, i) => (
              <Badge key={i} variant="neutral" size="sm">
                {t.settings.network[r.network as keyof typeof t.settings.network] ?? r.network}
              </Badge>
            ))}
        </div>
      </section>

      {state.error && (
        <div
          className="hud-card border-danger/40 bg-danger/10 p-3 text-sm text-danger [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
          role="alert"
        >
          {state.error}
        </div>
      )}
      {state.error && <DebugError debug={state.debug} title="settings save" />}
      {state.ok && (
        <div className="hud-card border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          {state.ok}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="hud-btn hud-btn-primary px-6 py-2 disabled:opacity-50"
        >
          {pending ? t.core.common.working : t.settings.save}
        </button>
      </div>
    </form>
  );
}
