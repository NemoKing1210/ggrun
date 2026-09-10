"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Range } from "@/components/ui/Range";
import { Switch } from "@/components/ui/Switch";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  catalogCandidates,
  catalogDefaults,
  dropTable,
  matchesCatalogFilter,
  listEffects,
  listItems,
  pickWheelOutcome,
  RARITY_TIER,
  RARITY_WEIGHT,
  type IeeConfig,
  type IeeEntryConfig,
  type IeePlayerSnapshot,
  type PickInput,
  type Polarity,
  type Rarity,
  type SeasonConfig,
} from "@/lib/engine";
import { dictText } from "@/lib/i18n/dict-text";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeIcon } from "@/components/iee/IeeIcon";
import { IeeFilterBar, type ChipGroup } from "@/components/admin/IeeFilterBar";

const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

const ENTRY_DEFAULTS: IeeEntryConfig = {
  enabled: true,
  weight: RARITY_WEIGHT.common,
  polarityOverride: null,
  maxPerSeason: null,
  maxPerPlayer: null,
  cooldownRolls: 0,
  minPosition: 0,
  unlockAfterMove: 0,
  paramOverrides: {},
  durationOverride: null,
  targetOverride: null,
};

export type EventOption = { key: string; title: string };

type CatalogRow = {
  kind: "item" | "effect";
  key: string;
  name: string;
  description: string;
  heroIcon: string;
  polarity: Polarity;
  rarity: Rarity;
};

