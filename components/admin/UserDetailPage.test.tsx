// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import { UserDetailPage, type UserTab } from "./UserDetailPage";

import type { AdminUserAuditRow, AdminUserRollRow, AdminUserSeasonRow, AdminSessionRow } from "@/lib/modules/player/service/admin";
import type { UserCompletionRequestRow, UserRerollRequestRow } from "@/lib/modules/catalog/repository/requests";
import type { User } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  updateUserAction: vi.fn(),
  blockUserAction: vi.fn(),
  deleteUserAction: vi.fn(),
  verifyEmailAction: vi.fn(),
  revokeSessionAction: vi.fn(),
  revokeAllSessionsAction: vi.fn(),
  approveRerollAction: vi.fn(),
  rejectRerollAction: vi.fn(),
  approveCompletionAction: vi.fn(),
  rejectCompletionAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/admin/users/u1",
}));

vi.mock("@/lib/modules/player/actions", () => ({
  updateUserAction: mocks.updateUserAction,
  blockUserAction: mocks.blockUserAction,
  deleteUserAction: mocks.deleteUserAction,
  verifyEmailAction: mocks.verifyEmailAction,
  revokeSessionAction: mocks.revokeSessionAction,
  revokeAllSessionsAction: mocks.revokeAllSessionsAction,
}));

vi.mock("@/lib/modules/moderation/actions/moderation", () => ({
  approveRerollAction: mocks.approveRerollAction,
  rejectRerollAction: mocks.rejectRerollAction,
  approveCompletionAction: mocks.approveCompletionAction,
  rejectCompletionAction: mocks.rejectCompletionAction,
}));

const t = getDictionary("en");
const u = t.admin.users;

const USER_ID = "11111111-1111-4111-8111-111111111111";

const baseUser: User = {
  id: USER_ID,
  email: "alice@example.com",
  username: "alice",
  passwordHash: "hashed",
  displayName: "Alice Liddell",
  avatarUrl: null,
  bannerUrl: null,
  twitchLogin: null,
  role: "player",
  isBlocked: false,
  bio: null,
  links: [],
  accent: "amber",
  locale: "en",
  isApproved: true,
  emailVerified: true,
  emailVerificationToken: null,
  emailVerificationExpiresAt: null,
  lastSeenAt: new Date("2026-10-04T10:00:00.000Z"),
  createdAt: new Date("2026-01-02T12:00:00.000Z"),
};

const actor = { id: "actor-1", username: "root" };

const sessionRow = (id: string, isActive: boolean): AdminSessionRow => ({
  id,
  userId: USER_ID,
  tokenHash: `hash-${id}`,
  expiresAt: new Date("2026-12-01T00:00:00.000Z"),
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  isActive,
});

const seasonRow: AdminUserSeasonRow = {
  seasonId: "season-1",
  seasonTitle: "Season One",
  seasonSlug: "season-one",
  seasonStatus: "active",
  position: 3,
  balancePoints: 120,
  status: "active",
  streakPass: 2,
  streakDrop: 1,
  rerollsUsed: 4,
  joinedAt: new Date("2026-02-01T12:00:00.000Z"),
};

const rollRow: AdminUserRollRow = {
  rollId: "roll-1",
  status: "passed",
  hoursSpent: "12.5",
  rating: 8,
  rolledAt: new Date("2026-03-01T12:00:00.000Z"),
  resolvedAt: null,
  gameTitle: "Hades",
  gameCover: null,
  seasonTitle: "Season One",
  seasonSlug: "season-one",
};

const auditRow: AdminUserAuditRow = {
  entry: {
    id: "audit-1",
    actorId: USER_ID,
    actionType: "user_blocked",
    targetType: "user",
    targetId: "22222222-2222-4222-8222-222222222222",
    payload: { reason: "spam" },
    createdAt: new Date("2026-03-02T12:00:00.000Z"),
  },
  isByUser: true,
  actorName: "alice",
};

const rerollRequest: UserRerollRequestRow = {
  id: "req-reroll-1",
  seasonPlayerId: "sp-1",
  gameRollId: "roll-1",
  reason: "The board glitched",
  status: "pending",
  adminNote: null,
  requestedAt: new Date("2026-03-03T12:00:00.000Z"),
  resolvedAt: null,
  resolvedBy: null,
  seasonId: "season-1",
  gameTitle: "Hades",
  seasonTitle: "Season One",
};

