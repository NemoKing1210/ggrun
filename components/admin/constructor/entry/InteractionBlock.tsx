"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheckIcon, ShieldExclamationIcon } from "@heroicons/react/24/outline";

import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { TAG_RE, type LocalizedText } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { referencedEntries } from "@/lib/modules/iee/library/refs";

import { issueText } from "../issue-text";
import { Block, GroupLabel } from "../parts";
import { issuesWhere, useEditor } from "./editor-context";

/**
 * Interaction (plan §6 task 3.2): how other entries and seasons reach this
 * one — its tags, whether protection reacts to it (harm is a property of the
 * actions, D9), how strong its own protection is (wave B, spec §6.13), and
 * what it hands out or is handed out by.
 */
export function InteractionBlock({
  referencedBy,
}: {
  referencedBy: readonly { entryId: string; slug: string; name: LocalizedText; packSlug: string }[];
}) {
  const { t, locale } = useI18n();
  const x = t.ieeEditor.entry.interaction;
  const { doc, update, readOnly, analysis, tags, refs } = useEditor();
  const [custom, setCustom] = useState("");
  const issues = issuesWhere(analysis, (s) => s.block === "interaction");
  const tierIssues = [...issues.errors, ...issues.warnings].filter((i) => i.path[0] === "protection");
  // A tier is offered to an entry that blocks or reflects — and kept in view while one is set.
  const protects = doc.rules.some((rule) => rule.do.some((a) => a.op === "block" || a.op === "reflect"));
  const tier = doc.protection?.tier ?? 1;
  const setTier = (next: 1 | 2) =>
    update((d) => {
      // Ordinary is the default: it writes nothing.
      const { protection: _protection, ...rest } = d;
      return next === 2 ? { ...rest, protection: { tier: 2 } } : rest;
    });
  const offered = [...new Set([...tags, ...doc.tags])];
  const customOk = TAG_RE.test(custom);

  const toggle = (tag: string) =>
    update((d) => ({ ...d, tags: d.tags.includes(tag) ? d.tags.filter((x) => x !== tag) : [...d.tags, tag] }));
  const add = () => {
    if (!customOk) return;
    update((d) => (d.tags.includes(custom) ? d : { ...d, tags: [...d.tags, custom] }));
    setCustom("");
  };

  const handsOut = referencedEntries(doc).flatMap((id) => {
    const ref = refs.find((r) => r.entryId === id);
    return ref ? [{ id, name: ref.name[locale] ?? ref.name.ru, slug: ref.slug }] : [];
  });

  return (
    <Block id="block-interaction" title={t.ieeEditor.entry.blocks.interaction} errors={issues.errors.length} warnings={issues.warnings.length}>
      <div className="flex flex-col gap-4">
        <div>
          <GroupLabel hint={x.tagsHint}>{x.tags}</GroupLabel>
          <div className="flex flex-wrap gap-1.5">
            {offered.map((tag) => (
              <Chip key={tag} size="sm" active={doc.tags.includes(tag)} disabled={readOnly} onClick={() => toggle(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
          {!readOnly && (
            <form
              className="mt-2 flex max-w-sm gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <Input
                value={custom}
                placeholder={x.customTag}
                aria-label={x.customTag}
                className="font-mono"
                invalid={custom !== "" && !customOk}
                onChange={(e) => setCustom(e.target.value.trim().toLowerCase())}
              />
              <button type="submit" className="hud-btn shrink-0 !px-3 !py-1 text-[11px]" disabled={!customOk}>
                {x.addTag}
              </button>
            </form>
          )}
          {custom !== "" && !customOk && <p className="mt-1 text-xs text-danger">{x.tagInvalid}</p>}
          {issues.errors
            .filter((i) => i.path[0] !== "protection")
            .map((i, n) => (
              <p key={n} className="mt-1 text-xs text-danger">
                {issueText(i, t)}
              </p>
            ))}
        </div>

        <div>
          <GroupLabel hint={x.harmHint}>{x.harm}</GroupLabel>
          <p className={`flex items-start gap-1.5 text-sm ${analysis.harmsTarget ? "text-danger" : "text-zinc-300"}`}>
            {analysis.harmsTarget ? (
              <ShieldExclamationIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            {analysis.harmsTarget ? x.harmsTarget : x.harmsNoone}
          </p>
        </div>

        {(protects || doc.protection !== undefined) && (
          <div>
            <GroupLabel hint={x.tierHint}>{x.tier}</GroupLabel>
            <div className="flex gap-1.5">
              {([1, 2] as const).map((n) => (
                <Chip key={n} size="sm" active={tier === n} disabled={readOnly} onClick={() => setTier(n)}>
                  {x.tiers[n]}
                </Chip>
              ))}
            </div>
            {tierIssues.map((i, n) => (
              <p key={n} className={`mt-1 text-xs ${issues.errors.includes(i) ? "text-danger" : "text-amber"}`}>
                {issueText(i, t)}
              </p>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <GroupLabel>{x.handsOut}</GroupLabel>
            {handsOut.length === 0 ? (
              <p className="text-sm text-dim">{x.nothing}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {handsOut.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/catalog?tab=entry&entry=${r.id}`} className="hud-btn !px-2 !py-1 text-[11px]">
                      {r.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <GroupLabel>{x.handedOutBy}</GroupLabel>
            {referencedBy.length === 0 ? (
              <p className="text-sm text-dim">{x.nothing}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {referencedBy.map((r) => (
                  <li key={r.entryId}>
                    <Link href={`/admin/catalog?tab=entry&entry=${r.entryId}`} className="hud-btn !px-2 !py-1 text-[11px]">
                      {r.name[locale]}
                      <span className="ml-1 font-mono normal-case text-dim">{r.packSlug}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Block>
  );
}
