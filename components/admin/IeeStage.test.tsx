// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { dictText } from "@/lib/i18n/dict-text";
import { format } from "@/lib/i18n/format";
import {
  DEFAULT_SEASON_CONFIG,
  listEffects,
  listItems,
  matchesCatalogFilter,
  RARITY_WEIGHT,
  type Polarity,
  type Rarity,
  type SeasonConfig,
} from "@/lib/engine";

import { IeeStage, type EventOption } from "./IeeStage";

const t = getDictionary("en");
const s = t.iee.stage;
const f = t.iee.admin.filters;

type Row = {
  key: string;
  name: string;
  description: string;
  polarity: Polarity;
  rarity: Rarity;
};

const catalogRows: Row[] = [
  ...listItems().map((d): Row => ({
    key: d.key,
    name: dictText(t, d.i18n.name),
    description: dictText(t, d.i18n.description),
    polarity: d.polarity,
    rarity: d.rarity,
  })),
  ...listEffects().map((d): Row => ({
    key: d.key,
    name: dictText(t, d.i18n.name),
    description: dictText(t, d.i18n.description),
    polarity: d.polarity,
    rarity: d.rarity,
  })),
];

const total = catalogRows.length;
const positiveKeys = catalogRows.filter((r) => r.polarity === "positive").map((r) => r.key);
const negativeKeys = catalogRows.filter((r) => r.polarity === "negative").map((r) => r.key);

// Registry order puts the item catalog first; `hex_scroll` leads it.
const rowA = catalogRows[0];
const rowB = catalogRows[1];

const counter = (shown: number) =>
  format(f.showing, { shown: String(shown), total: String(total) });

function makeCfg(iee: Partial<SeasonConfig["iee"]> = {}): SeasonConfig {
  const cfg = structuredClone(DEFAULT_SEASON_CONFIG);
  cfg.iee = { ...cfg.iee, ...iee };
  return cfg;
}

function renderStage(cfg: SeasonConfig, events: EventOption[] = []) {
  const onChange = vi.fn<(next: SeasonConfig) => void>();
  function Harness() {
    const [state, setState] = useState<SeasonConfig>(cfg);
    return (
      <I18nProvider locale="en" t={t}>
        <IeeStage
          cfg={state}
          events={events}
          onChange={(next) => {
            onChange(next);
            setState(next);
          }}
        />
      </I18nProvider>
    );
  }
  render(<Harness />);

  const last = (): SeasonConfig => {
    const calls = onChange.mock.calls;
    if (calls.length === 0) throw new Error("IeeStage never called onChange");
    return calls[calls.length - 1][0];
  };
  return { onChange, last };
}

