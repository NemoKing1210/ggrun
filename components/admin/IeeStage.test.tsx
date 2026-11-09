// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { CORE_DOCS, CORE_ENTRY_IDS } from "@/lib/engine/iee/core-docs";
import {
  DEFAULT_SEASON_CONFIG,
  HANDOUT_TAG,
  matchesCatalogFilter,
  RARITY_WEIGHT,
  type SeasonCatalogEntry,
  type SeasonConfig,
} from "@/lib/engine";
import { coreLibrary, withNewRevision } from "@/lib/modules/iee/catalog/fixtures.test-helpers";
import { libraryOptions, type LibraryOption } from "@/lib/modules/iee/catalog/views";

import { IeeStage, type EventOption } from "./IeeStage";

const t = getDictionary("en");
const s = t.iee.stage;
const f = t.iee.admin.filters;

/** What the season page hands the stage: the library, each revision compiled. */
const OPTIONS = libraryOptions(coreLibrary());

const viewOf = (o: LibraryOption) => o.revisions.find((r) => r.revisionId === o.latestRevisionId)!.view!;
// Items first, then effects, each by name — as the stage lists them.
const rows = [...OPTIONS]
  .map((o) => ({ o, v: viewOf(o) }))
  .sort((a, b) => (a.o.kind === b.o.kind ? a.v.name.en.localeCompare(b.v.name.en, "en") : a.o.kind === "item" ? -1 : 1))
  .map(({ o, v }) => ({ entryId: o.entryId, key: o.key, name: v.name.en, description: v.ruleText.en, polarity: v.polarity, rarity: v.rarity }));
const total = rows.length;
const nameOf = (key: string) => rows.find((r) => r.key === key)!.name;
const positiveIds = rows.filter((r) => r.polarity === "positive").map((r) => r.entryId);
const negativeIds = rows.filter((r) => r.polarity === "negative").map((r) => r.entryId);

/** «Магнит»'s pull and the throw of «Кости судьбы»: tagged `handout` (spec §6.6). */
/** What only an item hands out (spec §6.6): «Притяжение», «Бросок судьбы», «Поиск сокровищ» and wave C's six. */
const HANDOUTS: readonly string[] = CORE_DOCS.filter((d) => d.doc.tags.includes(HANDOUT_TAG)).map((d) => d.entryId);

const counter = (shown: number) => format(f.showing, { shown: String(shown), total: String(total) });

/** A `Field` wraps its input with the label and the hint: match the label's start. */
const fieldLabel = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

function makeCfg(iee: Partial<SeasonConfig["iee"]> = {}): SeasonConfig {
  const cfg = structuredClone(DEFAULT_SEASON_CONFIG);
  cfg.iee = { ...cfg.iee, ...iee };
  return cfg;
}

function renderStage(
  cfg: SeasonConfig,
  opts: { events?: EventOption[]; rows?: SeasonCatalogEntry[]; options?: readonly LibraryOption[] } = {},
) {
  const onChange = vi.fn<(next: SeasonConfig) => void>();
  const onRowsChange = vi.fn<(next: SeasonCatalogEntry[]) => void>();
  function Harness() {
    const [state, setState] = useState<SeasonConfig>(cfg);
    const [catalog, setCatalog] = useState<SeasonCatalogEntry[]>(opts.rows ?? []);
    return (
      <I18nProvider locale="en" t={t}>
        <IeeStage
          cfg={state}
          events={opts.events ?? []}
          catalog={{ options: opts.options ?? OPTIONS }}
          rows={catalog}
          onChange={(next) => {
            onChange(next);
            setState(next);
          }}
          onRowsChange={(next) => {
            onRowsChange(next);
            setCatalog(next);
          }}
        />
      </I18nProvider>
    );
  }
  render(<Harness />);

  const last = (): SeasonConfig => {
    const calls = onChange.mock.calls;
    if (calls.length === 0) throw new Error("IeeStage never called onChange");
    return calls[calls.length - 1]![0];
  };
  const lastRows = (): SeasonCatalogEntry[] => {
    const calls = onRowsChange.mock.calls;
    if (calls.length === 0) throw new Error("IeeStage never called onRowsChange");
    return calls[calls.length - 1]![0];
  };
  const rowOf = (key: keyof typeof CORE_ENTRY_IDS) => lastRows().find((r) => r.entryId === CORE_ENTRY_IDS[key]);
  return { onChange, onRowsChange, last, lastRows, rowOf };
}

