// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { AdminSessionRow } from "@/lib/modules/player/service/admin";

import { SettingsSessions } from "./SettingsSessions";

const t = getDictionary("en");
const s = t.settings.sessions;

const actions = vi.hoisted(() => ({
  revokeOwnSessionAction: vi.fn(),
  revokeOtherSessionsAction: vi.fn(),
}));

vi.mock("@/lib/modules/player/actions", () => actions);

function session(id: string, isActive: boolean, createdAt: string, expiresAt: string): AdminSessionRow {
  return {
    id,
    userId: "user-1",
    tokenHash: `hash-${id}`,
    createdAt: new Date(createdAt),
    expiresAt: new Date(expiresAt),
    isActive,
  };
}

const locale = "en-US";
const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

function renderSessions(
  sessions: AdminSessionRow[],
  currentSessionId: string | null = null,
) {
  return render(
    <I18nProvider locale="en" t={t}>
      <SettingsSessions sessions={sessions} currentSessionId={currentSessionId} locale={locale} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  actions.revokeOwnSessionAction.mockReset();
  actions.revokeOwnSessionAction.mockResolvedValue(undefined);
  actions.revokeOtherSessionsAction.mockReset();
  actions.revokeOtherSessionsAction.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("SettingsSessions", () => {
  it("shows the empty state when there are no sessions", () => {
    renderSessions([]);
    expect(screen.getByText(s.empty)).toBeTruthy();
    expect(screen.queryByRole("button", { name: s.revokeOthers })).toBeNull();
  });

  it("labels the current, active and expired sessions with their dates", () => {
    const rows = [
      session("current-1", true, "2026-01-02T10:00:00Z", "2026-02-01T10:00:00Z"),
      session("other-2", false, "2025-12-01T10:00:00Z", "2025-12-31T10:00:00Z"),
    ];
    renderSessions(rows, "current-1");
    expect(screen.getByText(s.currentBadge)).toBeTruthy();
    expect(screen.getByText(s.expiredBadge)).toBeTruthy();
    expect(screen.getByText(`ID ${"current-1".slice(0, 8)}…`)).toBeTruthy();
    expect(screen.getByText(dateFmt.format(rows[0]!.createdAt))).toBeTruthy();
    expect(screen.getByText(dateFmt.format(rows[1]!.expiresAt))).toBeTruthy();
    expect(screen.getByText(`1 ${s.activeBadge} · 1 ${s.expiredBadge}`)).toBeTruthy();
  });

  it("offers a revoke-all-others action only when others exist", () => {
    const { unmount } = renderSessions([
      session("a", true, "2026-01-02T10:00:00Z", "2026-02-01T10:00:00Z"),
      session("b", true, "2026-01-03T10:00:00Z", "2026-02-02T10:00:00Z"),
    ], "a");
    expect(screen.getByRole("button", { name: s.revokeOthers })).toBeTruthy();
    unmount();

    renderSessions([session("a", true, "2026-01-02T10:00:00Z", "2026-02-01T10:00:00Z")], "a");
    expect(screen.queryByRole("button", { name: s.revokeOthers })).toBeNull();
  });

  it("submits the session id through the row form after confirmation", async () => {
    renderSessions([
      session("aaaa1111", true, "2026-01-02T10:00:00Z", "2026-02-01T10:00:00Z"),
    ], "aaaa1111");
    const hidden = document.querySelector('input[name="sessionId"]') as HTMLInputElement | null;
    expect(hidden?.value).toBe("aaaa1111");

    fireEvent.click(screen.getByRole("button", { name: s.revoke }));
    expect(screen.getByText(s.revokeCurrentConfirm)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    await waitFor(() => expect(actions.revokeOwnSessionAction).toHaveBeenCalledTimes(1));
    const formData = actions.revokeOwnSessionAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("sessionId")).toBe("aaaa1111");
  });

  it("does not revoke when the dialog is cancelled", () => {
    renderSessions([
      session("bbbb2222", false, "2026-01-02T10:00:00Z", "2026-02-01T10:00:00Z"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: s.revoke }));
    expect(screen.getByText(s.revokeConfirm)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.core.common.cancel }));
    expect(actions.revokeOwnSessionAction).not.toHaveBeenCalled();
  });

  it("revokes the other sessions through the header confirmation", async () => {
    renderSessions([
      session("aaaa1111", true, "2026-01-02T10:00:00Z", "2026-02-01T10:00:00Z"),
      session("bbbb2222", true, "2026-01-03T10:00:00Z", "2026-02-02T10:00:00Z"),
    ], "aaaa1111");
    fireEvent.click(screen.getByRole("button", { name: s.revokeOthers }));
    expect(screen.getByText(s.revokeOthersConfirm)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    await waitFor(() =>
      expect(actions.revokeOtherSessionsAction).toHaveBeenCalledTimes(1),
    );
  });
});