describe("IeeStage", () => {
  afterEach(cleanup);

  it("keeps the pools hidden and explains itself while the master switch is off", () => {
    const { last } = renderStage(makeCfg());
    expect(screen.getByText(s.masterOff)).not.toBeNull();
    expect(screen.queryByText(s.presets.heading)).toBeNull();
    expect(screen.queryByText(s.positivePool)).toBeNull();
    expect(screen.queryByText(s.negativePool)).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: s.enable }));

    expect(last().iee.enabled).toBe(true);
    expect(screen.queryByText(s.masterOff)).toBeNull();
    expect(screen.getByText(s.positivePool)).not.toBeNull();
    expect(screen.getByText(s.negativePool)).not.toBeNull();
    expect(screen.getByText(s.presets.heading)).not.toBeNull();
  });

  it("applies the light / standard / chaos / off presets as whole config patches", () => {
    const { last } = renderStage(makeCfg({ enabled: true }));

    fireEvent.click(screen.getByText(s.presets.light));
    const light = last().iee;
    expect(light.enabled).toBe(true);
    expect(light.allowTargetingOthers).toBe(false);
    expect(light.pvpProtectionMoves).toBe(3);
    expect(light.nothingWeight).toBe(200);
    expect(light.catchUp.enabled).toBe(false);
    expect(Object.keys(light.entries).length).toBe(total);
    expect(light.entries[rowA.key]?.weight).toBe(RARITY_WEIGHT.rare);

    fireEvent.click(screen.getByText(s.presets.standard));
    const standard = last().iee;
    expect(standard.enabled).toBe(true);
    expect(standard.allowTargetingOthers).toBe(true);
    expect(standard.nothingWeight).toBe(50);
    expect(standard.catchUp.enabled).toBe(false);
    expect(Object.keys(standard.entries).length).toBe(total);
    expect(standard.entries[rowA.key]?.weight).toBe(RARITY_WEIGHT.common);

    fireEvent.click(screen.getByText(s.presets.chaos));
    const chaos = last().iee;
    expect(chaos.enabled).toBe(true);
    expect(chaos.allowTargetingOthers).toBe(true);
    expect(chaos.pvpProtectionMoves).toBe(0);
    expect(chaos.nothingWeight).toBe(0);
    expect(chaos.catchUp.enabled).toBe(true);
    expect(chaos.catchUp.maxMultiplier).toBe(2);
    expect(Object.keys(chaos.entries).length).toBe(total);

    fireEvent.click(screen.getByText(s.presets.off));
    const off = last().iee;
    expect(off.enabled).toBe(false);
    // turning the subsystem off keeps the tuned entry map — it is not a reset
    expect(off.entries[rowA.key]?.weight).toBe(RARITY_WEIGHT.common);
    expect(screen.getByText(s.masterOff)).not.toBeNull();
  });

  it("arms an entry with the default weight and deletes the key on disarm", () => {
    const { last } = renderStage(makeCfg({ enabled: true }));

    fireEvent.click(screen.getByRole("switch", { name: rowA.name }));
    const armed = last().iee.entries[rowA.key];
    expect(armed?.enabled).toBe(true);
    expect(armed?.weight).toBe(RARITY_WEIGHT.common);

    fireEvent.click(screen.getByRole("switch", { name: rowA.name }));
    expect(rowA.key in last().iee.entries).toBe(false);
  });

  it("enables or disables every entry of one polarity pool without touching the other", () => {
    const { last } = renderStage(makeCfg({ enabled: true }));

    // first button belongs to the positive pool, second to the negative one
    fireEvent.click(screen.getAllByRole("button", { name: s.enableAll })[0]);
    let entries = last().iee.entries;
    for (const key of positiveKeys) expect(entries[key]?.enabled).toBe(true);
    for (const key of negativeKeys) expect(entries[key]).toBeUndefined();

    fireEvent.click(screen.getAllByRole("button", { name: s.disableAll })[0]);
    entries = last().iee.entries;
    for (const key of positiveKeys) expect(entries[key]).toBeUndefined();

    fireEvent.click(screen.getAllByRole("button", { name: s.enableAll })[1]);
    entries = last().iee.entries;
    for (const key of negativeKeys) expect(entries[key]?.enabled).toBe(true);
    for (const key of positiveKeys) expect(entries[key]).toBeUndefined();
  });

  it("filters the rendered pool rows by query and armed state, and resets", () => {
    renderStage(makeCfg({ enabled: true }));

    // arm row A so the "armed" chips have something to bite on
    fireEvent.click(screen.getByRole("switch", { name: rowA.name }));

    const search = screen.getByLabelText(f.searchPlaceholder);
    fireEvent.change(search, { target: { value: rowA.key } });
    const expectedForQuery = catalogRows.filter((r) =>
      matchesCatalogFilter(r, { query: rowA.key }),
    ).length;
    expect(screen.getByText(counter(expectedForQuery))).not.toBeNull();
    expect(screen.getByRole("switch", { name: rowA.name })).not.toBeNull();
    expect(screen.queryByRole("switch", { name: rowB.name })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.reset }));
    expect(screen.getByText(counter(total))).not.toBeNull();
    expect(screen.getByRole("switch", { name: rowB.name })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.armedOn }));
    expect(screen.getByText(counter(1))).not.toBeNull();
    expect(screen.getByRole("switch", { name: rowA.name })).not.toBeNull();
    expect(screen.queryByRole("switch", { name: rowB.name })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.armedOff }));
    expect(screen.getByText(counter(total - 1))).not.toBeNull();
    expect(screen.queryByRole("switch", { name: rowA.name })).toBeNull();
    expect(screen.getByRole("switch", { name: rowB.name })).not.toBeNull();
  });

  it("shows observed simulation percentages next to the model odds once simulated", () => {
    renderStage(makeCfg({ enabled: true }));

    // give the positive pool real slices to draw from
    fireEvent.click(screen.getAllByRole("button", { name: s.enableAll })[0]);
    expect(screen.queryAllByText(/^\/ \d+\.\d+%$/).length).toBe(0);
    expect(screen.getAllByText(/^\d+\.\d+%$/).length).toBeGreaterThan(0);

    const simulateButtons = screen.getAllByRole("button", { name: s.simulate });
    expect(simulateButtons.length).toBe(2);
    fireEvent.click(simulateButtons[0]);

    const observed = screen.getAllByText(/^\/ \d+\.\d+%$/);
    expect(observed.length).toBeGreaterThan(0);
    expect(screen.getByText(format(s.simulated, { count: "1000" }))).not.toBeNull();
  });

  it("toggles event keys and keeps the selected count in sync", () => {
    const events: EventOption[] = [
      { key: "evt_alpha", title: "Alpha" },
      { key: "evt_beta", title: "Beta" },
    ];
    const { last } = renderStage(makeCfg({ enabled: true }), events);

    expect(screen.getByText(format(s.events.selected, { count: "0" }))).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(last().iee.events).toEqual(["evt_alpha"]);
    expect(screen.getByText(format(s.events.selected, { count: "1" }))).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(last().iee.events).toEqual(["evt_alpha", "evt_beta"]);
    expect(screen.getByText(format(s.events.selected, { count: "2" }))).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(last().iee.events).toEqual(["evt_beta"]);
    expect(screen.getByText(format(s.events.selected, { count: "1" }))).not.toBeNull();
  });

  it("explains the empty event pool instead of showing chips", () => {
    renderStage(makeCfg({ enabled: true }), []);
    expect(screen.getByText(s.events.empty)).not.toBeNull();
  });
});