describe("IeeStage", () => {
  afterEach(cleanup);

  it("keeps the pools hidden and explains itself while the master switch is off", () => {
    const { last } = renderStage(makeCfg());
    expect(screen.getByText(s.masterOff)).not.toBeNull();
    expect(screen.queryByText(s.presets.heading)).toBeNull();
    expect(screen.queryByText(s.positivePool)).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: s.enable }));

    expect(last().iee.enabled).toBe(true);
    expect(screen.queryByText(s.masterOff)).toBeNull();
    expect(screen.getByText(s.positivePool)).not.toBeNull();
    expect(screen.getByText(s.negativePool)).not.toBeNull();
    expect(screen.getByText(s.presets.heading)).not.toBeNull();
  });

  it("applies the presets as settings plus the whole library attached at one weight", () => {
    const { last, lastRows } = renderStage(makeCfg({ enabled: true }));
    // A handout comes in with its item, switched off: it plays when handed out, never off a wheel.
    const dropping = (rs: SeasonCatalogEntry[]) => rs.filter((r) => !HANDOUTS.includes(r.entryId));

    fireEvent.click(screen.getByText(s.presets.light));
    expect(last().iee).toMatchObject({ enabled: true, allowTargetingOthers: false, pvpProtectionMoves: 3, nothingWeight: 200 });
    expect(lastRows()).toHaveLength(total);
    expect(dropping(lastRows()).every((r) => r.enabled && r.weight === RARITY_WEIGHT.rare)).toBe(true);
    expect(HANDOUTS).toHaveLength(9);
    expect(lastRows().filter((r) => HANDOUTS.includes(r.entryId)).map((r) => r.enabled)).toEqual(HANDOUTS.map(() => false));

    fireEvent.click(screen.getByText(s.presets.standard));
    expect(last().iee).toMatchObject({ allowTargetingOthers: true, nothingWeight: 50 });
    expect(dropping(lastRows()).every((r) => r.weight === RARITY_WEIGHT.common)).toBe(true);

    fireEvent.click(screen.getByText(s.presets.chaos));
    expect(last().iee).toMatchObject({ pvpProtectionMoves: 0, nothingWeight: 0, catchUp: { enabled: true, maxMultiplier: 2 } });

    const before = lastRows();
    fireEvent.click(screen.getByText(s.presets.off));
    expect(last().iee.enabled).toBe(false);
    // Turning the subsystem off is not a reset: the catalog stays.
    expect(lastRows()).toBe(before);
    expect(screen.getByText(s.masterOff)).not.toBeNull();
  });

  it("attaches an entry with what it hands out, and detaches both again", () => {
    const { rowOf, lastRows } = renderStage(makeCfg({ enabled: true }));

    fireEvent.click(screen.getByRole("switch", { name: nameOf("hex_scroll") }));
    expect(rowOf("hex_scroll")).toMatchObject({ enabled: true, weight: RARITY_WEIGHT.common, pool: "bonus" });
    // «Свиток порчи» hands out «Болото»: attached, but it does not drop.
    expect(rowOf("swamp")).toMatchObject({ enabled: false });
    expect(screen.getByText(format(s.dependencyOf, { names: nameOf("hex_scroll") }))).not.toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: nameOf("hex_scroll") }));
    expect(lastRows()).toEqual([]);
  });

  it("keeps an entry something hands out attached, disabled, when it is switched off", () => {
    const { rowOf } = renderStage(makeCfg({ enabled: true }));
    fireEvent.click(screen.getByRole("switch", { name: nameOf("hex_scroll") }));
    fireEvent.click(screen.getByRole("switch", { name: nameOf("swamp") }));
    expect(rowOf("swamp")?.enabled).toBe(true);

    fireEvent.click(screen.getByRole("switch", { name: nameOf("swamp") }));
    expect(rowOf("swamp")).toMatchObject({ enabled: false });
    expect(rowOf("hex_scroll")?.enabled).toBe(true);
  });

  it("enables or disables every entry of one pool without touching the other", () => {
    const { lastRows } = renderStage(makeCfg({ enabled: true }));
    const enabled = () => new Set(lastRows().filter((r) => r.enabled).map((r) => r.entryId));

    // first button belongs to the bonus pool, second to the penalty one
    fireEvent.click(screen.getAllByRole("button", { name: s.enableAll })[0]!);
    for (const id of positiveIds) expect(enabled().has(id)).toBe(true);
    for (const id of negativeIds) expect(enabled().has(id)).toBe(false);

    fireEvent.click(screen.getAllByRole("button", { name: s.disableAll })[0]!);
    expect(enabled().size).toBe(0);
    expect(lastRows()).toEqual([]);

    fireEvent.click(screen.getAllByRole("button", { name: s.enableAll })[1]!);
    for (const id of negativeIds) expect(enabled().has(id)).toBe(true);
    for (const id of positiveIds) expect(enabled().has(id)).toBe(false);
  });

  it("filters the rendered rows by query and armed state, and resets", () => {
    renderStage(makeCfg({ enabled: true }));
    const [a, b] = [rows[0]!, rows[1]!];
    fireEvent.click(screen.getByRole("switch", { name: a.name }));

    fireEvent.change(screen.getByLabelText(f.searchPlaceholder), { target: { value: a.key } });
    const expected = rows.filter((r) => matchesCatalogFilter(r, { query: a.key })).length;
    expect(screen.getByText(counter(expected))).not.toBeNull();
    expect(screen.queryByRole("switch", { name: b.name })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.reset }));
    expect(screen.getByText(counter(total))).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.armedOn }));
    expect(screen.getByText(counter(1))).not.toBeNull();
    expect(screen.getByRole("switch", { name: a.name })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.armedOff }));
    expect(screen.getByText(counter(total - 1))).not.toBeNull();
    expect(screen.queryByRole("switch", { name: a.name })).toBeNull();
  });

  it("shows observed simulation percentages next to the model odds once simulated", () => {
    renderStage(makeCfg({ enabled: true }));
    fireEvent.click(screen.getAllByRole("button", { name: s.enableAll })[0]!);
    expect(screen.queryAllByText(/^\/ \d+\.\d+%$/).length).toBe(0);
    expect(screen.getAllByText(/^\d+\.\d+%$/).length).toBeGreaterThan(0);

    const simulate = screen.getAllByRole("button", { name: s.simulate });
    expect(simulate.length).toBe(2);
    // The wizard spins with Math.random; a fixed stream keeps the test from ever drawing a 4σ fluke.
    let x = 7;
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return x / 2147483648;
    });
    fireEvent.click(simulate[0]!);
    random.mockRestore();
    expect(screen.getAllByText(/^\/ \d+\.\d+%$/).length).toBeGreaterThan(0);
    // The line says how far the spins strayed from the table, and that chance explains it.
    const line = screen.getByText((_, el) => el?.tagName === "P" && (el.textContent ?? "").startsWith(format(s.simulated, { count: "1000" })));
    expect(line.textContent).toMatch(new RegExp(format(s.simulatedWithin, { gap: "\\d+\\.\\d" })));
  });

  it("tunes an attached entry: rarity, pool and weight", () => {
    const { rowOf } = renderStage(makeCfg({ enabled: true }));
    fireEvent.click(screen.getByRole("switch", { name: nameOf("speed_boots") }));

    fireEvent.click(screen.getByRole("button", { name: t.iee.rarity.epic }));
    expect(rowOf("speed_boots")).toMatchObject({ rarity: "epic", weight: RARITY_WEIGHT.epic });
    // Back to the entry's own rarity: no override left.
    fireEvent.click(screen.getByRole("button", { name: t.iee.rarity.common }));
    expect(rowOf("speed_boots")).toMatchObject({ rarity: null, weight: RARITY_WEIGHT.common });

    fireEvent.click(screen.getByRole("button", { name: s.advanced }));
    fireEvent.change(screen.getByLabelText(fieldLabel(s.weight)), { target: { value: "7" } });
    expect(rowOf("speed_boots")?.weight).toBe(7);
    fireEvent.change(screen.getByLabelText(fieldLabel(s.pool)), { target: { value: "penalty" } });
    expect(rowOf("speed_boots")?.pool).toBe("penalty");
  });

  it("offers a newer revision and switches to it", () => {
    const options = libraryOptions(withNewRevision(coreLibrary(), "tailwind", (doc) => void (doc.params!.steps!.default = 3)));
    const tailwind = options.find((o) => o.key === "tailwind")!;
    const first = tailwind.revisions[0]!.revisionId;
    const row: SeasonCatalogEntry = {
      entryId: tailwind.entryId,
      revisionId: first,
      enabled: true,
      pool: "bonus",
      rarity: null,
      weight: 100,
      maxPerSeason: null,
      maxPerPlayer: null,
      cooldownRolls: 0,
      minPosition: 0,
      unlockAfterMove: 0,
      paramOverrides: {},
      durationOverride: null,
      targetOverride: null,
    };
    const { rowOf } = renderStage(makeCfg({ enabled: true }), { rows: [row], options });

    const offer = `${format(s.newerRevision, { number: "2" })} · ${s.diff.title}`;
    expect(screen.getByText(offer)).not.toBeNull();
    // What changes, old → new, before the switch: the old text stays on the row too.
    expect(screen.getAllByText(tailwind.revisions[0]!.view!.ruleText.en)).toHaveLength(2);
    expect(screen.getByText(tailwind.revisions[1]!.view!.ruleText.en)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: s.useLatest }));
    expect(rowOf("tailwind")?.revisionId).toBe(tailwind.latestRevisionId);
    expect(screen.queryByText(offer)).toBeNull();
  });

  it("asks before the revision picker switches, showing what changes", () => {
    const options = libraryOptions(withNewRevision(coreLibrary(), "tailwind", (doc) => void (doc.params!.steps!.default = 3)));
    const tailwind = options.find((o) => o.key === "tailwind")!;
    const row: SeasonCatalogEntry = {
      entryId: tailwind.entryId,
      revisionId: tailwind.latestRevisionId,
      enabled: true,
      pool: "bonus",
      rarity: null,
      weight: 100,
      maxPerSeason: null,
      maxPerPlayer: null,
      cooldownRolls: 0,
      minPosition: 0,
      unlockAfterMove: 0,
      paramOverrides: {},
      durationOverride: null,
      targetOverride: null,
    };
    const { rowOf, onRowsChange } = renderStage(makeCfg({ enabled: true }), { rows: [row], options });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(s.advanced) }));
    fireEvent.change(screen.getByLabelText(fieldLabel(s.revision)), { target: { value: tailwind.revisions[0]!.revisionId } });

    // Nothing switches until the admin confirms.
    expect(onRowsChange).not.toHaveBeenCalled();
    const title = format(s.diff.confirmTitle, { name: nameOf("tailwind"), number: "1" });
    expect(screen.getByText(title)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: format(s.diff.cancel, { number: "2" }) }));
    expect(onRowsChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(fieldLabel(s.revision)), { target: { value: tailwind.revisions[0]!.revisionId } });
    fireEvent.click(screen.getByRole("button", { name: s.diff.confirm }));
    expect(rowOf("tailwind")?.revisionId).toBe(tailwind.revisions[0]!.revisionId);
  });

  it("flags an attached revision above the season's power ceiling", () => {
    renderStage(makeCfg({ enabled: true, powerCeiling: 0 }));
    fireEvent.click(screen.getByRole("switch", { name: nameOf("momentum") }));
    expect(screen.getAllByText(/is above the season's ceiling of 0/).length).toBeGreaterThan(0);
  });

  it("edits the season-wide limits", () => {
    const { last } = renderStage(makeCfg({ enabled: true }));
    fireEvent.change(screen.getByLabelText(fieldLabel(s.limits.maxActiveEffects)), { target: { value: "3" } });
    expect(last().iee.maxActiveEffectsPerPlayer).toBe(3);
    fireEvent.change(screen.getByLabelText(fieldLabel(s.limits.maxActiveEffects)), { target: { value: "" } });
    expect(last().iee.maxActiveEffectsPerPlayer).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "movement" }));
    expect(last().iee.disabledTags).toEqual(["movement"]);
    fireEvent.click(screen.getByRole("button", { name: "movement" }));
    expect(last().iee.disabledTags).toEqual([]);

    fireEvent.change(screen.getByLabelText(format(s.limits.tagLimitLabel, { tag: "dice" })), { target: { value: "1" } });
    expect(last().iee.tagLimits).toEqual({ dice: 1 });
    fireEvent.change(screen.getByLabelText(format(s.limits.tagLimitLabel, { tag: "dice" })), { target: { value: "" } });
    expect(last().iee.tagLimits).toEqual({});
  });

  it("filters by pack once the library holds more than one", () => {
    const extra = coreLibrary()
      .slice(0, 1)
      .map((e) => ({
        ...e,
        entryId: "11111111-1111-4111-8111-111111111111",
        slug: "spooky_scroll",
        pack: { id: "22222222-2222-4222-8222-222222222222", slug: "spooky", names: { ru: "Жуть", en: "Spooky" }, isSystem: false },
        revisions: e.revisions.map((r) => ({ ...r, entryId: "11111111-1111-4111-8111-111111111111", doc: { ...r.doc!, slug: "spooky_scroll" } })),
      }));
    const options = libraryOptions([...coreLibrary(), ...extra]);
    renderStage(makeCfg({ enabled: true }), { options });
    fireEvent.click(screen.getByRole("button", { name: "Spooky" }));
    expect(screen.getByText(format(f.showing, { shown: "1", total: String(total + 1) }))).not.toBeNull();
  });

  it("toggles event keys and keeps the selected count in sync", () => {
    const events: EventOption[] = [
      { key: "evt_alpha", title: "Alpha" },
      { key: "evt_beta", title: "Beta" },
    ];
    const { last } = renderStage(makeCfg({ enabled: true }), { events });
    expect(screen.getByText(format(s.events.selected, { count: "0" }))).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(last().iee.events).toEqual(["evt_alpha"]);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(last().iee.events).toEqual(["evt_alpha", "evt_beta"]);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(last().iee.events).toEqual(["evt_beta"]);
    expect(screen.getByText(format(s.events.selected, { count: "1" }))).not.toBeNull();
  });

  it("explains the empty event pool instead of showing chips", () => {
    renderStage(makeCfg({ enabled: true }));
    expect(screen.getByText(s.events.empty)).not.toBeNull();
  });
});
