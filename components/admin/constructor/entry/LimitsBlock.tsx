"use client";

import { useState } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { PARAM_NAME_RE, type ParamDecl } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { paramUses, removeParam, renameParam } from "@/lib/modules/iee/library/draft";

import { issueText } from "../issue-text";
import { Block } from "../parts";
import { issuesWhere, useEditor } from "./editor-context";
import { intOf } from "./UsageBlock";

/**
 * Limits (plan §6 task 3.2): the numbers a season may tune, with the bounds
 * it may tune them within (spec §5.1). A parameter is born in a rule — a
 * value switched to "Parameter" — and lives here.
 */
export function LimitsBlock() {
  const { t } = useI18n();
  const l = t.ieeEditor.entry.limits;
  const { doc, readOnly, analysis } = useEditor();
  const params = Object.entries(doc.params ?? {});
  const uses = paramUses(doc);
  const issues = issuesWhere(analysis, (s) => s.block === "limits");

  return (
    <Block id="block-limits" title={t.ieeEditor.entry.blocks.limits} errors={issues.errors.length} warnings={issues.warnings.length}>
      <p className="mb-3 max-w-2xl text-xs leading-relaxed text-zinc-500">{l.hint}</p>
      {params.length === 0 ? (
        <p className="text-sm text-dim">{l.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="border-b border-[#3d3d34] text-left font-display text-[11px] uppercase tracking-widest text-dim">
              <tr>
                <th className="p-2">{l.name}</th>
                <th className="p-2">{l.default}</th>
                <th className="p-2">{l.min}</th>
                <th className="p-2">{l.max}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {params.map(([name, decl]) => (
                <ParamRow key={name} name={name} decl={decl} uses={uses[name] ?? 0} readOnly={readOnly} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issues.errors.concat(issues.warnings).length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {issues.errors.map((i, n) => (
            <li key={`e${n}`} className="text-xs text-danger">
              {issueText(i, t)}
            </li>
          ))}
          {issues.warnings.map((i, n) => (
            <li key={`w${n}`} className="text-xs text-amber">
              {issueText(i, t)}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function ParamRow({ name, decl, uses, readOnly }: { name: string; decl: ParamDecl; uses: number; readOnly: boolean }) {
  const { t } = useI18n();
  const l = t.ieeEditor.entry.limits;
  const { update } = useEditor();
  const [draftName, setDraftName] = useState(name);
  const nameOk = PARAM_NAME_RE.test(draftName);
  const setDecl = (next: ParamDecl) => update((d) => ({ ...d, params: { ...(d.params ?? {}), [name]: next } }));

  return (
    <tr className="border-b border-[#2a2a22] align-top">
      <td className="p-2">
        <Input
          value={draftName}
          disabled={readOnly}
          className="font-mono"
          invalid={!nameOk}
          aria-label={l.name}
          onChange={(e) => setDraftName(e.target.value.trim())}
          onBlur={() => {
            if (draftName === name) return;
            if (!nameOk) {
              setDraftName(name);
              return;
            }
            update((d) => renameParam(d, name, draftName));
          }}
        />
        <p className={`mt-1 font-mono text-[11px] ${uses > 0 ? "text-dim" : "text-amber"}`}>
          {uses > 0 ? format(l.uses, { count: String(uses) }) : l.unused}
        </p>
      </td>
      {decl.type === "int" ? (
        <>
          <td className="p-2">
            <Input
              type="number"
              value={decl.default}
              disabled={readOnly}
              aria-label={l.default}
              onChange={(e) => setDecl({ ...decl, default: intOf(e.target.value) ?? 0 })}
            />
          </td>
          <td className="p-2">
            <Input
              type="number"
              value={decl.min ?? ""}
              disabled={readOnly}
              aria-label={l.min}
              onChange={(e) => setDecl({ ...decl, min: intOf(e.target.value) })}
            />
          </td>
          <td className="p-2">
            <Input
              type="number"
              value={decl.max ?? ""}
              disabled={readOnly}
              aria-label={l.max}
              onChange={(e) => setDecl({ ...decl, max: intOf(e.target.value) })}
            />
          </td>
        </>
      ) : decl.type === "bool" ? (
        <td className="p-2" colSpan={3}>
          <Switch size="sm" checked={decl.default} disabled={readOnly} label={l.flag} onChange={(v) => setDecl({ ...decl, default: v })} />
        </td>
      ) : (
        <td className="p-2" colSpan={3}>
          <Select value={decl.default} disabled={readOnly} aria-label={l.choice} onChange={(e) => setDecl({ ...decl, default: e.target.value })}>
            {decl.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </td>
      )}
      <td className="p-2 text-right">
        <button
          type="button"
          className="hud-btn inline-flex items-center !px-2 !py-1.5"
          disabled={readOnly}
          title={`${t.ieeEditor.remove} — ${l.removeHint}`}
          aria-label={t.ieeEditor.remove}
          onClick={() => update((d) => removeParam(d, name))}
        >
          <TrashIcon className="size-3.5" aria-hidden />
        </button>
      </td>
    </tr>
  );
}