const completionRequest: UserCompletionRequestRow = {
  id: "req-completion-1",
  seasonPlayerId: "sp-1",
  gameRollId: "roll-1",
  outcome: "passed",
  reason: "Finished the run",
  rating: 9,
  status: "pending",
  adminNote: null,
  requestedAt: new Date("2026-03-04T12:00:00.000Z"),
  resolvedAt: null,
  resolvedBy: null,
  seasonId: "season-1",
  gameTitle: "Hades",
  seasonTitle: "Season One",
};

type PageProps = ComponentProps<typeof UserDetailPage>;

const baseProps: PageProps = {
  user: baseUser,
  actor,
  activeTab: "profile",
  sessions: [],
  audit: [],
  seasons: [],
  rolls: [],
  requests: { rerolls: [], completions: [] },
  activityDays: [],
};

function renderPage(overrides: Partial<PageProps> = {}) {
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>
        <UserDetailPage {...baseProps} {...overrides} />
      </ToastProvider>
    </I18nProvider>,
  );
  return utils;
}

const field = (container: HTMLElement, name: string) =>
  container.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

type MockFn = { mock: { calls: unknown[][] } };

/** FormData for a `useActionState` action: called as (prevState, formData). */
const fdOfStateAction = (mock: MockFn, call = 0): FormData => mock.mock.calls[call]![1] as FormData;

/** FormData for a plain `<form action>` action: called as (formData). */
const fdOfFormAction = (mock: MockFn, call = 0): FormData => mock.mock.calls[call]![0] as FormData;

