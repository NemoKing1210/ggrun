import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const t = getDictionary("en");

function render(pathname: string): string {
  navigation.pathname = pathname;
  return renderToStaticMarkup(
    <I18nProvider locale="en" t={t}>
      <Breadcrumbs />
    </I18nProvider>,
  );
}

describe("Breadcrumbs", () => {
  it("labels the navigation landmark", () => {
    const html = render("/");
    expect(html).toContain("<nav");
    expect(html).toContain(`aria-label="${t.core.breadcrumbs.ariaLabel}"`);
  });

  it("renders only the home crumb as current on the root path", () => {
    const html = render("/");
    expect(html).toContain(t.core.nav.home);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("<a");
  });

  it("links every crumb except the last and marks the last current", () => {
    const html = render("/board");
    expect(html).toContain('href="/"');
    expect(html).toContain(t.core.nav.board);
    expect(html).toContain('aria-current="page"');
  });

  it("maps the known top-level segments to dictionary labels", () => {
    expect(render("/leaderboard")).toContain(t.core.nav.leaderboard);
    expect(render("/feed")).toContain(t.core.nav.feed);
    expect(render("/rules")).toContain(t.core.nav.rules);
    expect(render("/seasons")).toContain(t.core.nav.seasons);
    expect(render("/login")).toContain(t.core.auth.loginTitle);
    expect(render("/register")).toContain(t.core.auth.registerTitle);
  });

  it("treats a lone /admin as the dashboard", () => {
    const html = render("/admin");
    expect(html).toContain(t.admin.nav.dashboard);
  });

  it("uses the admin nav label for a nested /admin segment", () => {
    const html = render("/admin/users");
    expect(html).toContain(t.core.nav.admin);
  });

  it("maps nested admin segments and accumulates hrefs", () => {
    const html = render("/admin/users");
    expect(html).toContain(t.core.nav.admin);
    expect(html).toContain(t.admin.nav.users);
    expect(html).toContain('href="/admin"');
  });

  it("maps the games catalog aliases to the catalog label", () => {
    expect(render("/admin/games")).toContain(t.admin.nav.catalog);
    expect(render("/admin/games-catalog")).toContain(t.admin.nav.catalog);
  });

  it("maps the remaining admin segments", () => {
    expect(render("/admin/audit")).toContain(t.admin.nav.audit);
    expect(render("/admin/moderation")).toContain(t.admin.nav.moderation);
    expect(render("/admin/bots")).toContain(t.admin.seasonTabs.bots);
    expect(render("/settings")).toContain(t.settings.heading);
  });

  it("prefixes the username segment after /players with @", () => {
    const html = render("/players/Ada");
    expect(html).toContain("@Ada");
  });

  it("percent-decodes the username segment", () => {
    const html = render("/players/John%20Doe");
    expect(html).toContain("@John Doe");
  });

  it("shortens a UUID-like segment to its first eight characters", () => {
    const html = render("/seasons/12345678-1234-1234-a234-123456789abc");
    expect(html).toContain("12345678…");
    expect(html).not.toContain("123456789abc");
  });

  it("keeps a dash-grouped segment that is not a real UUID verbatim", () => {
    const html = render("/seasons/12345678-1234-1234-123456789abc");
    expect(html).toContain("12345678-1234-1234-123456789abc");
  });

  it("keeps an unknown slug verbatim", () => {
    const html = render("/run-1");
    expect(html).toContain("run-1");
  });

  it("shows a title alongside each crumb for truncated labels", () => {
    const html = render("/players/Ada");
    expect(html).toContain('title="@Ada"');
  });
});
