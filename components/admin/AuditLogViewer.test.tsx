// @vitest-environment jsdom
/**
 * Audit log viewer: server-driven filters (q/action/target/period pushed as URL
 * params), debounced search, bounded pagination, CSV gating and the detail
 * modal with its structured payload tree. Realtime is stubbed — live rows are
 * covered by the provider tests.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { AdminAuditRow } from "@/lib/infrastructure/events";

import { AuditLogViewer } from "./AuditLogViewer";

const { push, refresh, prefetch } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, prefetch }),
  usePathname: () => "/admin/audit",
}));

vi.mock("@/components/realtime/realtime-provider", () => ({
  useRealtime: () => ({ connected: true }),
  useRealtimeConnects: () => 1,
  useRealtimeEvent: () => {},
}));

const t = getDictionary("en");
const a = t.admin.audit;

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function makeRow(opts: {
  id?: string;
  actorId?: string;
  actionType?: string;
  targetType?: string;
  targetId?: string | null;
  payload?: Record<string, unknown>;
  createdAt?: Date;
  username?: string;
  avatarUrl?: string | null;
  lastSeenAt?: Date | null;
} = {}): AdminAuditRow {
  return {
    entry: {
      id: opts.id ?? "entry-1",
      actorId: opts.actorId ?? ACTOR_ID,
      actionType: opts.actionType ?? "season_created",
      targetType: opts.targetType ?? "season",
      targetId: opts.targetId === undefined ? TARGET_ID : opts.targetId,
      payload: opts.payload ?? {},
      createdAt: opts.createdAt ?? new Date("2026-01-02T03:04:00Z"),
    },
    username: opts.username ?? "alice",
    avatarUrl: opts.avatarUrl === undefined ? null : opts.avatarUrl,
    lastSeenAt: opts.lastSeenAt === undefined ? null : opts.lastSeenAt,
  };
}

const DEFAULTS: ComponentProps<typeof AuditLogViewer> = {
  rows: [],
  total: 0,
  pages: 1,
  page: 1,
  pageSize: 20,
  actionTypes: ["season_created", "user_blocked"],
  targetTypes: ["season", "user"],
  filters: { q: "", action: "", target: "", period: "all" },
  locale: "en" as Locale,
};

function renderViewer(props: Partial<ComponentProps<typeof AuditLogViewer>> = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <AuditLogViewer {...DEFAULTS} {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  prefetch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AuditLogViewer rows", () => {
  it("renders actor, localized action/target labels and the payload summary", () => {
    const { container } = renderViewer({ rows: [makeRow({ payload: { reason: "spam" } })] });
    const table = within(container.querySelector("table") as HTMLElement);

    expect(table.getByText("alice")).toBeTruthy();
    expect(table.getByText(a.actions.season_created)).toBeTruthy();
    expect(table.getByText(a.targets.season)).toBeTruthy();
    expect(table.getByText(`${a.fields.reason}: spam`)).toBeTruthy();
    expect(table.getByRole("button", { name: a.detailsButton })).toBeTruthy();
  });

  it("links the actor to the admin profile only for admins", () => {
    const { container, unmount } = renderViewer({ rows: [makeRow()], isAdmin: true });
    expect(container.querySelector(`a[href="/admin/users/${ACTOR_ID}"]`)).not.toBeNull();

    unmount();
    const plain = renderViewer({ rows: [makeRow()], isAdmin: false });
    expect(plain.container.querySelector(`a[href="/admin/users/${ACTOR_ID}"]`)).toBeNull();
  });

  it("shows the empty state with no filters and noResults once filtered", () => {
    const { unmount } = renderViewer();
    expect(screen.getByText(a.empty)).toBeTruthy();

    unmount();
    renderViewer({ filters: { q: "", action: "season_created", target: "", period: "all" } });
    expect(screen.getByText(a.noResults)).toBeTruthy();
    expect(screen.getAllByText(a.clear).length).toBeGreaterThan(0);
  });
});

describe("AuditLogViewer detail modal", () => {
  it("opens on row click and disables copy-json for an empty payload", () => {
    renderViewer({ rows: [makeRow({ payload: {} })], isAdmin: true });

    const row = screen.getByText("alice").closest("tr");
    fireEvent.click(row as HTMLTableRowElement);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(a.payloadEmpty)).toBeTruthy();
    expect((screen.getByRole("button", { name: a.copyJson }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the payload tree and enables copy-json when a payload exists", () => {
    renderViewer({ rows: [makeRow({ payload: { reason: "spam" } })] });

    fireEvent.click(screen.getByRole("button", { name: a.detailsButton }));

    expect(screen.getByText("Reason")).toBeTruthy();
    expect(screen.getByText('"spam"')).toBeTruthy();
    expect((screen.getByRole("button", { name: a.copyJson }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("AuditLogViewer filters", () => {
  it("pushes the period param from a chip, and omits it for the all chip", () => {
    renderViewer({ rows: [makeRow()] });

    fireEvent.click(screen.getByRole("button", { name: a.periods["7d"] }));
    expect(push).toHaveBeenCalledWith("/admin/audit?period=7d", { scroll: false });

    push.mockClear();
    fireEvent.click(screen.getByRole("button", { name: a.periods.all }));
    expect(push).toHaveBeenCalledWith("/admin/audit", { scroll: false });
  });

  it("pushes the action select value instantly", () => {
    renderViewer({ rows: [makeRow()] });

    const [actionSelect] = screen.getAllByRole("combobox");
    fireEvent.change(actionSelect, { target: { value: "user_blocked" } });

    expect(push).toHaveBeenCalledWith("/admin/audit?action=user_blocked", { scroll: false });
  });

  it("resets every filter to the bare pathname from the clear button", () => {
    renderViewer({
      rows: [makeRow()],
      filters: { q: "", action: "season_created", target: "", period: "all" },
    });

    fireEvent.click(screen.getByRole("button", { name: a.clear }));

    expect(push).toHaveBeenCalledWith("/admin/audit", { scroll: false });
  });

  it("debounces the search box and pushes the trimmed q", async () => {
    vi.useFakeTimers();
    renderViewer({ rows: [makeRow()] });

    const input = screen.getByRole("textbox", { name: a.searchPlaceholder });
    fireEvent.change(input, { target: { value: "  spam  " } });

    expect(push).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(push).toHaveBeenCalledWith("/admin/audit?q=spam", { scroll: false });
  });
});

describe("AuditLogViewer pagination and export", () => {
  it("disables the prev button on page one and pushes the next page", () => {
    renderViewer({ rows: [makeRow()], total: 40, pages: 3, page: 1 });

    const prev = screen.getByRole("button", { name: a.prevPage }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: a.nextPage }));
    expect(push).toHaveBeenCalledWith("/admin/audit?page=2", { scroll: false });
  });

  it("disables the next button on the last page and pushes the previous page", () => {
    renderViewer({ rows: [makeRow()], total: 40, pages: 3, page: 3 });

    const next = screen.getByRole("button", { name: a.nextPage }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: a.prevPage }));
    expect(push).toHaveBeenCalledWith("/admin/audit?page=2", { scroll: false });
  });

  it("disables CSV export when there are no visible rows", () => {
    const { unmount } = renderViewer();
    expect((screen.getByRole("button", { name: a.exportCsv }) as HTMLButtonElement).disabled).toBe(true);

    unmount();
    renderViewer({ rows: [makeRow()], total: 1 });
    expect((screen.getByRole("button", { name: a.exportCsv }) as HTMLButtonElement).disabled).toBe(false);
  });
});
