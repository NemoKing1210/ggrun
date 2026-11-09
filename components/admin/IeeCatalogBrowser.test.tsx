// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { matchesCatalogFilter, type EntryView } from "@/lib/engine";
import { coreRegistry } from "@/lib/modules/iee/registry";

import { IeeCatalogGrid } from "./IeeCatalogBrowser";

const t = getDictionary("en");
const a = t.iee.admin;
const f = a.filters;

/** The entries as the page hands them over: views, untuned. */
const VIEWS = coreRegistry().views();
const ITEM_VIEWS = VIEWS.filter((v) => v.kind === "item");
const EFFECT_VIEWS = VIEWS.filter((v) => v.kind === "effect");

const counter = (shown: number, total: number) =>
  format(f.showing, { shown: String(shown), total: String(total) });

function renderGrid(entries: readonly EntryView[], usage: Record<string, number> = {}) {
  render(
    <I18nProvider locale="en" t={t}>
      <IeeCatalogGrid entries={entries} usage={usage} />
    </I18nProvider>,
  );
}

describe("IeeCatalogGrid", () => {
  afterEach(cleanup);

  it("renders one card per entry and reports usage from the server map, by entry id", () => {
    const used = ITEM_VIEWS[0]!;
    renderGrid(ITEM_VIEWS, { [used.entryId]: 3 });

    expect(screen.getByText(counter(ITEM_VIEWS.length, ITEM_VIEWS.length))).not.toBeNull();
    for (const view of ITEM_VIEWS) {
      expect(screen.getByText(view.name.en)).not.toBeNull();
      expect(screen.getByText(view.key)).not.toBeNull();
      // The rule text is the entry's own, generated from its rules.
      expect(screen.getByText(view.ruleText.en)).not.toBeNull();
    }
    expect(screen.getByText(format(a.usedInSeasons, { count: "3" }))).not.toBeNull();
    expect(screen.getAllByText(a.usedInNone).length).toBe(ITEM_VIEWS.length - 1);
  });

  it("shows an effect's duration, stacking and the triggers its rules listen to", () => {
    renderGrid(EFFECT_VIEWS.filter((v) => v.key === "ward"));
    expect(screen.getByText(format(a.durationCharges, { count: "1" }))).not.toBeNull();
    expect(screen.getByText(a.stacking.stack)).not.toBeNull();
    expect(screen.getByText(a.hooks.beforeCellEffect)).not.toBeNull();
  });

  it("filters live from the search box, reaches the empty state, and resets", () => {
    const target = ITEM_VIEWS[0]!;
    const other = ITEM_VIEWS[1]!;
    renderGrid(ITEM_VIEWS);

    const search = screen.getByLabelText(f.searchPlaceholder);
    fireEvent.change(search, { target: { value: target.key } });

    const expected = ITEM_VIEWS.filter((v) =>
      matchesCatalogFilter(
        { key: v.key, name: v.name.en, description: v.ruleText.en, polarity: v.polarity, rarity: v.rarity },
        { query: target.key },
      ),
    ).length;
    expect(expected).toBeGreaterThan(0);
    expect(screen.getByText(counter(expected, ITEM_VIEWS.length))).not.toBeNull();
    expect(screen.getByText(target.name.en)).not.toBeNull();
    if (expected < ITEM_VIEWS.length) {
      expect(screen.queryByText(other.name.en)).toBeNull();
    }

    fireEvent.change(search, { target: { value: "zzz-no-such-entry" } });
    expect(screen.getByText(f.empty)).not.toBeNull();
    expect(screen.queryByText(target.name.en)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.reset }));
    expect(screen.getByText(counter(ITEM_VIEWS.length, ITEM_VIEWS.length))).not.toBeNull();
    expect(screen.getByText(target.name.en)).not.toBeNull();
  });

  it("filters effects by the polarity and rarity chips and restores with reset", () => {
    const total = EFFECT_VIEWS.length;
    renderGrid(EFFECT_VIEWS);

    const negativeCount = EFFECT_VIEWS.filter((v) => v.polarity === "negative").length;
    const positive = EFFECT_VIEWS.find((v) => v.polarity === "positive");
    expect(negativeCount).toBeGreaterThan(0);
    expect(positive).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: t.iee.polarity.negative }));
    expect(screen.getByText(counter(negativeCount, total))).not.toBeNull();
    expect(screen.queryByText(positive!.name.en)).toBeNull();

    // back to every polarity, then narrow by one rarity
    fireEvent.click(screen.getAllByRole("button", { name: f.all })[0]!);
    const targetRarity = EFFECT_VIEWS[0]!.rarity;
    const rarityCount = EFFECT_VIEWS.filter((v) => v.rarity === targetRarity).length;
    const other = EFFECT_VIEWS.find((v) => v.rarity !== targetRarity);
    expect(rarityCount).toBeGreaterThan(0);
    expect(other).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: t.iee.rarity[targetRarity] }));
    expect(screen.getByText(counter(rarityCount, total))).not.toBeNull();
    expect(screen.queryByText(other!.name.en)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.reset }));
    expect(screen.getByText(counter(total, total))).not.toBeNull();
    expect(screen.getByText(EFFECT_VIEWS[0]!.name.en)).not.toBeNull();
  });
});
