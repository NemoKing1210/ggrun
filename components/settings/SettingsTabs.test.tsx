// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { AdminSessionRow } from "@/lib/modules/player/service/admin";

import { SettingsTabs } from "./SettingsTabs";

const t = getDictionary("en");

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./SettingsForm", () => ({
  SettingsForm: () => <div data-testid="settings-form" />,
}));

vi.mock("./SettingsSessions", () => ({
  SettingsSessions: () => <div data-testid="settings-sessions" />,
}));

function session(id: string, isActive = true): AdminSessionRow {
  return {
    id,
    userId: "user-1",
    tokenHash: `hash-${id}`,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2026-02-01T00:00:00Z"),
    isActive,
  };
}

const user = {
  displayName: "Ada",
  bio: null,
  avatarUrl: null,
  bannerUrl: null,
  accent: null,
  locale: "en",
  links: null,
};

function renderTabs(initialTab: "profile" | "sessions", sessions: AdminSessionRow[] = []) {
  return render(
    <I18nProvider locale="en" t={t}>
      <SettingsTabs initialTab={initialTab} user={user} sessions={sessions} currentSessionId={null} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
});

afterEach(cleanup);

describe("SettingsTabs", () => {
  it("opens on the initial profile tab", () => {
    renderTabs("profile");
    expect(screen.getByTestId("settings-form")).toBeTruthy();
    expect(screen.queryByTestId("settings-sessions")).toBeNull();
    expect(screen.getByRole("button", { name: t.settings.tabs.profile }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("opens directly on the sessions tab when requested", () => {
    renderTabs("sessions", [session("s1")]);
    expect(screen.getByTestId("settings-sessions")).toBeTruthy();
    expect(screen.queryByTestId("settings-form")).toBeNull();
  });

  it("shows the session count badge", () => {
    renderTabs("profile", [session("s1"), session("s2", false)]);
    const button = screen.getByRole("button", { name: /Sessions/ });
    expect(button.textContent).toContain("2");
  });

  it("switches to sessions and pushes the query param", () => {
    renderTabs("profile");
    fireEvent.click(screen.getByRole("button", { name: /Sessions/ }));
    expect(screen.getByTestId("settings-sessions")).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith("/settings?tab=sessions", { scroll: false });
  });

  it("switches back to profile and drops the query param", () => {
    renderTabs("sessions", [session("s1")]);
    fireEvent.click(screen.getByRole("button", { name: t.settings.tabs.profile }));
    expect(screen.getByTestId("settings-form")).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith("/settings", { scroll: false });
  });

  it("does nothing when the active tab is clicked again", () => {
    renderTabs("profile");
    fireEvent.click(screen.getByRole("button", { name: t.settings.tabs.profile }));
    expect(router.push).not.toHaveBeenCalled();
  });
});