describe("UserDetailPage", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.updateUserAction.mockResolvedValue({ ok: "Saved" });
    mocks.approveRerollAction.mockResolvedValue({ ok: "Approved" });
    mocks.rejectRerollAction.mockResolvedValue({ ok: "Rejected" });
    mocks.approveCompletionAction.mockResolvedValue({ ok: "Approved" });
    mocks.rejectCompletionAction.mockResolvedValue({ ok: "Rejected" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(cleanup);

  it("renders the identity header, role badge and presence state", () => {
    const { container } = renderPage();
    const header = within(container.querySelector("section") as HTMLElement);

    expect(header.getByRole("heading", { level: 1 }).textContent).toBe("Alice Liddell");
    expect(header.getByText("@alice · alice@example.com").textContent).toBe("@alice · alice@example.com");
    expect(header.getByText(u.roles.player).textContent).toBe("Player");
    expect(header.getByText(u.activeUser).textContent).toBe("active");
    expect(
      header.getByText(
        format(u.memberSince, {
          date: new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(baseUser.createdAt),
        }),
      ).textContent,
    ).toBeTruthy();
    expect(header.queryByText(u.blocked)).toBeNull();
  });

  it("marks the actor's own account with the 'you' badge and a blocked account with the blocked chip", () => {
    renderPage({ actor: { id: USER_ID, username: "alice" } });
    expect(screen.getByText(u.you).textContent).toBe("you");

    cleanup();
    renderPage({ user: { ...baseUser, isBlocked: true } });
    expect(screen.getByText(u.blocked).textContent).toBe("blocked");
    expect(screen.queryByText(u.activeUser)).toBeNull();
  });

  it("flags synthetic bot accounts with the bot badge", () => {
    renderPage({ user: { ...baseUser, username: "bot_deadbeef_2", displayName: null } });

    expect(screen.getByText(t.core.common.bot).textContent).toBe("Bot");
    expect(screen.getByText("@bot_deadbeef_2 · alice@example.com").textContent).toBeTruthy();
  });

  it("keeps the URL tab param in sync on tab click and ignores the active tab", () => {
    renderPage({ activeTab: "profile" });

    fireEvent.click(screen.getByRole("button", { name: u.tabData }));
    expect(mocks.push).toHaveBeenCalledWith("/admin/users/u1?tab=data", { scroll: false });

    fireEvent.click(screen.getByRole("button", { name: u.tabProfile }));
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("formats the member-since date with the user's own locale", () => {
    renderPage({ user: { ...baseUser, locale: "de-DE" } });

    const expected = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(baseUser.createdAt);
    expect(screen.getByText(format(u.memberSince, { date: expected })).textContent).toBeTruthy();
  });

  it("prefills the profile form from the user and submits the payload to updateUserAction", async () => {
    const { container } = renderPage();
    const data = (c: HTMLElement) => ({
      displayName: field(c, "displayName") as HTMLInputElement,
      username: field(c, "username") as HTMLInputElement,
      email: field(c, "email") as HTMLInputElement,
      role: field(c, "role") as HTMLSelectElement,
    });
    const before = data(container);
    expect(before.displayName.value).toBe("Alice Liddell");
    expect(before.username.value).toBe("alice");
    expect(before.email.value).toBe("alice@example.com");
    expect(before.role.value).toBe("player");

    fireEvent.change(before.displayName, { target: { value: "Alice A." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.save }));
    });

    await waitFor(() => expect(mocks.updateUserAction).toHaveBeenCalledTimes(1));
    const fd = fdOfStateAction(mocks.updateUserAction);
    expect(fd.get("userId")).toBe(USER_ID);
    expect(fd.get("displayName")).toBe("Alice A.");
    expect(fd.get("username")).toBe("alice");
    expect(fd.get("role")).toBe("player");
    // The form shell reports success as a toast (state.ok).
    expect((await screen.findByText("Saved")).textContent).toBe("Saved");
  });

  it("shows the action error from the form shell to the admin", async () => {
    mocks.updateUserAction.mockResolvedValue({ error: "Username already taken" });
    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.save }));
    });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Username already taken"));
  });

  it("disables the submit button while the profile action is in flight", async () => {
    let settle: (value: { ok: string }) => void = () => {};
    mocks.updateUserAction.mockImplementation(
      () => new Promise<{ ok: string }>((resolve) => { settle = resolve; }),
    );
    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.save }));
    });

    const pending = screen.getByRole("button", { name: "..." }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);

    await act(async () => settle({ ok: "Saved" }));
    expect((screen.getByRole("button", { name: t.core.common.save }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks self-service block and delete for the actor's own account", () => {
    renderPage({ actor: { id: USER_ID, username: "alice" } });

    expect((screen.getByRole("button", { name: u.blockButton }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: u.deleteButton }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(u.cannotBlockSelf).textContent).toBe(u.cannotBlockSelf);
    expect(screen.getByText(u.cannotDeleteSelf).textContent).toBe(u.cannotDeleteSelf);
  });

  it("asks for confirmation and blocks an active user with the inverted flag", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: u.blockButton }));
    expect(screen.getByText(format(u.blockConfirm, { user: "alice" })).textContent).toBe(
      "Block alice? They will lose access immediately.",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    });

    await waitFor(() => expect(mocks.blockUserAction).toHaveBeenCalledTimes(1));
    const fd = fdOfFormAction(mocks.blockUserAction);
    expect(fd.get("userId")).toBe(USER_ID);
    expect(fd.get("blocked")).toBe("true");
  });

  it("unblocks an already blocked user", async () => {
    renderPage({ user: { ...baseUser, isBlocked: true } });

    expect(screen.getByText(u.blockRestore).textContent).toBe(u.blockRestore);
    fireEvent.click(screen.getByRole("button", { name: u.unblockButton }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    });

    await waitFor(() => expect(mocks.blockUserAction).toHaveBeenCalledTimes(1));
    expect(fdOfFormAction(mocks.blockUserAction).get("blocked")).toBe("false");
  });

  it("deletes the user after confirmation", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: u.deleteButton }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    });

    await waitFor(() => expect(mocks.deleteUserAction).toHaveBeenCalledTimes(1));
    expect(fdOfFormAction(mocks.deleteUserAction).get("userId")).toBe(baseUser.id);
  });

  it("renders the account-data tab, including the pending email verification state", () => {
    renderPage({
      user: { ...baseUser, emailVerified: false, emailVerificationToken: "verify-token", bio: "Hello", twitchLogin: "alice_tv" },
      activeTab: "data",
    });

    expect(screen.getByText(u.dataHeading).textContent).toBe("Account data");
    expect(screen.getByText(u.data.verificationPending).textContent).toBe("Verification pending");
    expect(screen.getByText("@alice_tv").textContent).toBe("@alice_tv");
    expect(screen.getByText("Hello").textContent).toBe("Hello");
    expect((screen.getByRole("button", { name: u.data.verifyEmail }) as HTMLButtonElement).type).toBe("submit");
  });

  it("submits a manual email verification for the user", async () => {
    renderPage({ user: { ...baseUser, emailVerified: false }, activeTab: "data" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: u.data.verifyEmail }));
    });

    await waitFor(() => expect(mocks.verifyEmailAction).toHaveBeenCalledTimes(1));
    expect(fdOfFormAction(mocks.verifyEmailAction).get("userId")).toBe(USER_ID);
  });

  it("copies the full account id to the clipboard from the data tab", async () => {
    renderPage({ activeTab: "data" });

    await act(async () => {
      fireEvent.click(screen.getByTitle(USER_ID));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByTitle(USER_ID).querySelector("svg.text-military")).not.toBeNull();
  });

  it("renders the sessions tab with active/expired badges and the empty state", () => {
    const first = renderPage({
      sessions: [sessionRow("aaaaaaa1-0000-4000-8000-000000000001", true), sessionRow("bbbbbbb2-0000-4000-8000-000000000002", false)],
      activeTab: "sessions",
    });
    const panel = within(first.container.querySelectorAll("section")[1] as HTMLElement);

    expect(panel.getByText("[2]").textContent).toBe("[2]");
    expect(panel.getByText(u.sessions.activeBadge).textContent).toBe("active");
    expect(panel.getByText(u.sessions.expiredBadge).textContent).toBe("expired");
    expect(panel.getByText("aaaaaaa1").textContent).toBe("aaaaaaa1");

    cleanup();
    renderPage({ sessions: [], activeTab: "sessions" });
    expect(screen.getByText(u.sessions.empty).textContent).toBe(u.sessions.empty);
    expect(screen.queryByRole("button", { name: u.sessions.revokeAll })).toBeNull();
  });

  it("revokes a single session with its id", async () => {
    const target = sessionRow("aaaaaaa1-0000-4000-8000-000000000001", true);
    renderPage({ sessions: [target], activeTab: "sessions" });

    fireEvent.click(screen.getByRole("button", { name: u.sessions.revoke }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    });

    await waitFor(() => expect(mocks.revokeSessionAction).toHaveBeenCalledTimes(1));
    const fd = fdOfFormAction(mocks.revokeSessionAction);
    expect(fd.get("userId")).toBe(USER_ID);
    expect(fd.get("sessionId")).toBe(target.id);
  });

  it("revokes every session from the toolbar", async () => {
    renderPage({ sessions: [sessionRow("aaaaaaa1-0000-4000-8000-000000000001", true)], activeTab: "sessions" });

    fireEvent.click(screen.getByRole("button", { name: u.sessions.revokeAll }));
    expect(screen.getByText(format(u.sessions.revokeAllConfirm, { user: "alice" })).textContent).toBe(
      "Revoke ALL sessions for alice? Every device will be logged out.",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    });

    await waitFor(() => expect(mocks.revokeAllSessionsAction).toHaveBeenCalledTimes(1));
    expect(fdOfFormAction(mocks.revokeAllSessionsAction).get("userId")).toBe(USER_ID);
  });

  it("renders the audit trail with the as-actor marker and the empty state", () => {
    renderPage({ audit: [auditRow], activeTab: "activity" });

    expect(screen.getByText("user_blocked").textContent).toBe("user_blocked");
    expect(screen.getByText(t.admin.users.activity.byUser).textContent).toBe("as actor");
    expect(screen.getByText("@alice").textContent).toBe("@alice");

    cleanup();
    renderPage({ audit: [], activeTab: "activity" });
    expect(screen.getByText(t.admin.users.activity.empty).textContent).toBe(t.admin.users.activity.empty);
  });

  it("marks audit entries where the user was the target", () => {
    const asTarget: AdminUserAuditRow = {
      ...auditRow,
      isByUser: false,
      actorName: "root",
      entry: { ...auditRow.entry, id: "audit-2", actorId: actor.id, actionType: "user_blocked", targetId: USER_ID },
    };
    renderPage({ audit: [asTarget], activeTab: "activity" });

    expect(screen.getByText(t.admin.users.activity.onUser).textContent).toBe("as target");
    expect(screen.queryByText(t.admin.users.activity.byUser)).toBeNull();
  });

  it("renders season participation and rolls with their derived labels", () => {
    renderPage({ seasons: [seasonRow], rolls: [rollRow], activeTab: "gameplay" });

    expect(screen.getAllByText("Season One").length).toBe(2);
    expect(screen.getByText("#3").textContent).toBe("#3");
    expect(screen.getByText("120").textContent).toBe("120");
    expect(screen.getByText(t.core.seasonStatuses.active).textContent).toBe("Running");
    expect(screen.getByText(t.core.playerStatuses.active).textContent).toBe("In game");

    expect(screen.getByText("Hades").textContent).toBe("Hades");
    expect(screen.getByText(t.profile.rollStats[rollRow.status]).textContent).toBe("Passed");
    expect(screen.getByText(format(t.admin.users.gameplay.hours, { hours: "12.5" })).textContent).toBe("≈ 12.5 h");
    expect(screen.getByText("8/10").textContent).toBe("8/10");
  });

  it("shows the gameplay empty states when there is no participation", () => {
    renderPage({ activeTab: "gameplay" });

    expect(screen.getByText(t.admin.users.gameplay.seasonsEmpty).textContent).toBe(t.admin.users.gameplay.seasonsEmpty);
    expect(screen.getByText(t.admin.users.gameplay.rollsEmpty).textContent).toBe(t.admin.users.gameplay.rollsEmpty);
  });

  it("approves a pending reroll with the request and user ids", async () => {
    renderPage({ requests: { rerolls: [rerollRequest], completions: [] }, activeTab: "moderation" });

    expect(screen.getByText("The board glitched").textContent).toBe("The board glitched");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.admin.moderation.approve }));
    });

    await waitFor(() => expect(mocks.approveRerollAction).toHaveBeenCalledTimes(1));
    const fd = fdOfStateAction(mocks.approveRerollAction);
    expect(fd.get("requestId")).toBe(rerollRequest.id);
    expect(fd.get("userId")).toBe(USER_ID);
  });

  it("rejects a pending reroll with the admin note", async () => {
    renderPage({ requests: { rerolls: [rerollRequest], completions: [] }, activeTab: "moderation" });

    const note = screen.getByLabelText(t.core.common.reason) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Not enough detail" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.admin.moderation.reject }));
    });

    await waitFor(() => expect(mocks.rejectRerollAction).toHaveBeenCalledTimes(1));
    const fd = fdOfStateAction(mocks.rejectRerollAction);
    expect(fd.get("requestId")).toBe(rerollRequest.id);
    expect(fd.get("userId")).toBe(USER_ID);
    expect(fd.get("adminNote")).toBe("Not enough detail");
  });

  it("approves a pending completion and labels the outcome", async () => {
    renderPage({ requests: { rerolls: [], completions: [completionRequest] }, activeTab: "moderation" });

    expect(screen.getByText(t.admin.completions.outcomePassed).textContent).toBe("Passed");
    expect(screen.getByText("9/10").textContent).toBe("9/10");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.admin.completions.approve }));
    });

    await waitFor(() => expect(mocks.approveCompletionAction).toHaveBeenCalledTimes(1));
    const fd = fdOfStateAction(mocks.approveCompletionAction);
    expect(fd.get("requestId")).toBe(completionRequest.id);
    expect(fd.get("userId")).toBe(USER_ID);
  });

  it("shows the resolution note for already-resolved requests", () => {
    const resolved: UserRerollRequestRow = {
      ...rerollRequest,
      status: "approved",
      adminNote: "Handled offline",
      resolvedAt: new Date("2026-03-05T12:00:00.000Z"),
    };
    renderPage({ requests: { rerolls: [resolved], completions: [] }, activeTab: "moderation" });

    expect(screen.getByText(t.admin.moderation.approved).textContent).toBe("Approved");
    expect(screen.getByText(/Handled offline/).textContent).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.admin.moderation.approve })).toBeNull();
  });

  it("shows the moderation empty states", () => {
    renderPage({ activeTab: "moderation" });

    expect(screen.getByText(u.moderation.emptyRerolls).textContent).toBe(u.moderation.emptyRerolls);
    expect(screen.getByText(u.moderation.emptyCompletions).textContent).toBe(u.moderation.emptyCompletions);
  });

  it("counts sessions, seasons and rolls in the header stats", () => {
    const { container } = renderPage({
      sessions: [sessionRow("s1", true), sessionRow("s2", false)],
      seasons: [seasonRow],
      rolls: [rollRow],
    });
    const stats = within(container.querySelector(".grid.shrink-0") as HTMLElement);

    expect(stats.getByText(u.statSessions).textContent).toBe("Sessions");
    expect(stats.getByText(`1 ${u.sessions.activeBadge}`).textContent).toBe("1 active");
    expect(stats.getByText("2").textContent).toBe("2");
  });
});

/** Sanity: the exported tab union still contains every rendered tab. */
describe("UserDetailPage tab union", () => {
  it("covers the six tabs with matching labels", () => {
    const tabs: UserTab[] = ["profile", "data", "sessions", "activity", "gameplay", "moderation"];
    renderPage({ activeTab: "profile" });
    for (const tab of tabs) {
      expect(screen.getByRole("button", { name: u[`tab${tab[0]!.toUpperCase()}${tab.slice(1)}` as keyof typeof u] as string })).toBeTruthy();
    }
  });
});
