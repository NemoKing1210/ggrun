import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import pkg from "@/package.json";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { SiteFooter } from "./SiteFooter";

const t = getDictionary("en");

const render = (showAdmin: boolean, wide = false) =>
  renderToStaticMarkup(<SiteFooter t={t} showAdmin={showAdmin} wide={wide} />);

describe("SiteFooter", () => {
  it("brands the site with the app name, tagline and about text", () => {
    const html = render(false);
    expect(html).toContain(t.core.common.appName);
    expect(html).toContain(t.core.footer.tagline);
    expect(html).toContain(t.core.footer.aboutText);
  });

  it("links every in-app section with its dictionary label", () => {
    const html = render(false);
    for (const [href, label] of [
      ["/board", t.core.nav.board],
      ["/leaderboard", t.core.nav.leaderboard],
      ["/feed", t.core.nav.feed],
      ["/rules", t.core.nav.rules],
      ["/seasons", t.core.nav.seasons],
    ] as const) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(label);
    }
  });

  it("opens the external links in a new tab with a safe rel", () => {
    const html = render(false);
    expect(html).toContain('href="https://github.com/NemoKing1210/ggrun"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows the admin console link only for staff", () => {
    expect(render(true)).toContain('href="/admin"');
    expect(render(false)).not.toContain('href="/admin"');
  });

  it("stamps the current year and the package version", () => {
    const html = render(false);
    expect(html).toContain(String(new Date().getFullYear()));
    expect(html).toContain(pkg.version);
  });

  it("widens the shell when the admin width is requested", () => {
    expect(render(false, true)).toContain("max-w-7xl");
    expect(render(false, false)).toContain("max-w-6xl");
  });
});
