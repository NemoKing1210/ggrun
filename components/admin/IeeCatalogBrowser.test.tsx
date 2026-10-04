// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { dictText } from "@/lib/i18n/dict-text";
import { format } from "@/lib/i18n/format";
import {
  listEffects,
  listItems,
  matchesCatalogFilter,
} from "@/lib/engine";

import { IeeCatalogGrid } from "./IeeCatalogBrowser";

const t = getDictionary("en");
const a = t.iee.admin;
const f = a.filters;

const counter = (shown: number, total: number) =>
  format(f.showing, { shown: String(shown), total: String(total) });

function renderGrid(kind: "items" | "effects", usage: Record<string, number> = {}) {
  render(
    <I18nProvider locale="en" t={t}>
      <IeeCatalogGrid kind={kind} usage={usage} />
    </I18nProvider>,
  );
}

describe("IeeCatalogGrid", () => {
  afterEach(cleanup);

  it("renders one card per catalog entry and reports usage from the server map", () => {
    const defs = listItems();
    const used = defs[0];
    renderGrid("items", { [used.key]: 3 });

    expect(screen.getByText(counter(defs.length, defs.length))).not.toBeNull();
    for (const def of defs) {
      expect(screen.getByText(dictText(t, def.i18n.name))).not.toBeNull();
      expect(screen.getByText(def.key)).not.toBeNull();
    }
    expect(screen.getByText(format(a.usedInSeasons, { count: "3" }))).not.toBeNull();
    expect(screen.getAllByText(a.usedInNone).length).toBe(defs.length - 1);
  });

  it("filters live from the search box, reaches the empty state, and resets", () => {
    const defs = listItems();
    const target = defs[0];
    const other = defs[1];
    const targetName = dictText(t, target.i18n.name);
    renderGrid("items");

    const search = screen.getByLabelText(f.searchPlaceholder);
    fireEvent.change(search, { target: { value: target.key } });

    const expected = defs.filter((d) =>
      matchesCatalogFilter(
        {
          key: d.key,
          name: dictText(t, d.i18n.name),
          description: dictText(t, d.i18n.description),
          polarity: d.polarity,
          rarity: d.rarity,
        },
        { query: target.key },
      ),
    ).length;
    expect(expected).toBeGreaterThan(0);
    expect(screen.getByText(counter(expected, defs.length))).not.toBeNull();
    expect(screen.getByText(targetName)).not.toBeNull();
    if (expected < defs.length) {
      expect(screen.queryByText(dictText(t, other.i18n.name))).toBeNull();
    }

    fireEvent.change(search, { target: { value: "zzz-no-such-entry" } });
    expect(screen.getByText(f.empty)).not.toBeNull();
    expect(screen.queryByText(targetName)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.reset }));
    expect(screen.getByText(counter(defs.length, defs.length))).not.toBeNull();
    expect(screen.getByText(targetName)).not.toBeNull();
  });

  it("filters effects by the polarity and rarity chips and restores with reset", () => {
    const defs = listEffects();
    const total = defs.length;
    renderGrid("effects");

    const negativeCount = defs.filter((d) => d.polarity === "negative").length;
    const positiveDef = defs.find((d) => d.polarity === "positive");
    expect(negativeCount).toBeGreaterThan(0);
    expect(positiveDef).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: t.iee.polarity.negative }));
    expect(screen.getByText(counter(negativeCount, total))).not.toBeNull();
    expect(screen.queryByText(dictText(t, positiveDef!.i18n.name))).toBeNull();

    // back to every polarity, then narrow by one rarity
    fireEvent.click(screen.getAllByRole("button", { name: f.all })[0]);
    const targetRarity = defs[0].rarity;
    const rarityCount = defs.filter((d) => d.rarity === targetRarity).length;
    const otherDef = defs.find((d) => d.rarity !== targetRarity);
    expect(rarityCount).toBeGreaterThan(0);
    expect(otherDef).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: t.iee.rarity[targetRarity] }));
    expect(screen.getByText(counter(rarityCount, total))).not.toBeNull();
    expect(screen.queryByText(dictText(t, otherDef!.i18n.name))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: f.reset }));
    expect(screen.getByText(counter(total, total))).not.toBeNull();
    expect(screen.getByText(dictText(t, defs[0].i18n.name))).not.toBeNull();
  });
});
