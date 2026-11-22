"use client";

import { useMemo, useState } from "react";
import { ArrowPathIcon, ChevronDownIcon, ExclamationTriangleIcon, LinkIcon } from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Range } from "@/components/ui/Range";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  catalogPickInputs,
  dropTable,
  matchesCatalogFilter,
  poolPolarity,
  RARITY_TIER,
  RARITY_WEIGHT,
  simulateSpins,
  sliceKey,
  spinGaps,
  type CatalogSubject,
  type EntryView,
  type IeeConfig,
  type IeePlayerSnapshot,
  type PickInput,
  type Polarity,
  type Rarity,
  type SeasonCatalogEntry,
  type SeasonConfig,
} from "@/lib/engine";
import {
  attachEntry,
  detachEntry,
  indexOptions,
  isHandout,
  pinRevision,
  requiredBy,
  tuneEntry,
} from "@/lib/modules/iee/catalog/edit";
import { revisionDiff } from "@/lib/modules/iee/catalog/diff";
import type { LibraryOption, RevisionOption } from "@/lib/modules/iee/catalog/views";
import { RevisionDiffView } from "@/components/admin/RevisionDiff";
import { Modal } from "@/components/ui/Modal";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeIcon } from "@/components/iee/IeeIcon";
import { IeeFilterBar, type ChipGroup } from "@/components/admin/IeeFilterBar";

const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

export type EventOption = { key: string; title: string };

/**
 * What the stage needs from the library, prepared on the server: every entry
 * the season may attach (and whatever it already attaches), each revision
 * compiled into its view — the stage has no compiler.
 */
export interface IeeStageCatalog {
  options: readonly LibraryOption[];
}

/** One line of the stage: a library entry, attached or not. */
type StageRow = {
  option: LibraryOption;
  /** The season's catalog row; null while the entry is not attached. */
  row: SeasonCatalogEntry | null;
  /** The pinned revision, or the latest for an entry not attached. */
  revision: RevisionOption;
  view: EntryView;
  latest: RevisionOption;
  /** The wheel it drops from: the row's pool, else the entry's character. */
  polarity: Polarity;
  /** Attached entries that hand this one out. */
  requiredBy: string[];
  name: string;
  description: string;
};

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

function subjectOf(view: EntryView): CatalogSubject {
  return {
    entryId: view.entryId,
    revisionId: view.revisionId,
    kind: view.kind,
    key: view.key,
    character: view.character,
    rarity: view.rarity,
    tags: view.tags,
    stacking: view.stacking,
  };
}

const nullableNumber = (value: string): number | null => (value.trim() === "" ? null : Math.max(0, Number(value) || 0));

