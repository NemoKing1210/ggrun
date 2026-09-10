import { describe, expect, it } from "vitest";
import * as EnFeed from "../i18n/dictionaries/en/feed";
import * as RuFeed from "../i18n/dictionaries/ru/feed";
import * as UkFeed from "../i18n/dictionaries/uk/feed";
import {
  FEED_FILTERS,
  FEED_FILTER_TYPES,
  isFeedFilterKey,
  matchesFeedFilter,
} from "./feed/filters";

const TABS = Object.keys(FEED_FILTER_TYPES) as Array<keyof typeof FEED_FILTER_TYPES>;
const ALL_TYPES = TABS.flatMap((tab) => [...FEED_FILTER_TYPES[tab]]);

const LOCALES: Array<[string, Record<string, string>]> = [
  ["en", EnFeed.feed.filters],
  ["ru", RuFeed.feed.filters],
  ["uk", UkFeed.feed.filters],
];

describe("feed filters — structure", () => {
  it("the tab list is exactly 'all' plus one tab per type list", () => {
    expect([...FEED_FILTERS].sort()).toEqual(["all", ...TABS].sort());
  });

  it("no tab is empty — an empty tab always renders 'no events match'", () => {
    for (const tab of TABS) expect(FEED_FILTER_TYPES[tab].length).toBeGreaterThan(0);
  });

  it("no event type is filed under two tabs", () => {
    const seen = new Map<string, string>();
    for (const tab of TABS) {
      for (const type of FEED_FILTER_TYPES[tab]) {
        expect(seen.get(type) ?? tab).toBe(tab);
        seen.set(type, tab);
      }
    }
    expect(seen.size).toBe(ALL_TYPES.length);
  });

  it("the IEE tabs are split by subject, not by accident", () => {
    // A new item_/effect_ type filed under "challenges" (or the reverse) would
    // show up under a heading that does not describe it.
    for (const type of FEED_FILTER_TYPES.iee) expect(type).toMatch(/^(item|effect)_/);
    for (const type of FEED_FILTER_TYPES.challenges) expect(type).toMatch(/^event_/);
  });
});

describe("feed filters — matching", () => {
  it("'all' matches every type any tab claims", () => {
    for (const type of ALL_TYPES) expect(matchesFeedFilter(type, "all")).toBe(true);
  });

  it("'all' matches a type no tab claims — it is the absence of a filter", () => {
    expect(matchesFeedFilter("something_invented_later", "all")).toBe(true);
  });

  it("every type matches its own tab and no other", () => {
    for (const tab of TABS) {
      for (const type of FEED_FILTER_TYPES[tab]) {
        expect(matchesFeedFilter(type, tab)).toBe(true);
        for (const other of TABS) {
          if (other === tab) continue;
          expect(matchesFeedFilter(type, other)).toBe(false);
        }
      }
    }
  });

  it("an unknown type falls through every tab but 'all'", () => {
    for (const tab of TABS) expect(matchesFeedFilter("not_an_event", tab)).toBe(false);
  });
});

describe("feed filters — query parameter", () => {
  it("accepts every tab", () => {
    for (const key of FEED_FILTERS) expect(isFeedFilterKey(key)).toBe(true);
  });

  it("rejects anything else, including an absent parameter", () => {
    for (const junk of ["", "ITEMS", "iee ", "../../etc", undefined]) {
      expect(isFeedFilterKey(junk)).toBe(false);
    }
  });
});

describe("feed filters — i18n", () => {
  it("every tab has a label in all three languages", () => {
    for (const [locale, dict] of LOCALES) {
      for (const key of FEED_FILTERS) {
        expect(`${locale}:${key}:${dict[key] ?? ""}`).toMatch(/:.+$/);
      }
    }
  });

  it("no tab is labelled with its own slug", () => {
    // The page dropped its `?? key` fallback; a slug on screen would now mean
    // someone pasted the key in as text.
    for (const [, dict] of LOCALES) {
      for (const key of FEED_FILTERS) expect(dict[key]).not.toBe(key);
    }
  });
});