/** Nearest rarity for a raw weight — the picker is the source of truth, not this. */
function rarityForWeight(weight: number): Rarity {
  let best: Rarity = "common";
  let bestDelta = Infinity;
  for (const r of RARITIES) {
    const delta = Math.abs(RARITY_WEIGHT[r] - weight);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  return best;
}

/** A neutral mid-season player, so the preview is not skewed by one participant. */
const PREVIEW_PLAYER: IeePlayerSnapshot = {
  seasonPlayerId: "preview",
  position: 20,
  balancePoints: 0,
  rollSeq: 10,
  moveCount: 10,
  rank: 2,
  status: "active",
};

const PREVIEW_PLAYERS = 4;

export function IeeStage({
  cfg,
  onChange,
  events,
}: {
  cfg: SeasonConfig;
  onChange: (next: SeasonConfig) => void;
  events: EventOption[];
}) {
  const { t } = useI18n();
  const s = t.iee.stage;
  const [advanced, setAdvanced] = useState<string | null>(null);
  // One filter over both pools rather than one per section: an admin looking
  // for an entry does not know, or care, which polarity it sits under.
  const [query, setQuery] = useState("");
  const [armed, setArmed] = useState("all");
  const [sim, setSim] = useState<{ polarity: Polarity; counts: Record<string, number>; total: number } | null>(null);

  const iee = cfg.iee;
  const setIee = (patch: Partial<IeeConfig>) => onChange({ ...cfg, iee: { ...iee, ...patch } });

  const rows: CatalogRow[] = useMemo(
    () => [
      ...listItems().map((d): CatalogRow => ({
        kind: "item",
        key: d.key,
        name: dictText(t, d.i18n.name),
        description: dictText(t, d.i18n.description),
        heroIcon: d.heroIcon,
        polarity: d.polarity,
        rarity: d.rarity,
      })),
      ...listEffects().map((d): CatalogRow => ({
        kind: "effect",
        key: d.key,
        name: dictText(t, d.i18n.name),
        description: dictText(t, d.i18n.description),
        heroIcon: d.heroIcon,
        polarity: d.polarity,
        rarity: d.rarity,
      })),
    ],
    [t],
  );

  const entryOf = (key: string): IeeEntryConfig | undefined => iee.entries[key];

  const setEntry = (key: string, patch: Partial<IeeEntryConfig> | null) => {
    const next = { ...iee.entries };
    if (patch === null) delete next[key];
    else next[key] = { ...ENTRY_DEFAULTS, ...(next[key] ?? {}), ...patch };
    setIee({ entries: next });
  };

  const effectivePolarity = (row: CatalogRow): Polarity =>
    entryOf(row.key)?.polarityOverride ?? row.polarity;

  /** Builds the picker input the preview and the simulator both use. */
  const pickInput = (polarity: Polarity, rng: () => number): PickInput => ({
    polarity,
    config: iee,
    catalog: catalogCandidates(),
    catalogDefaults: catalogDefaults(),
    player: PREVIEW_PLAYER,
    counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
    activeEffectKeys: [],
    heldItemCount: 0,
    seasonRollSeq: 10,
    playerCount: PREVIEW_PLAYERS,
    rng,
  });

  const table = (polarity: Polarity) => dropTable(pickInput(polarity, () => 0));

  const runSimulation = (polarity: Polarity) => {
    const draws = 1000;
    const counts: Record<string, number> = {};
    // Math.random here on purpose: the point is to see real spread, and the
    // engine takes the generator as an argument precisely so this is possible.
    for (let i = 0; i < draws; i++) {
      const out = pickWheelOutcome(pickInput(polarity, Math.random));
      const key = out.kind === "item" || out.kind === "effect" ? out.key! : out.kind;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    setSim({ polarity, counts, total: draws });
  };

  const applyPreset = (preset: "off" | "light" | "standard" | "chaos") => {
    const all = (weight: number) =>
      Object.fromEntries(rows.map((r) => [r.key, { ...ENTRY_DEFAULTS, weight }]));
    if (preset === "off") return setIee({ enabled: false });
    if (preset === "light")
      return setIee({
        enabled: true,
        allowTargetingOthers: false,
        pvpProtectionMoves: 3,
        nothingWeight: 200,
        catchUp: { enabled: false, maxMultiplier: 1.5 },
        entries: all(RARITY_WEIGHT.rare),
      });
    if (preset === "standard")
      return setIee({
        enabled: true,
        allowTargetingOthers: true,
        pvpProtectionMoves: 3,
        nothingWeight: 50,
        catchUp: { enabled: false, maxMultiplier: 1.5 },
        entries: all(RARITY_WEIGHT.common),
      });
    return setIee({
      enabled: true,
      allowTargetingOthers: true,
      pvpProtectionMoves: 0,
      nothingWeight: 0,
      catchUp: { enabled: true, maxMultiplier: 2 },
      entries: all(RARITY_WEIGHT.common),
    });
  };

  const visibleRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesCatalogFilter(
          // `iee.entries` is read directly rather than through `entryOf`: that
          // closure is rebuilt every render, so depending on it would defeat
          // the memo, and the deps list should name what the body reads.
          { ...row, armed: Boolean(iee.entries[row.key]?.enabled) },
          { query, armed: armed as "all" | "on" | "off" },
        ),
      ),
    [rows, query, armed, iee.entries],
  );

  const filterGroups: ChipGroup[] = [
    {
      id: "armed",
      label: s.filterArmed,
      value: armed,
      onChange: setArmed,
      options: [
        { value: "on", label: t.iee.admin.filters.armedOn },
        { value: "off", label: t.iee.admin.filters.armedOff },
      ],
    },
  ];

  const bulk = (polarity: Polarity, on: boolean) => {
    const next = { ...iee.entries };
    for (const row of rows) {
      if (effectivePolarity(row) !== polarity) continue;
      if (on) next[row.key] = { ...ENTRY_DEFAULTS, ...(next[row.key] ?? {}), enabled: true };
      else if (next[row.key]) delete next[row.key];
    }
    setIee({ entries: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-display text-lg uppercase tracking-wider">{s.heading}</h3>
        <p className="mt-1 max-w-3xl text-xs text-dim">{s.hint}</p>
      </div>

      <Switch
        checked={iee.enabled}
        onChange={(v) => setIee({ enabled: v })}
        label={s.enable}
      />

      {!iee.enabled ? (
        <p className="border border-[#3d3d34] bg-[#1a1a1a] p-3 text-xs text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
          {s.masterOff}
        </p>
      ) : (
        <>
          <Presets onApply={applyPreset} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={s.inventorySize} hint={s.inventorySizeHint}>
              <Input
                type="number"
                min={0}
                max={100}
                value={iee.inventorySize}
                onChange={(e) => setIee({ inventorySize: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label={s.nothingWeight} hint={s.nothingWeightHint}>
              <Input
                type="number"
                min={0}
                max={10000}
                value={iee.nothingWeight}
                onChange={(e) => setIee({ nothingWeight: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            <Switch
              checked={iee.allowTargetingOthers}
              onChange={(v) => setIee({ allowTargetingOthers: v })}
              label={s.allowTargeting}
              description={s.allowTargetingHint}
              variant={iee.allowTargetingOthers ? "danger" : "default"}
            />
            {iee.allowTargetingOthers && (
              <Field label={s.pvpProtection} hint={s.pvpProtectionHint} className="max-w-xs">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={iee.pvpProtectionMoves}
                  onChange={(e) => setIee({ pvpProtectionMoves: Number(e.target.value) || 0 })}
                />
              </Field>
            )}
            <Switch
              checked={iee.revealDropsInFeed}
              onChange={(v) => setIee({ revealDropsInFeed: v })}
              label={s.revealDrops}
            />
            <Switch
              checked={iee.catchUp.enabled}
              onChange={(v) => setIee({ catchUp: { ...iee.catchUp, enabled: v } })}
              label={s.catchUp}
              description={s.catchUpHint}
              variant="military"
            />
            {iee.catchUp.enabled && (
              <Field label={s.catchUpMax} className="max-w-xs">
                <Range
                  min={1}
                  max={5}
                  step={0.1}
                  value={iee.catchUp.maxMultiplier}
                  onChange={(e) =>
                    setIee({ catchUp: { ...iee.catchUp, maxMultiplier: Number(e.target.value) } })
                  }
                />
                <span className="ammo-counter text-xs text-amber">
                  ×{iee.catchUp.maxMultiplier.toFixed(1)}
                </span>
              </Field>
            )}
          </div>

          <IeeFilterBar
            query={query}
            onQuery={setQuery}
            groups={filterGroups}
            shown={visibleRows.length}
            total={rows.length}
            onReset={() => {
              setQuery("");
              setArmed("all");
            }}
          />

          {(["positive", "negative"] as Polarity[]).map((polarity) => (
            <PoolSection
              key={polarity}
              polarity={polarity}
              rows={visibleRows.filter((r) => effectivePolarity(r) === polarity)}
              total={rows.filter((r) => effectivePolarity(r) === polarity).length}
              entryOf={entryOf}
              setEntry={setEntry}
              advanced={advanced}
              setAdvanced={setAdvanced}
              onBulk={(on) => bulk(polarity, on)}
              table={table(polarity)}
              sim={sim?.polarity === polarity ? sim : null}
              onSimulate={() => runSimulation(polarity)}
            />
          ))}

          <EventPool
            events={events}
            selected={iee.events}
            onChange={(next) => setIee({ events: next })}
          />
        </>
      )}
    </div>
  );
}

function Presets({ onApply }: { onApply: (p: "off" | "light" | "standard" | "chaos") => void }) {
  const { t } = useI18n();
  const p = t.iee.stage.presets;
  const cards: Array<{ id: "off" | "light" | "standard" | "chaos"; label: string; hint: string }> = [
    { id: "off", label: p.off, hint: p.offHint },
    { id: "light", label: p.light, hint: p.lightHint },
    { id: "standard", label: p.standard, hint: p.standardHint },
    { id: "chaos", label: p.chaos, hint: p.chaosHint },
  ];
  return (
    <div>
      <p className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{p.heading}</p>
      <p className="mb-2 text-xs text-dim">{p.hint}</p>
      <div className="grid gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onApply(c.id)}
            className="hud-lift border border-[#3d3d34] bg-[#1a1a1a] p-3 text-left transition hover:border-amber/50 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
          >
            <span className="block font-display text-sm uppercase tracking-wider text-amber">
              {c.label}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{c.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PoolSection({
  polarity,
  rows,
  total,
  entryOf,
  setEntry,
  advanced,
  setAdvanced,
  onBulk,
  table,
  sim,
  onSimulate,
}: {
  polarity: Polarity;
  /** Rows left after the stage filter. */
  rows: CatalogRow[];
  /** Rows in this pool before filtering — the header counts the pool, not the view. */
  total: number;
  entryOf: (key: string) => IeeEntryConfig | undefined;
  setEntry: (key: string, patch: Partial<IeeEntryConfig> | null) => void;
  advanced: string | null;
  setAdvanced: (key: string | null) => void;
  onBulk: (on: boolean) => void;
  table: ReturnType<typeof dropTable>;
  sim: { counts: Record<string, number>; total: number } | null;
  onSimulate: () => void;
}) {
  const { t } = useI18n();
  const s = t.iee.stage;
  const label = polarity === "positive" ? s.positivePool : s.negativePool;
  const enabledCount = rows.filter((r) => entryOf(r.key)?.enabled).length;
  const hidden = total - rows.length;

  return (
    <div className="hud-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-sm uppercase tracking-widest text-amber">
          {label}
          <span className="ml-2 font-mono text-xs text-dim">
            {enabledCount}/{total}
            {hidden > 0 ? ` (${rows.length})` : ""}
          </span>
        </h4>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => onBulk(true)} className="hud-btn !px-2 !py-1 text-[11px]">
            {s.enableAll}
          </button>
          <button type="button" onClick={() => onBulk(false)} className="hud-btn !px-2 !py-1 text-[11px]">
            {s.disableAll}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const entry = entryOf(row.key);
          const on = Boolean(entry?.enabled);
          const isOpen = advanced === row.key;
          return (
            <div
              key={row.key}
              className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <IeeIcon
                      heroIcon={row.heroIcon}
                      entryKey={row.key}
                      kind={row.kind}
                      className={`size-4 shrink-0 ${on ? "text-amber" : "text-dim"}`}
                    />
                    <Switch
                      size="sm"
                      checked={on}
                      onChange={(v) => setEntry(row.key, v ? { enabled: true } : null)}
                      label={row.name}
                    />
                    <Badge variant={row.kind === "item" ? "emerald" : "violet"}>
                      {row.kind === "item" ? t.iee.admin.tabs.items : t.iee.admin.tabs.effects}
                    </Badge>
                  </div>
                  <EntryDescription tone="dense">{row.description}</EntryDescription>
                </div>

                {on && entry && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {RARITIES.map((r) => (
                        <Chip
                          key={r}
                          active={rarityForWeight(entry.weight) === r}
                          onClick={() => setEntry(row.key, { weight: RARITY_WEIGHT[r] })}
                        >
                          {t.iee.rarity[r]}
                        </Chip>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdvanced(isOpen ? null : row.key)}
                      aria-expanded={isOpen}
                      className="hud-btn inline-flex items-center gap-1 !px-2 !py-1 text-[11px]"
                    >
                      {s.advanced}
                      <ChevronDownIcon
                        className={`size-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                  </div>
                )}
              </div>

              {on && entry && isOpen && (
                <div className="mt-3 grid gap-3 border-t border-[#2a2a22] pt-3 sm:grid-cols-3">
                  <Field label={s.weight} hint={s.weightHint}>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      value={entry.weight}
                      onChange={(e) => setEntry(row.key, { weight: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label={s.maxPerSeason} hint={s.maxPerSeasonHint}>
                    <Input
                      type="number"
                      min={0}
                      value={entry.maxPerSeason ?? ""}
                      onChange={(e) =>
                        setEntry(row.key, {
                          maxPerSeason: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label={s.maxPerPlayer} hint={s.maxPerPlayerHint}>
                    <Input
                      type="number"
                      min={0}
                      value={entry.maxPerPlayer ?? ""}
                      onChange={(e) =>
                        setEntry(row.key, {
                          maxPerPlayer: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label={s.cooldownRolls} hint={s.cooldownRollsHint}>
                    <Input
                      type="number"
                      min={0}
                      value={entry.cooldownRolls}
                      onChange={(e) => setEntry(row.key, { cooldownRolls: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label={s.minPosition} hint={s.minPositionHint}>
                    <Input
                      type="number"
                      min={0}
                      value={entry.minPosition}
                      onChange={(e) => setEntry(row.key, { minPosition: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label={s.unlockAfterMove} hint={s.unlockAfterMoveHint}>
                    <Input
                      type="number"
                      min={0}
                      value={entry.unlockAfterMove}
                      onChange={(e) => setEntry(row.key, { unlockAfterMove: Number(e.target.value) || 0 })}
                    />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-xs text-dim">{s.poolEmpty}</p>}
      </div>

      <DropTable table={table} sim={sim} onSimulate={onSimulate} rows={rows} />
    </div>
  );
}

function DropTable({
  table,
  sim,
  onSimulate,
  rows,
}: {
  table: ReturnType<typeof dropTable>;
  sim: { counts: Record<string, number>; total: number } | null;
  onSimulate: () => void;
  rows: CatalogRow[];
}) {
  const { t } = useI18n();
  const s = t.iee.stage;
  const total = table.reduce((acc, x) => acc + x.weight, 0);
  // The odds table used to label its rows with catalog keys ("heavy_boots")
  // while the switches above it showed the same entries by name, so nothing
  // connected the two lists an admin was tuning against each other.
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <div className="mt-4 border-t border-[#2a2a22] pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-[11px] uppercase tracking-widest text-zinc-400">
            {s.preview}
          </p>
          <p className="text-xs leading-relaxed text-zinc-400">{s.previewHint}</p>
        </div>
        <button type="button" onClick={onSimulate} className="hud-btn !px-2 !py-1 text-[11px]">
          {s.simulate}
        </button>
      </div>

      {total <= 0 ? (
        <p className="text-xs text-dim">{s.fallbackSlice}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {table.map((slice) => {
            const pct = slice.share * 100;
            const observed = sim ? ((sim.counts[slice.key ?? "nothing"] ?? 0) / sim.total) * 100 : null;
            const row = slice.key ? byKey.get(slice.key) : undefined;
            return (
              <li key={slice.key ?? "nothing"} className="flex items-center gap-2 text-xs">
                <span
                  className="flex w-48 shrink-0 items-center gap-1.5 truncate text-zinc-300"
                  title={slice.key ?? undefined}
                >
                  {row ? (
                    <IeeIcon
                      heroIcon={row.heroIcon}
                      entryKey={row.key}
                      kind={row.kind}
                      className="size-3.5 shrink-0 text-dim"
                    />
                  ) : null}
                  <span className="truncate">{row ? row.name : (slice.key ?? s.nothingSlice)}</span>
                </span>
                <span
                  className="h-2 shrink-0 bg-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]"
                  style={{ width: `${Math.max(2, pct * 1.6)}px` }}
                  aria-hidden
                />
                <span className="ammo-counter text-amber">{pct.toFixed(1)}%</span>
                {observed !== null && (
                  <span className="ammo-counter text-dim">/ {observed.toFixed(1)}%</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sim && (
        <p className="mt-2 font-mono text-[11px] text-dim">
          {format(s.simulated, { count: String(sim.total) })}
        </p>
      )}
    </div>
  );
}

function EventPool({
  events,
  selected,
  onChange,
}: {
  events: EventOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const s = t.iee.stage.events;
  return (
    <div className="hud-card p-4">
      <h4 className="font-display text-sm uppercase tracking-widest text-amber">{s.heading}</h4>
      <p className="mt-1 mb-3 text-xs text-dim">{s.hint}</p>
      {events.length === 0 ? (
        <p className="text-xs text-dim">{s.empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {events.map((e) => (
              <Chip
                key={e.key}
                active={selected.includes(e.key)}
                onClick={() =>
                  onChange(
                    selected.includes(e.key)
                      ? selected.filter((k) => k !== e.key)
                      : [...selected, e.key],
                  )
                }
              >
                {e.title}
              </Chip>
            ))}
          </div>
          <p className="mt-2 font-mono text-[11px] text-dim">
            {format(s.selected, { count: String(selected.length) })}
          </p>
        </>
      )}
    </div>
  );
}

export { RARITY_TIER };
