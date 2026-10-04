import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { ActivityCalendar } from "./ActivityCalendar";

const t = getDictionary("en");

const render = (days: Array<{ date: string; count: number }>) =>
  renderToStaticMarkup(
    <I18nProvider locale="en" t={t}>
      <ActivityCalendar days={days} />
    </I18nProvider>,
  );

const dateFmt = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" });

/** The key the component computes for a local day: its ISO date at local midnight. */
const keyFor = (offsetFromBase: number) => {
  const d = new Date(2026, 9, 4);
  d.setDate(d.getDate() - offsetFromBase);
  return d.toISOString().slice(0, 10);
};

const localDate = (offsetFromBase: number) => new Date(2026, 9, 4 - offsetFromBase);

/** The class of the gridcell whose aria-label is exactly `label`. */
const cellClass = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}"`);
  const start = html.indexOf('class="', at) + 'class="'.length;
  return html.slice(start, html.indexOf('"', start));
};

describe("ActivityCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("summarises the year when there is activity", () => {
    const html = render([{ date: keyFor(0), count: 5 }]);
    expect(html).toContain('aria-label="Activity"');
    expect(html).toContain("5 contributions in the last year");
  });

  it("says so when there is none", () => {
    const html = render([]);
    expect(html).toContain("No activity yet — moves, rolls and plays will appear here");
  });

  it("labels a single contribution in the singular", () => {
    const html = render([{ date: keyFor(1), count: 1 }]);
    expect(html).toContain(`aria-label="1 contribution on ${dateFmt.format(localDate(1))}"`);
  });

  it("labels an empty day and keeps it at the base level", () => {
    const html = render([]);
    const label = `No contributions on ${dateFmt.format(localDate(10))}`;
    expect(html).toContain(`aria-label="${label}"`);
    expect(cellClass(html, label)).toContain("bg-[#1a1a18]");
  });

  it("escalates the level with the day's count", () => {
    const html = render([
      { date: keyFor(0), count: 1 },
      { date: keyFor(1), count: 3 },
      { date: keyFor(2), count: 6 },
      { date: keyFor(3), count: 7 },
    ]);
    expect(cellClass(html, `1 contribution on ${dateFmt.format(localDate(0))}`)).toContain("bg-amber/15");
    expect(cellClass(html, `3 contributions on ${dateFmt.format(localDate(1))}`)).toContain("bg-amber/30");
    expect(cellClass(html, `6 contributions on ${dateFmt.format(localDate(2))}`)).toContain("bg-amber/60");
    expect(cellClass(html, `7 contributions on ${dateFmt.format(localDate(3))}`)).toContain("bg-amber border border-amber");
  });

  it("renders a full-year grid of weekday-aligned cells", () => {
    const html = render([]);
    const cells = html.match(/role="gridcell"/g) ?? [];
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBeGreaterThanOrEqual(371);
    expect(html).toContain(">Mon<");
    expect(html).toContain(">Wed<");
    expect(html).toContain(">Fri<");
  });

  it("renders the less/more legend", () => {
    const html = render([]);
    expect(html).toContain("Less");
    expect(html).toContain("More");
  });
});
