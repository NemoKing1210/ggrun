// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import UsersManager from "@/components/admin/UsersManager";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type {
  AdminUserRow,
  AdminUserSeasonRow,
} from "@/lib/modules/player/service/admin";

vi.mock("@/lib/modules/player/actions", () => ({
  createUserAction: vi.fn(),
}));

const t = getDictionary("en");
const u = t.admin.users;

const NOW = new Date();
const CREATED = new Date("2025-01-02T00:00:00.000Z");
const OFFLINE = new Date(NOW.getTime() - 60 * 60 * 1000);

const users: AdminUserRow[] = [
  {
    id: "u-admin",
    email: "root@example.com",
    username: "root",
    displayName: "Root Admin",
    avatarUrl: null,
    role: "admin",
    isBlocked: false,
    lastSeenAt: NOW,
    createdAt: CREATED,
  },
  {
    id: "u-judge",
    email: "judge@example.com",
    username: "judge1",
    displayName: null,
    avatarUrl: null,
    role: "judge",
    isBlocked: true,
    lastSeenAt: OFFLINE,
    createdAt: CREATED,
  },
  {
    id: "u-player",
    email: "alice@example.com",
    username: "alice",
    displayName: "Alice",
    avatarUrl: null,
    role: "player",
    isBlocked: false,
    lastSeenAt: null,
    createdAt: CREATED,
  },
  {
    id: "u-viewer",
    email: null,
    username: "bob",
    displayName: null,
    avatarUrl: null,
    role: "viewer",
    isBlocked: false,
    lastSeenAt: OFFLINE,
    createdAt: CREATED,
  },
];

function season(over: Partial<AdminUserSeasonRow>): AdminUserSeasonRow {
  return {
    seasonId: "s0",
    seasonTitle: "S0",
    seasonSlug: "s0",
    seasonStatus: "active",
    position: 1,
    balancePoints: 100,
    status: "active",
    streakPass: 0,
    streakDrop: 0,
    rerollsUsed: 0,
    joinedAt: CREATED,
    ...over,
  };
}

const seasonsByUser: Record<string, AdminUserSeasonRow[]> = {
  "u-admin": [
    season({ seasonId: "s1", seasonTitle: "S1", position: 1, balancePoints: 100 }),
    season({ seasonId: "s2", seasonTitle: "S2", position: 2, balancePoints: 200, seasonStatus: "finished" }),
    season({ seasonId: "s3", seasonTitle: "S3", position: 3, balancePoints: 300, seasonStatus: "paused" }),
    season({ seasonId: "s4", seasonTitle: "S4", position: 4, balancePoints: 400, seasonStatus: "draft" }),
    season({ seasonId: "s5", seasonTitle: "S5", position: 5, balancePoints: 500, seasonStatus: "archived" }),
  ],
};

const actor = { id: "u-admin", username: "root" };

function renderManager() {
  return render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>
        <UsersManager
          initialUsers={users}
          seasonsByUser={seasonsByUser}
          actor={actor}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

const cards = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/admin/users/"]'));

const statValue = (label: string) =>
  screen.getByText(label).previousElementSibling?.textContent;

afterEach(cleanup);

describe("UsersManager", () => {
  it("shows totals, stats and a card per user", () => {
    const { container } = renderManager();

    expect(screen.getByText("[4/4]").textContent).toBe("[4/4]");
    expect(statValue(u.statTotal)).toBe("4");
    expect(statValue(u.statOnline)).toBe("1");
    expect(statValue(u.statBlocked)).toBe("1");
    expect(statValue(u.statStaff)).toBe("2");

    expect(cards(container)).toHaveLength(4);
  });

  it("shrinks the header count as the text filter narrows by username/email/displayName", () => {
    const { container } = renderManager();
    const input = screen.getByPlaceholderText(u.searchPlaceholder);

    fireEvent.change(input, { target: { value: "alice" } });
    expect(screen.getByText("[1/4]").textContent).toBe("[1/4]");
    expect(cards(container)[0].textContent).toContain("Alice");

    fireEvent.change(input, { target: { value: "judge@" } });
    expect(screen.getByText("[1/4]").textContent).toBe("[1/4]");
    expect(cards(container)[0].textContent).toContain("judge1");

    fireEvent.change(input, { target: { value: "Root" } });
    expect(screen.getByText("[1/4]").textContent).toBe("[1/4]");

    fireEvent.change(input, { target: { value: "nobody" } });
    expect(screen.getByText("[0/4]").textContent).toBe("[0/4]");
    expect(screen.getByText(u.empty).textContent).toBe(u.empty);
  });

  it("filters cards through the role tabs and marks the active tab", () => {
    const { container } = renderManager();

    const playerTab = screen.getByRole("button", { name: "Player · 1" });
    fireEvent.click(playerTab);

    expect(playerTab.getAttribute("aria-pressed")).toBe("true");
    let links = cards(container);
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/admin/users/u-player");

    const adminTab = screen.getByRole("button", { name: "Admin · 1" });
    fireEvent.click(adminTab);
    links = cards(container);
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/admin/users/u-admin");

    // Clicking the active tab returns to "all".
    fireEvent.click(adminTab);
    expect(adminTab.getAttribute("aria-pressed")).toBe("false");
    expect(cards(container)).toHaveLength(4);
  });

  it("filters to blocked users only via the switch", () => {
    const { container } = renderManager();

    const toggle = screen.getByRole("switch", { name: u.blockedOnly });
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    const links = cards(container);
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/admin/users/u-judge");
    expect(screen.getByText("[1/4]").textContent).toBe("[1/4]");
  });

  it("links each card, shows the role badge, the active/blocked label and the self marker", () => {
    const { container } = renderManager();
    const links = cards(container);

    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/admin/users/u-admin",
      "/admin/users/u-judge",
      "/admin/users/u-player",
      "/admin/users/u-viewer",
    ]);

    const adminCard = links[0];
    expect(within(adminCard).getByText("Admin").textContent).toBe("Admin");
    expect(within(adminCard).getByText(u.you).textContent).toBe(u.you);
    expect(within(adminCard).getByText(u.activeUser).textContent).toBe(u.activeUser);

    const judgeCard = links[1];
    expect(within(judgeCard).getByText("Judge").textContent).toBe("Judge");
    expect(within(judgeCard).getByText(u.blocked).textContent).toBe(u.blocked);
    expect(within(judgeCard).queryByText(u.activeUser)).toBeNull();
  });

  it("renders season chips with the +N more overflow", () => {
    const { container } = renderManager();
    const adminCard = cards(container)[0];

    expect(within(adminCard).getByText("S1 · cell 1 · 100 pts").textContent).toBe("S1 · cell 1 · 100 pts");
    expect(within(adminCard).getByText("S2 · cell 2 · 200 pts").textContent).toBe("S2 · cell 2 · 200 pts");
    expect(within(adminCard).getByText("S3 · cell 3 · 300 pts").textContent).toBe("S3 · cell 3 · 300 pts");
    expect(within(adminCard).queryByText(/S4 · /)).toBeNull();
    expect(within(adminCard).getByText("+2 more").textContent).toBe("+2 more");

    // A user without seasons shows the empty note instead.
    const viewerCard = cards(container)[3];
    expect(within(viewerCard).getByText(u.noSeasons).textContent).toBe(u.noSeasons);
  });
});
