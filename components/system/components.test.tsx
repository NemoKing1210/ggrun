import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccentSync, toAccentKey } from "@/components/system/accent-sync";
import { RetryButton } from "@/components/system/retry-button";
import { SiteUnavailableScreen } from "@/components/system/site-unavailable-screen";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("AccentSync", () => {
  it("renders nothing — it only syncs the CSS variables", () => {
    expect(renderToStaticMarkup(<AccentSync accentKey="amber" />)).toBe("");
  });
});

describe("toAccentKey", () => {
  it("passes a known accent key through", () => {
    expect(toAccentKey("military")).toBe("military");
    expect(toAccentKey("violet")).toBe("violet");
  });

  it("falls back to amber for an unknown key", () => {
    expect(toAccentKey("banana")).toBe("amber");
  });

  it("falls back to amber for a non-string value", () => {
    expect(toAccentKey(undefined)).toBe("amber");
    expect(toAccentKey(42)).toBe("amber");
    expect(toAccentKey(null)).toBe("amber");
  });
});

describe("RetryButton", () => {
  it("renders a labelled reload button", () => {
    const html = renderToStaticMarkup(<RetryButton label="Try again" />);
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("Try again");
  });
});

describe("SiteUnavailableScreen", () => {
  const t = getDictionary("en").core.siteUnavailable;

  it("renders the kicker, title and body from the dictionary", () => {
    const html = renderToStaticMarkup(<SiteUnavailableScreen t={t} />);
    expect(html).toContain(t.kicker);
    expect(html).toContain(t.title);
    expect(html).toContain(t.text);
  });

  it("renders the retry action with its label", () => {
    const html = renderToStaticMarkup(<SiteUnavailableScreen t={t} />);
    expect(html).toContain(t.retry);
    expect(html).toContain("<button");
  });
});
