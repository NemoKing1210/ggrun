// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { I18nProvider } from "@/lib/i18n/client";

const nav = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/lib/modules/auth/actions/logout", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/admin/command-palette/CommandPaletteProvider", () => ({
  useAdminConsole: () => null,
}));

import { AdminHeader } from "./AdminHeader";

const t = getDictionary("en");

const navLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/moderation", label: "Moderation" },
];

const renderHeader = (over: { pathname?: string; moderationPending?: number } = {}) => {
  nav.pathname = over.pathname ?? "/admin";
  return render(
    <I18nProvider locale="en" t={t}>
      <AdminHeader
        navLinks={navLinks}
        moderationPending={over.moderationPending}
        userName="Ada Lovelace"
        username="ada"
        userAvatar={null}
        lastSeenAt={null}
        t={t}
      />
    </I18nProvider>,
  );
};

beforeEach(() => {
  nav.pathname = "/admin";
});

afterEach(() => {
  cleanup();
});

describe("AdminHeader", () => {
  it("shows the console brand and a link back to the site", () => {
    renderHeader();
    expect(screen.getByText(t.admin.nav.console)).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(t.admin.nav.backToSite) }).getAttribute("href")).toBe("/");
  });

  it("marks the exact route as the current page", () => {
    renderHeader({ pathname: "/admin" });
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("aria-current")).toBeNull();
  });

  it("treats a nested path as active for its section", () => {
    renderHeader({ pathname: "/admin/users/42" });
    const users = screen.getByRole("link", { name: "Users" });
    expect(users.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });

  it("does not treat a sibling path as the dashboard", () => {
    renderHeader({ pathname: "/adminx" });
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows the moderation pending badge", () => {
    renderHeader({ moderationPending: 3 });
    const badge = screen.getByText("3");
    expect(badge.getAttribute("title")).toBe(format(t.admin.moderation.pendingCount, { count: "3" }));
  });

  it("hides the moderation badge at zero", () => {
    renderHeader({ moderationPending: 0 });
    expect(screen.queryByText("0")).toBeNull();
  });

  it("opens the mobile navigation with the logout control", () => {
    renderHeader();
    const burger = screen.getByRole("button", { name: t.core.nav.menu });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(burger);
    expect(burger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("link", { name: "Users" }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: t.core.nav.logout }).length).toBeGreaterThan(0);
  });
});
