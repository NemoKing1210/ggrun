"use client";

import { useMemo, useState } from "react";
import { PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { FormShell } from "@/components/admin/FormShell";
import { IeeFilterBar, type ChipGroup } from "@/components/admin/IeeFilterBar";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  createEventTemplateAction,
  deleteEventTemplateAction,
  toggleEventTemplateAction,
  updateEventTemplateAction,
} from "@/lib/modules/iee/actions";

export type EventTemplateRow = {
  id: string;
  key: string;
  title: string;
  descriptionMd: string;
  reward: { points?: number; itemKey?: string; effectKey?: string };
  requiresProof: boolean;
  defaultDeadlineHours: number | null;
  isActive: boolean;
};

export type CatalogOption = { key: string; label: string };

/**
 * Event template CRUD.
 *
 * The reward is edited as three visual fields (points / item / effect), never
 * as a JSON textarea — `DESIGN.md` §1.4. Item and effect come from the
 * hardcoded catalog, so an unknown key cannot be typed in at all.
 */
export function EventTemplatesManager({
  templates,
  items,
  effects,
  usage,
}: {
  templates: EventTemplateRow[];
  items: CatalogOption[];
  effects: CatalogOption[];
  usage: Record<string, number>;
}) {
  const { t } = useI18n();
  const a = t.iee.admin;
  const e = a.events;
  const [editing, setEditing] = useState<EventTemplateRow | null>(null);
  const [creating, setCreating] = useState(false);

  // Event templates are the one IEE list that is admin-authored and unbounded,
  // so this is where a filter earns its keep rather than merely being present.
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (status === "active" && !tpl.isActive) return false;
      if (status === "inactive" && tpl.isActive) return false;
      if (!q) return true;
      return (
        tpl.title.toLowerCase().includes(q) ||
        tpl.key.toLowerCase().includes(q) ||
        tpl.descriptionMd.toLowerCase().includes(q)
      );
    });
  }, [templates, query, status]);

  const groups: ChipGroup[] = [
    {
      id: "status",
      label: t.iee.admin.filters.status,
      value: status,
      onChange: setStatus,
      options: [
        { value: "active", label: e.active },
        { value: "inactive", label: e.inactive },
      ],
    },
  ];

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="hud-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg uppercase tracking-widest text-amber">
              {e.heading}
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-dim">{e.description}</p>
          </div>
          {!creating && !editing && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="hud-btn hud-btn-primary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs"
            >
              <PlusIcon className="size-3.5" aria-hidden />
              {e.create}
            </button>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <div className="hud-card p-4">
          <h3 className="mb-3 font-display text-sm uppercase tracking-widest text-amber">
            {editing ? format(e.editing, { title: editing.title }) : e.create}
          </h3>
          <TemplateForm
            key={editing?.id ?? "new"}
            template={editing}
            items={items}
            effects={effects}
            onDone={close}
          />
        </div>
      )}

      {templates.length > 1 && (
        <IeeFilterBar
          query={query}
          onQuery={setQuery}
          groups={groups}
          shown={shown.length}
          total={templates.length}
          onReset={() => {
            setQuery("");
            setStatus("all");
          }}
        />
      )}

      {templates.length === 0 || shown.length === 0 ? (
        <div className="hud-card p-8 text-center text-dim">
          <p className="font-mono text-sm uppercase tracking-widest">
            {templates.length === 0 ? e.empty : t.iee.admin.filters.empty}
          </p>
        </div>
      ) : (
        <div className="hud-card overflow-x-auto p-4">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-[#3d3d34] text-left text-dim">
              <tr>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.entry}
                </th>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.key}
                </th>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.reward}
                </th>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.proof}
                </th>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.deadline}
                </th>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.seasons}
                </th>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.status}
                </th>
                <th className="p-2 font-display text-[11px] uppercase tracking-widest">
                  {a.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((tpl) => (
                <tr key={tpl.id} className="border-b border-[#2a2a22] align-top">
                  <td className="p-2">
                    <div className="font-display uppercase tracking-wider text-zinc-200">
                      {tpl.title}
                    </div>
                    <EntryDescription tone="dense" className="line-clamp-2 max-w-md">
                      {tpl.descriptionMd}
                    </EntryDescription>
                  </td>
                  <td className="p-2 font-mono text-xs text-zinc-400">{tpl.key}</td>
                  <td className="p-2">
                    <RewardCells reward={tpl.reward} items={items} effects={effects} none={e.noReward} />
                  </td>
                  <td className="p-2 text-xs text-zinc-400">
                    {tpl.requiresProof ? e.proofRequired : e.proofNotRequired}
                  </td>
                  <td className="p-2 font-mono text-xs text-zinc-400">
                    {tpl.defaultDeadlineHours === null
                      ? e.noDeadline
                      : format(e.deadlineHours, { count: String(tpl.defaultDeadlineHours) })}
                  </td>
                  <td className="p-2">
                    {(usage[tpl.key] ?? 0) > 0 ? (
                      <span className="font-mono text-xs text-amber">
                        {format(a.usedInSeasons, { count: String(usage[tpl.key] ?? 0) })}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-dim">{a.usedInNone}</span>
                    )}
                  </td>
                  <td className="p-2">
                    <Badge variant={tpl.isActive ? "military" : "dim"}>
                      {tpl.isActive ? e.active : e.inactive}
                    </Badge>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setEditing(tpl);
                        }}
                        className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]"
                        aria-label={e.edit}
                        title={e.edit}
                      >
                        <PencilSquareIcon className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="submit"
                        form={`toggle-${tpl.id}`}
                        className="hud-btn !px-2 !py-1 text-[11px]"
                      >
                        {tpl.isActive ? e.inactive : e.active}
                      </button>
                      <ConfirmButton
                        form={`delete-${tpl.id}`}
                        message={format(e.deleteConfirm, { title: tpl.title })}
                        className="hud-btn hud-btn-danger inline-flex items-center gap-1 !px-2 !py-1 text-[11px]"
                        aria-label={e.delete}
                        title={e.delete}
                      >
                        <TrashIcon className="size-3.5" aria-hidden />
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* A <form> cannot wrap <td> cells — one hidden form per row, wired
              by the `form=` attribute above (AGENTS.md §6).

              Keyed to every template rather than to the filtered set: a row
              hidden by a filter would otherwise leave its buttons pointing at
              a form id that no longer exists in the document. */}
          {templates.map((tpl) => (
            <div key={`forms-${tpl.id}`}>
              <form id={`toggle-${tpl.id}`} action={toggleEventTemplateAction}>
                <input type="hidden" name="id" value={tpl.id} />
                <input type="hidden" name="isActive" value={tpl.isActive ? "false" : "true"} />
              </form>
              <form id={`delete-${tpl.id}`} action={deleteEventTemplateAction}>
                <input type="hidden" name="id" value={tpl.id} />
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RewardCells({
  reward,
  items,
  effects,
  none,
}: {
  reward: EventTemplateRow["reward"];
  items: CatalogOption[];
  effects: CatalogOption[];
  none: string;
}) {
  const parts: React.ReactNode[] = [];
  if (reward.points) {
    parts.push(
      <Badge key="p" variant="amber">
        +{reward.points}
      </Badge>,
    );
  }
  if (reward.itemKey) {
    parts.push(
      <Badge key="i" variant="emerald">
        {items.find((o) => o.key === reward.itemKey)?.label ?? reward.itemKey}
      </Badge>,
    );
  }
  if (reward.effectKey) {
    parts.push(
      <Badge key="e" variant="violet">
        {effects.find((o) => o.key === reward.effectKey)?.label ?? reward.effectKey}
      </Badge>,
    );
  }
  if (parts.length === 0) return <span className="text-xs text-dim">{none}</span>;
  return <div className="flex flex-wrap gap-1">{parts}</div>;
}

function TemplateForm({
  template,
  items,
  effects,
  onDone,
}: {
  template: EventTemplateRow | null;
  items: CatalogOption[];
  effects: CatalogOption[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const e = t.iee.admin.events;
  const f = e.fields;
  const [requiresProof, setRequiresProof] = useState(template?.requiresProof ?? true);

  return (
    <FormShell
      action={template ? updateEventTemplateAction : createEventTemplateAction}
      submitLabel={e.save}
    >
      {template && <input type="hidden" name="id" value={template.id} />}
      <input type="hidden" name="requiresProof" value={requiresProof ? "true" : "false"} />

      <div className="grid gap-3 sm:grid-cols-2">
        {!template && (
          <Field label={f.key} hint={f.keyHint}>
            <Input name="key" required pattern="[a-z0-9_]{3,64}" placeholder="screenshot_of_the_day" />
          </Field>
        )}
        <Field label={f.title}>
          <Input name="title" required defaultValue={template?.title ?? ""} maxLength={120} />
        </Field>
      </div>

      <Field label={f.description} hint={f.descriptionHint}>
        <Textarea
          name="descriptionMd"
          required
          rows={4}
          maxLength={4000}
          defaultValue={template?.descriptionMd ?? ""}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={f.rewardPoints}>
          <Input
            name="rewardPoints"
            type="number"
            min={0}
            max={1000}
            defaultValue={template?.reward.points ?? ""}
          />
        </Field>
        <Field label={f.rewardItem}>
          <Select name="rewardItemKey" defaultValue={template?.reward.itemKey ?? ""}>
            <option value="">{f.rewardNone}</option>
            {items.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={f.rewardEffect}>
          <Select name="rewardEffectKey" defaultValue={template?.reward.effectKey ?? ""}>
            <option value="">{f.rewardNone}</option>
            {effects.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-2">
        <Field label={f.deadline} hint={f.deadlineHint}>
          <Input
            name="defaultDeadlineHours"
            type="number"
            min={1}
            max={8760}
            defaultValue={template?.defaultDeadlineHours ?? ""}
          />
        </Field>
        <div className="pb-1">
          <Switch
            checked={requiresProof}
            onChange={setRequiresProof}
            label={f.requiresProof}
          />
        </div>
      </div>

      <button type="button" onClick={onDone} className="hud-btn self-start !px-3 !py-1.5 text-xs">
        {e.cancel}
      </button>
    </FormShell>
  );
}
