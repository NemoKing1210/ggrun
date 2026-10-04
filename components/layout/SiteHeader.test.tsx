// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

const nav = vi.hoisted(() => ({ pathname: "/" }));
const adminConsole = vi.hoisted(() => ({
  api: null as { open: () => void } | null,
}));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/lib/modules/auth/actions/logout", () => ({ logoutAction: vi.fn() }));
vi.mock("@/lib/i18n/actions", () => ({ setLocaleAction: vi.fn(async () => {}) }));
vi.mock("@/components/admin/command-palette/CommandPaletteProvider", () => ({
  useAdminConsole: () => adminConsole.api,
}));
vi.mock("@/components/notifications/NotificationsBell", () => ({
  NotificationsBell: () => <span data-testid="bell" />,
}));

import { SiteHeader, type SiteHeaderUser } from "./SiteHeader";

const t = getDictionary("en");

const user: SiteHeaderUser = {
  id: "u1",
  displayName: "Ada Lovelace",
  username: "ada",
  avatarUrl: null,
  lastSeenAt: null,
  isStaff: false,
};

const renderHeader = (over: { user?: SiteHeaderUser | null; pathname?: string } = {}) => {
  nav.pathname = over.pathname ?? "/";
  return render(
    <I18nProvider locale="en" t={t}>
      <SiteHeader user={over.user === undefined ? null : over.user} locale="en" t={t} />
    </I18nProvider>,
  );
};

beforeEach(() => {
  nav.pathname = "/";
  adminConsole.api = null;
});

afterEach(() => {
  cleanup();
});

describe("SiteHeader navigation", () => {
  it("brands the app and links home", () => {
    renderHeader();
    const brand = screen.getByRole("link", { name: t.core.common.appName });
    expect(brand.getAttribute("href")).toBe("/");
  });

  it("renders the public links for a guest without a dashboard entry", () => {
    renderHeader();
    for (const label of [
      t.core.nav.home,
      t.core.nav.board,
      t.core.nav.leaderboard,
      t.core.nav.feed,
      t.core.nav.rules,
      t.core.nav.seasons,
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole("link", { name: t.core.nav.dashboard })).toBeNull();
  });

  it("highlights the active route and dims the rest", () => {
    renderHeader({ pathname: "/board" });
    const board = screen.getByRole("link", { name: t.core.nav.board });
    const feed = screen.getByRole("link", { name: t.core.nav.feed });
    expect(board.className).toContain("text-amber");
    expect(feed.className).toContain("text-dim");
  });

  it("offers the login action to guests", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: t.core.nav.login }).getAttribute("href")).toBe("/login");
  });
});

describe("SiteHeader account", () => {
  it("shows the signed-in player, settings and logout", () => {
    renderHeader({ user });
    expect(screen.getByRole("link", { name: t.core.nav.dashboard })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ada Lovelace/ }).getAttribute("href")).toBe("/players/ada");
    expect(screen.getByRole("link", { name: t.core.nav.settings }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("button", { name: t.core.nav.logout })).toBeTruthy();
    expect(screen.getByTestId("bell")).toBeTruthy();
  });

  it("hides the admin console link from non-staff", () => {
    renderHeader({ user });
    expect(screen.queryByRole("link", { name: t.core.nav.admin })).toBeNull();
  });

  it("shows the admin console link to staff", () => {
    renderHeader({ user: { ...user, isStaff: true } });
    expect(screen.getByRole("link", { name: t.core.nav.admin }).getAttribute("href")).toBe("/admin");
  });
});

describe("SiteHeader mobile menu", () => {
  it("toggles the dropdown and closes it when a link is used", () => {
    renderHeader();
    const burger = screen.getByRole("button", { name: t.core.nav.menu });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(burger);
    expect(burger.getAttribute("aria-expanded")).toBe("true");
    // mobile list duplicates the nav links
    expect(screen.getAllByRole("link", { name: t.core.nav.rules }).length).toBe(2);
    fireEvent.click(screen.getAllByRole("link", { name: t.core.nav.rules })[1]!);
    expect(burger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("SiteHeader command palette", () => {
  it("hides the palette button when the console host is absent", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: t.adminConsole.open })).toBeNull();
  });

  it("opens the command palette from the header button", () => {
    const open = vi.fn();
    adminConsole.api = { open };
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: t.adminConsole.open }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
