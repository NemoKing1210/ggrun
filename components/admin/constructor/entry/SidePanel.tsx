"use client";

import { useState } from "react";
import {
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  FireIcon,
  MapPinIcon,
  UserIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { CardMeta, DurationMeter, PlayerEntryCard } from "@/components/iee/PlayerEntryCard";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import type { EntryArt } from "@/lib/engine";
import { aboveRarity, suggestedRarity, type Issue, type Locale } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { issueSpot, type DraftPreview } from "@/lib/modules/iee/library/draft";
import type { EntryScreen } from "@/lib/modules/iee/library/screens";

import { issueText } from "../issue-text";
import { useEditor } from "./editor-context";
import { ScenarioSummary } from "./ScenariosBlock";

const LOCALES: Locale[] = ["ru", "en", "uk"];

/** Scrolls to the block, rule or field a check points at. */
export function goToIssue(issue: Issue): void {
  const spot = issueSpot(issue.path);
  const id =
    spot.rule !== undefined
      ? `rule-${spot.rule}`
      : spot.scenario !== undefined
        ? `scenario-${spot.scenario}`
        : spot.block === "general"
          ? "block-basics"
          : `block-${spot.block}`;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The editor's right-hand panel (plan §6 task 3.3): the card as a player sees
 * it, the rule text in all three languages, the power estimate and the checks
 * — all live, from the draft as it is in the form.
 */
export function SidePanel({
  art,
  revisions,
  seasons,
}: {
  art: EntryArt;
  revisions: EntryScreen["revisions"];
  seasons: EntryScreen["seasons"];
}) {
  const { t, locale } = useI18n();
  const p = t.ieeEditor.entry.panel;
  const { analysis, doc, scenarios } = useEditor();
  const red = scenarios.verdicts.some((v) => v.status === "red");
  const [cardLocale, setCardLocale] = useState<Locale>(locale);
  const { preview } = analysis;
  // One time zone on the server and in the browser, so the first paint hydrates as is.
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-4">
      <section className="hud-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">{p.preview}</h2>
          <div className="flex gap-1" role="group" aria-label={p.preview}>
            {LOCALES.map((loc) => (
              <Chip key={loc} size="sm" active={cardLocale === loc} onClick={() => setCardLocale(loc)}>
                {t.ieeEditor.locales[loc]}
              </Chip>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-zinc-500">{p.previewHint}</p>
        <ul>
          <PreviewCard preview={preview} art={art} locale={cardLocale} slug={doc.slug} />
        </ul>
      </section>

      <section className="hud-card p-4">
        <h2 className="mb-2 font-display text-sm uppercase tracking-widest text-amber">{p.ruleText}</h2>
        <dl className="flex flex-col gap-2">
          {LOCALES.map((loc) => (
            <div key={loc}>
              <dt className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.ieeEditor.locales[loc]}</dt>
              <dd>
                <EntryDescription tone="dense" className="!mt-0.5">
                  {preview.ruleText[loc] || "—"}
                </EntryDescription>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="hud-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-sm uppercase tracking-widest text-amber">{p.power}</h2>
          <span className="font-display text-2xl text-zinc-100">
            {analysis.power === null ? p.noPower : analysis.power.toFixed(1)}
          </span>
        </div>
        {analysis.power !== null && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-zinc-300">{format(p.suggests, { rarity: t.iee.rarity[suggestedRarity(analysis.power)] })}</span>
            {aboveRarity(analysis.power, doc.rarity) && (
              <Badge variant="amber">{format(p.aboveRarity, { rarity: t.iee.rarity[doc.rarity] })}</Badge>
            )}
          </p>
        )}
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{p.powerHint}</p>
      </section>

      <section className="hud-card p-4" aria-live="polite">
        <h2 className="mb-2 font-display text-sm uppercase tracking-widest text-amber">{p.checks}</h2>
        {analysis.errors.length === 0 && red ? (
          <p className="flex items-start gap-1.5 text-sm text-danger">
            <XCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.ieeEditor.toast.scenariosRed}
          </p>
        ) : analysis.errors.length === 0 ? (
          <p className="flex items-start gap-1.5 text-sm text-military">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {p.ok}
          </p>
        ) : (
          <IssueList title={p.errors} issues={analysis.errors} tone="danger" />
        )}
        {analysis.warnings.length > 0 && (
          <div className="mt-3">
            <IssueList title={p.warningsTitle} issues={analysis.warnings} tone="amber" />
          </div>
        )}
        {(doc.scenarios ?? []).length > 0 && (
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between gap-2 border-t border-[#2a2a22] pt-2 text-left hover:underline"
            title={p.goTo}
            onClick={() => document.getElementById("block-scenarios")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <span className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{p.scenarios}</span>
            <ScenarioSummary verdicts={scenarios.verdicts} />
          </button>
        )}
      </section>

      <section className="hud-card p-4">
        <h2 className="mb-2 font-display text-sm uppercase tracking-widest text-amber">{p.revisions}</h2>
        {revisions.length === 0 ? (
          <p className="text-sm text-dim">{p.noRevisions}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...revisions].reverse().map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 font-mono text-xs">
                <span className="text-zinc-200">r{r.number}</span>
                <span className="text-dim" title={r.hash}>
                  {stamp.format(new Date(r.createdAt))} UTC
                </span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mb-1 mt-4 font-display text-[11px] uppercase tracking-widest text-zinc-400">{p.seasons}</h3>
        {seasons.length === 0 ? (
          <p className="text-sm text-dim">{p.noSeasons}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {seasons.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <a href={`/admin/seasons/${s.id}?stage=iee`} className="text-zinc-200 hover:text-amber">
                  {s.title}
                </a>
                <span className="flex items-center gap-1.5">
                  {s.revisionNumber !== null && (
                    <Badge variant="neutral" className="font-mono">
                      {format(p.seasonRevision, { number: String(s.revisionNumber) })}
                    </Badge>
                  )}
                  {!s.enabled && <span className="font-mono text-[11px] text-dim">{p.seasonOff}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: readonly Issue[]; tone: "danger" | "amber" }) {
  const { t } = useI18n();
  const Icon = tone === "danger" ? XCircleIcon : ExclamationTriangleIcon;
  return (
    <div>
      <p className={`mb-1 font-display text-[11px] uppercase tracking-widest ${tone === "danger" ? "text-danger" : "text-amber"}`}>
        {title} · {issues.length}
      </p>
      <ul className="flex flex-col gap-1">
        {issues.map((issue, n) => (
          <li key={n}>
            <button
              type="button"
              onClick={() => goToIssue(issue)}
              className={`flex w-full items-start gap-1.5 text-left text-xs hover:underline ${tone === "danger" ? "text-danger" : "text-amber"}`}
              title={t.ieeEditor.entry.panel.goTo}
            >
              <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
              {issueText(issue, t)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The dashboard's own card, filled from the draft: what a player will hold. */
function PreviewCard({ preview, art, locale, slug }: { preview: DraftPreview; art: EntryArt; locale: Locale; slug: string }) {
  const { t } = useI18n();
  const p = t.iee.panel;
  const panel = t.ieeEditor.entry.panel;

  if (preview.kind === "item") {
    const usage = preview.usage;
    const active = (usage?.activation ?? "active") === "active";
    // As the inventory draws it: a cursed item wears the penalty's colours, and nothing is used but an active one.
    const cursed = usage?.activation === "cursed";
    const aimed = active && (usage?.target === "other" || usage?.target === "any");
    return (
      <PlayerEntryCard
        frame={cursed ? "border-danger/40 bg-danger/10" : "border-[#3d3d34] bg-[#1a1a1a]"}
        stripe={cursed ? "bg-danger" : "bg-amber/70"}
        tile={<IeeArtTile entryKey={slug} kind="item" glyph={preview.glyph} art={art} polarity={preview.polarity} size="md" />}
        title={preview.name[locale]}
        badge={
          <>
            {usage && usage.charges !== null && usage.charges > 1 ? (
              <Badge variant="amber">{format(p.charges, { count: String(usage.charges) })}</Badge>
            ) : null}
            {cursed ? <Badge variant="danger">{p.cursed}</Badge> : !active ? <Badge variant="military">{p.passive}</Badge> : null}
          </>
        }
        description={preview.ruleText[locale]}
        flavor={preview.flavor?.[locale]}
        footer={
          usage ? (
            active ? (
              <>
                {usage.window !== "after_dice" && <CardMeta icon={MapPinIcon}>{t.iee.admin.window[usage.window]}</CardMeta>}
                {aimed && <CardMeta icon={UserIcon}>{t.iee.admin.target[usage.target]}</CardMeta>}
                <span className="hud-btn hud-btn-primary pointer-events-none ml-auto !px-4 !py-1.5 text-xs" aria-hidden>
                  {panel.usePreview}
                </span>
              </>
            ) : (
              <CardMeta icon={cursed ? FireIcon : BoltIcon}>{cursed ? p.cursedMeta : p.passiveMeta}</CardMeta>
            )
          ) : null
        }
      />
    );
  }

  const negative = preview.polarity === "negative";
  const duration = preview.duration;
  const count = duration?.count ?? null;
  const label =
    duration && duration.unit === "next_game"
      ? p.expiresNextGame
      : duration && count !== null
        ? format(
            duration.unit === "rolls"
              ? p.expiresIn
              : duration.unit === "triggers"
                ? p.expiresCharges
                : duration.unit === "moves"
                  ? p.expiresMoves
                  : p.expiresPassed,
            { count: String(count) },
          )
        : null;
  return (
    <PlayerEntryCard
      frame={negative ? "border-danger/40 bg-danger/10" : "border-military/40 bg-military/10"}
      stripe={negative ? "bg-danger" : "bg-military"}
      tile={<IeeArtTile entryKey={slug} kind="effect" glyph={preview.glyph} art={art} polarity={preview.polarity} size="md" />}
      title={preview.name[locale]}
      badge={<Badge variant={negative ? "danger" : "military"}>{t.iee.polarity[preview.polarity]}</Badge>}
      description={preview.ruleText[locale]}
      flavor={preview.flavor?.[locale]}
      footer={
        count !== null && label !== null ? (
          <DurationMeter left={count} total={count} tone={negative ? "danger" : "military"} label={label} />
        ) : (
          // An instant effect keeps nothing to count; anything else without a count stays for good.
          <CardMeta icon={ClockIcon}>{duration?.unit === "instant" ? t.iee.admin.durationInstant : p.permanent}</CardMeta>
        )
      }
    />
  );
}