export function IeeStage({
  cfg,
  onChange,
  events,
  catalog,
  rows: catalogRows,
  onRowsChange,
  initialPack,
}: {
  cfg: SeasonConfig;
  onChange: (next: SeasonConfig) => void;
  events: EventOption[];
  catalog: IeeStageCatalog;
  /** The season's catalog as the wizard is editing it. */
  rows: readonly SeasonCatalogEntry[];
  onRowsChange: (next: SeasonCatalogEntry[]) => void;
  /** A pack to filter to on arrival — the library's "attach to a season". */
  initialPack?: string;
}) {
  const { t, locale } = useI18n();
  const s = t.iee.stage;
  const [advanced, setAdvanced] = useState<string | null>(null);
  // One filter over both pools rather than one per section: an admin looking
  // for an entry does not know, or care, which polarity it sits under.
  const [query, setQuery] = useState("");
  const [armed, setArmed] = useState("all");
  const [pack, setPack] = useState(initialPack ?? "all");
  // A switch to another revision waits here until the admin has seen what it changes.
  const [switching, setSwitching] = useState<{ entryId: string; revisionId: string } | null>(null);
  const [sim, setSim] = useState<{ polarity: Polarity; counts: Record<string, number>; total: number } | null>(null);
  const iee = cfg.iee;
  const setIee = (patch: Partial<IeeConfig>) => onChange({ ...cfg, iee: { ...iee, ...patch } });

  const index = useMemo(() => indexOptions(catalog.options), [catalog.options]);

  // Items first, then effects, each by name — the order the stage has always used.
  const rows: StageRow[] = useMemo(() => {
    const byEntry = new Map(catalogRows.map((r) => [r.entryId, r]));
    const out: StageRow[] = [];
    for (const option of catalog.options) {
      const row = byEntry.get(option.entryId) ?? null;
      const latest = option.revisions.find((r) => r.revisionId === option.latestRevisionId);
      const pinned = row ? option.revisions.find((r) => r.revisionId === row.revisionId) : latest;
      const revision = pinned?.view ? pinned : latest?.view ? latest : null;
      if (!revision?.view || !latest) continue;
      out.push({
        option,
        row,
        revision,
        view: revision.view,
        latest,
        polarity: row ? poolPolarity(row.pool) : revision.view.polarity,
        requiredBy: row ? requiredBy(catalogRows, index, option.entryId) : [],
        name: revision.view.name[locale],
        description: revision.view.ruleText[locale],
      });
    }
    return out.sort((a, b) =>
      a.option.kind === b.option.kind ? a.name.localeCompare(b.name, locale) : a.option.kind === "item" ? -1 : 1,
    );
  }, [catalog.options, catalogRows, index, locale]);

  const nameOf = (entryId: string) => rows.find((r) => r.option.entryId === entryId)?.name ?? entryId;

  /** Builds the picker input the preview and the simulator both use. */
  const pickInput = (polarity: Polarity, rng: () => number): PickInput => {
    const { candidates, entries } = catalogPickInputs(
      rows.filter((r) => r.row !== null).map((r) => ({ subject: subjectOf(r.view), row: r.row! })),
    );
    return {
      polarity,
      config: iee,
      catalog: candidates,
      entries,
      catalogDefaults: {},
      player: PREVIEW_PLAYER,
      counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
      activeEffectKeys: [],
      heldItemCount: 0,
      seasonRollSeq: 10,
      playerCount: PREVIEW_PLAYERS,
      rng,
    };
  };

  const table = (polarity: Polarity) => dropTable(pickInput(polarity, () => 0));

  const runSimulation = (polarity: Polarity) => {
    // Math.random here on purpose: the point is to see real spread, and the
    // engine takes the generator as an argument precisely so this is possible.
    const { rng: _rng, ...wheel } = pickInput(polarity, Math.random);
    setSim({ polarity, ...simulateSpins(wheel, 1000, Math.random) });
  };

  /**
   * Every entry the library offers, attached and switched on at one weight —
   * but a handout: it plays when an item hands it out, never off a wheel, and
   * comes in disabled with what hands it out.
   */
  const attachAll = (weight: number) => {
    let next: SeasonCatalogEntry[] = [];
    for (const option of catalog.options.filter((o) => o.available && !isHandout(o))) {
      next = attachEntry(next, index, option.entryId, { weight });
    }
    return next;
  };

  const applyPreset = (preset: "off" | "light" | "standard" | "chaos") => {
    if (preset === "off") return setIee({ enabled: false });
    if (preset === "light") {
      onRowsChange(attachAll(RARITY_WEIGHT.rare));
      return setIee({
        enabled: true,
        allowTargetingOthers: false,
        pvpProtectionMoves: 3,
        nothingWeight: 200,
        catchUp: { enabled: false, maxMultiplier: 1.5 },
      });
    }
    if (preset === "standard") {
      onRowsChange(attachAll(RARITY_WEIGHT.common));
      return setIee({
        enabled: true,
        allowTargetingOthers: true,
        pvpProtectionMoves: 3,
        nothingWeight: 50,
        catchUp: { enabled: false, maxMultiplier: 1.5 },
      });
    }
    onRowsChange(attachAll(RARITY_WEIGHT.common));
    return setIee({
      enabled: true,
      allowTargetingOthers: true,
      pvpProtectionMoves: 0,
      nothingWeight: 0,
      catchUp: { enabled: true, maxMultiplier: 2 },
    });
  };

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (pack === "all" || row.option.pack.id === pack) &&
          matchesCatalogFilter(
            {
              key: row.option.key,
              name: row.name,
              description: row.description,
              polarity: row.polarity,
              rarity: row.row?.rarity ?? row.view.rarity,
              armed: Boolean(row.row?.enabled),
            },
            { query, armed: armed as "all" | "on" | "off" },
          ),
      ),
    [rows, query, armed, pack],
  );

  const packs = useMemo(() => {
    const seen = new Map<string, LibraryOption["pack"]>();
    for (const o of catalog.options) seen.set(o.pack.id, o.pack);
    return [...seen.values()];
  }, [catalog.options]);

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
    ...(packs.length > 1
      ? [
          {
            id: "pack",
            label: s.filterPack,
            value: pack,
            onChange: setPack,
            options: packs.map((p) => ({ value: p.id, label: p.name[locale] })),
          },
        ]
      : []),
  ];

  const setOn = (entryId: string, on: boolean) =>
    onRowsChange(on ? attachEntry(catalogRows, index, entryId) : detachEntry(catalogRows, index, entryId));

  const bulk = (polarity: Polarity, on: boolean) => {
    let next = [...catalogRows];
    for (const row of visibleRows) {
      if (row.polarity !== polarity) continue;
      if (on && row.option.available) next = attachEntry(next, index, row.option.entryId);
      else if (!on && row.row) next = detachEntry(next, index, row.option.entryId);
    }
    onRowsChange(next);
  };

  const tags = useMemo(
    () => [...new Set(rows.flatMap((r) => r.view.tags))].sort(),
    [rows],
  );

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

          <Limits iee={iee} setIee={setIee} tags={tags} />

          <IeeFilterBar
            query={query}
            onQuery={setQuery}
            groups={filterGroups}
            shown={visibleRows.length}
            total={rows.length}
            onReset={() => {
              setQuery("");
              setArmed("all");
              setPack("all");
            }}
          />

          {(["positive", "negative"] as Polarity[]).map((polarity) => (
            <PoolSection
              key={polarity}
              polarity={polarity}
              rows={visibleRows.filter((r) => r.polarity === polarity)}
              total={rows.filter((r) => r.polarity === polarity).length}
              iee={iee}
              showPacks={packs.length > 1}
              nameOf={nameOf}
              onToggle={setOn}
              onPin={(entryId, revisionId) => onRowsChange(pinRevision(catalogRows, index, entryId, revisionId))}
              onAskPin={(entryId, revisionId) => setSwitching({ entryId, revisionId })}
              onTune={(entryId, patch) => onRowsChange(tuneEntry(catalogRows, entryId, patch))}
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

      <SwitchRevisionModal
        request={switching}
        rows={rows}
        onCancel={() => setSwitching(null)}
        onConfirm={(entryId, revisionId) => {
          onRowsChange(pinRevision(catalogRows, index, entryId, revisionId));
          setSwitching(null);
        }}
      />
    </div>
  );
}

/**
 * The explicit switch to another revision (spec §4.2): what changes, then
 * the choice. The season keeps the old revision until the admin confirms.
 */
function SwitchRevisionModal({
  request,
  rows,
  onCancel,
  onConfirm,
}: {
  request: { entryId: string; revisionId: string } | null;
  rows: readonly StageRow[];
  onCancel: () => void;
  onConfirm: (entryId: string, revisionId: string) => void;
}) {
  const { t } = useI18n();
  const d = t.iee.stage.diff;
  const row = request ? rows.find((r) => r.option.entryId === request.entryId) : undefined;
  const target = row?.option.revisions.find((r) => r.revisionId === request?.revisionId);
  const diff = row && target ? revisionDiff(row.revision, target) : null;
  return (
    <Modal open={request !== null && row !== undefined && target !== undefined} onClose={onCancel} panelClassName="max-w-2xl">
      {row && target && (
        <>
          <h3 className="font-display text-lg uppercase tracking-widest">
            {format(d.confirmTitle, { name: row.name, number: String(target.number) })}
          </h3>
          <div className="hazard-tape mt-3 opacity-60" aria-hidden />
          <p className="mt-3 font-display text-[11px] uppercase tracking-widest text-amber">{d.title}</p>
          <div className="mt-2">{diff ? <RevisionDiffView diff={diff} /> : null}</div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">{d.keepNote}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="hud-btn text-xs" onClick={onCancel}>
              {format(d.cancel, { number: String(row.revision.number) })}
            </button>
            <button
              type="button"
              className="hud-btn hud-btn-primary text-xs"
              onClick={() => onConfirm(row.option.entryId, target.revisionId)}
            >
              {d.confirm}
            </button>
          </div>
        </>
      )}
    </Modal>
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

/** Season-wide limits (spec §4.5). Empty means no limit. */
function Limits({
  iee,
  setIee,
  tags,
}: {
  iee: IeeConfig;
  setIee: (patch: Partial<IeeConfig>) => void;
  tags: readonly string[];
}) {
  const { t } = useI18n();
  const l = t.iee.stage.limits;
  const toggleTag = (tag: string) =>
    setIee({
      disabledTags: iee.disabledTags.includes(tag)
        ? iee.disabledTags.filter((x) => x !== tag)
        : [...iee.disabledTags, tag].sort(),
    });
  const setTagLimit = (tag: string, value: string) => {
    const next = { ...iee.tagLimits };
    const n = nullableNumber(value);
    if (n === null) delete next[tag];
    else next[tag] = n;
    setIee({ tagLimits: next });
  };

  return (
    <div className="hud-card p-4">
      <h4 className="font-display text-sm uppercase tracking-widest text-amber">{l.heading}</h4>
      <p className="mt-1 mb-3 text-xs text-dim">{l.hint}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={l.maxActiveEffects} hint={l.maxActiveEffectsHint}>
          <Input
            type="number"
            min={0}
            max={100}
            value={iee.maxActiveEffectsPerPlayer ?? ""}
            onChange={(e) => setIee({ maxActiveEffectsPerPlayer: nullableNumber(e.target.value) })}
          />
        </Field>
        <Field label={l.powerCeiling} hint={l.powerCeilingHint}>
          <Input
            type="number"
            min={0}
            max={1000}
            value={iee.powerCeiling ?? ""}
            onChange={(e) => setIee({ powerCeiling: nullableNumber(e.target.value) })}
          />
        </Field>
        <Field label={l.boardObjects} hint={l.boardObjectsHint}>
          <Input
            type="number"
            min={0}
            max={20}
            value={iee.boardObjectsPerPlayer}
            onChange={(e) => setIee({ boardObjectsPerPlayer: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      {tags.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{l.disabledTags}</p>
            <p className="mb-2 text-xs text-dim">{l.disabledTagsHint}</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Chip key={tag} active={iee.disabledTags.includes(tag)} onClick={() => toggleTag(tag)}>
                  {tag}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="font-display text-[11px] uppercase tracking-widest text-zinc-400">{l.tagLimits}</p>
            <p className="mb-2 text-xs text-dim">{l.tagLimitsHint}</p>
            <div className="grid grid-cols-2 gap-2">
              {tags.map((tag) => (
                <label key={tag} className="flex items-center gap-2 font-mono text-[11px] text-zinc-300">
                  <span className="w-20 truncate">{tag}</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={format(l.tagLimitLabel, { tag })}
                    value={iee.tagLimits[tag] ?? ""}
                    onChange={(e) => setTagLimit(tag, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PoolSection({
  polarity,
  rows,
  total,
  iee,
  showPacks,
  nameOf,
  onToggle,
  onPin,
  onAskPin,
  onTune,
  advanced,
  setAdvanced,
  onBulk,
  table,
  sim,
  onSimulate,
}: {
  polarity: Polarity;
  /** Rows left after the stage filter. */
  rows: StageRow[];
  /** Rows in this pool before filtering — the header counts the pool, not the view. */
  total: number;
  iee: IeeConfig;
  showPacks: boolean;
  nameOf: (entryId: string) => string;
  onToggle: (entryId: string, on: boolean) => void;
  onPin: (entryId: string, revisionId: string) => void;
  /** Asks before switching to another revision — the select's way. */
  onAskPin: (entryId: string, revisionId: string) => void;
  onTune: (entryId: string, patch: Partial<Omit<SeasonCatalogEntry, "entryId" | "revisionId">>) => void;
  advanced: string | null;
  setAdvanced: (key: string | null) => void;
  onBulk: (on: boolean) => void;
  table: ReturnType<typeof dropTable>;
  sim: { counts: Record<string, number>; total: number } | null;
  onSimulate: () => void;
}) {
  const { t, locale } = useI18n();
  const s = t.iee.stage;
  const label = polarity === "positive" ? s.positivePool : s.negativePool;
  const enabledCount = rows.filter((r) => r.row?.enabled).length;
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
        {rows.map((item) => {
          const { option, row, view, revision, latest } = item;
          const on = Boolean(row?.enabled);
          const isOpen = advanced === option.entryId;
          const outdated = row !== null && row.revisionId !== option.latestRevisionId;
          const overPower =
            iee.powerCeiling !== null && revision.power !== null && revision.power > iee.powerCeiling;
          const rarity = row?.rarity ?? view.rarity;
          return (
            <div
              key={option.entryId}
              className="border border-[#3d3d34] bg-[#1a1a1a] p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <IeeIcon
                      glyph={view.glyph}
                      entryKey={option.key}
                      kind={option.kind}
                      art={view.art}
                      className={`size-4 shrink-0 ${on ? "text-amber" : "text-dim"}`}
                    />
                    <Switch
                      size="sm"
                      checked={on}
                      onChange={(v) => onToggle(option.entryId, v)}
                      label={item.name}
                      disabled={!option.available && !row}
                    />
                    <Badge variant={option.kind === "item" ? "emerald" : "violet"}>
                      {option.kind === "item" ? t.iee.admin.tabs.items : t.iee.admin.tabs.effects}
                    </Badge>
                    {showPacks && <Badge variant="dim">{option.pack.name[locale]}</Badge>}
                    {row && option.revisions.length > 1 && (
                      <Badge variant="neutral" className="font-mono">
                        {format(s.revisionNumber, { number: String(revision.number) })}
                      </Badge>
                    )}
                    {overPower && (
                      <Badge variant="danger" title={format(s.overPower, { power: revision.power!.toFixed(1), ceiling: String(iee.powerCeiling) })}>
                        <ExclamationTriangleIcon className="mr-1 size-3" aria-hidden />
                        {format(s.overPower, { power: revision.power!.toFixed(1), ceiling: String(iee.powerCeiling) })}
                      </Badge>
                    )}
                  </div>
                  <EntryDescription tone="dense">{item.description}</EntryDescription>
                  {row && !row.enabled && item.requiredBy.length > 0 && (
                    <p className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-dim">
                      <LinkIcon className="size-3" aria-hidden />
                      {format(s.dependencyOf, { names: item.requiredBy.map(nameOf).join(", ") })}
                    </p>
                  )}
                  {!option.available && row && <p className="mt-1 font-mono text-[11px] text-dim">{s.unavailable}</p>}
                  {outdated && latest.view && (
                    <div className="mt-2 border-l-2 border-amber/40 pl-2">
                      <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-amber">
                        {format(s.newerRevision, { number: String(latest.number) })} · {s.diff.title}
                      </p>
                      {(() => {
                        const diff = revisionDiff(revision, latest);
                        return diff ? (
                          <RevisionDiffView diff={diff} />
                        ) : (
                          <EntryDescription tone="dense">{latest.view.ruleText[locale]}</EntryDescription>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => onPin(option.entryId, latest.revisionId)}
                        className="hud-btn mt-1 inline-flex items-center gap-1 !px-2 !py-1 text-[11px]"
                      >
                        <ArrowPathIcon className="size-3" aria-hidden />
                        {s.useLatest}
                      </button>
                    </div>
                  )}
                </div>

                {row && on && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {RARITIES.map((r) => (
                        <Chip
                          key={r}
                          active={rarity === r}
                          onClick={() =>
                            onTune(option.entryId, { rarity: r === view.rarity ? null : r, weight: RARITY_WEIGHT[r] })
                          }
                        >
                          {t.iee.rarity[r]}
                        </Chip>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdvanced(isOpen ? null : option.entryId)}
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

              {row && on && isOpen && (
                <div className="mt-3 grid gap-3 border-t border-[#2a2a22] pt-3 sm:grid-cols-3">
                  {option.revisions.length > 1 && (
                    <Field label={s.revision} hint={s.revisionHint}>
                      <Select
                        value={row.revisionId}
                        onChange={(e) => onAskPin(option.entryId, e.target.value)}
                      >
                        {option.revisions.map((r) => (
                          <option key={r.revisionId} value={r.revisionId} disabled={!r.view}>
                            {format(r.revisionId === option.latestRevisionId ? s.revisionLatest : s.revisionNumber, {
                              number: String(r.number),
                            })}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label={s.pool} hint={s.poolHint}>
                    <Select
                      value={row.pool}
                      onChange={(e) => onTune(option.entryId, { pool: e.target.value as SeasonCatalogEntry["pool"] })}
                    >
                      <option value="bonus">{s.positivePool}</option>
                      <option value="penalty">{s.negativePool}</option>
                    </Select>
                  </Field>
                  <Field label={s.weight} hint={s.weightHint}>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      value={row.weight}
                      onChange={(e) => onTune(option.entryId, { weight: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label={s.maxPerSeason} hint={s.maxPerSeasonHint}>
                    <Input
                      type="number"
                      min={0}
                      value={row.maxPerSeason ?? ""}
                      onChange={(e) => onTune(option.entryId, { maxPerSeason: nullableNumber(e.target.value) })}
                    />
                  </Field>
                  <Field label={s.maxPerPlayer} hint={s.maxPerPlayerHint}>
                    <Input
                      type="number"
                      min={0}
                      value={row.maxPerPlayer ?? ""}
                      onChange={(e) => onTune(option.entryId, { maxPerPlayer: nullableNumber(e.target.value) })}
                    />
                  </Field>
                  <Field label={s.cooldownRolls} hint={s.cooldownRollsHint}>
                    <Input
                      type="number"
                      min={0}
                      value={row.cooldownRolls}
                      onChange={(e) => onTune(option.entryId, { cooldownRolls: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label={s.minPosition} hint={s.minPositionHint}>
                    <Input
                      type="number"
                      min={0}
                      value={row.minPosition}
                      onChange={(e) => onTune(option.entryId, { minPosition: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label={s.unlockAfterMove} hint={s.unlockAfterMoveHint}>
                    <Input
                      type="number"
                      min={0}
                      value={row.unlockAfterMove}
                      onChange={(e) => onTune(option.entryId, { unlockAfterMove: Number(e.target.value) || 0 })}
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
  rows: StageRow[];
}) {
  const { t } = useI18n();
  const s = t.iee.stage;
  const total = table.reduce((acc, x) => acc + x.weight, 0);
  // The odds table used to label its rows with catalog keys ("heavy_boots")
  // while the switches above it showed the same entries by name, so nothing
  // connected the two lists an admin was tuning against each other.
  const byKey = new Map(rows.map((r) => [r.option.key, r]));

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
            const observed = sim ? ((sim.counts[sliceKey(slice)] ?? 0) / sim.total) * 100 : null;
            const row = slice.key ? byKey.get(slice.key) : undefined;
            return (
              <li key={slice.key ?? "nothing"} className="flex items-center gap-2 text-xs">
                <span
                  className="flex w-48 shrink-0 items-center gap-1.5 truncate text-zinc-300"
                  title={slice.key ?? undefined}
                >
                  {row ? (
                    <IeeIcon
                      glyph={row.view.glyph}
                      entryKey={row.option.key}
                      kind={row.option.kind}
                      art={row.view.art}
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
      {sim && <SimulatedLine table={table} sim={sim} />}
    </div>
  );
}

/** How the 1000 spins compare with the table: the largest gap, and whether chance explains it. */
function SimulatedLine({ table, sim }: { table: ReturnType<typeof dropTable>; sim: { counts: Record<string, number>; total: number } }) {
  const { t } = useI18n();
  const s = t.iee.stage;
  const gaps = spinGaps(table, sim);
  return (
    <p className="mt-2 font-mono text-[11px] text-dim">
      {format(s.simulated, { count: String(sim.total) })} ·{" "}
      <span className={gaps.within ? "text-military" : "text-danger"}>
        {format(gaps.within ? s.simulatedWithin : s.simulatedOff, { gap: (gaps.worst * 100).toFixed(1) })}
      </span>
    </p>
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
