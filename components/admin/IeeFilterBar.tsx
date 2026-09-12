"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

export type ChipGroup = {
  /** Stable id, so a host can key its state without matching on the label. */
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

/**
 * One filter bar for every IEE list.
 *
 * Deliberately dumb: it owns no state and knows nothing about items, effects
 * or templates. Each host passes the groups that make sense for its list —
 * which is the point, because the same bar over the 6-entry items list and
 * over the unbounded event-template list are not the same feature. A bar on a
 * six-row table is furniture; it is here so it is already in place as the
 * catalog grows, and so the lists that genuinely need it share one control
 * rather than three near-identical ones.
 *
 * Mirrors the toolbar in GamesCatalogManager: live query, chip groups, and a
 * "shown of total" counter so a filtered list can never be mistaken for an
 * empty one.
 */
export function IeeFilterBar({
  query,
  onQuery,
  groups,
  shown,
  total,
  onReset,
}: {
  query: string;
  onQuery: (value: string) => void;
  groups: ChipGroup[];
  shown: number;
  total: number;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const f = t.iee.admin.filters;
  const dirty = query.trim() !== "" || groups.some((g) => g.value !== "all");

  return (
    <div className="hud-card mb-4 flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-dim"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={f.searchPlaceholder}
            aria-label={f.searchPlaceholder}
            className="!pl-8"
          />
        </div>
        <span className="ammo-counter shrink-0 text-xs text-dim">
          {format(f.showing, { shown: String(shown), total: String(total) })}
        </span>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            className="hud-btn inline-flex shrink-0 items-center gap-1 !px-2 !py-1 text-[11px]"
          >
            <XMarkIcon className="size-3" aria-hidden />
            {f.reset}
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.id} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-display text-[11px] uppercase tracking-widest text-dim">
            {group.label}
          </span>
          <Chip
            size="sm"
            active={group.value === "all"}
            onClick={() => group.onChange("all")}
          >
            {f.all}
          </Chip>
          {group.options.map((option) => (
            <Chip
              key={option.value}
              size="sm"
              active={group.value === option.value}
              onClick={() => group.onChange(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      ))}
    </div>
  );
}
