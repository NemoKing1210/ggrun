// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { ModerationBulkBar } from "./ModerationBulkBar";

const t = getDictionary("en");

const labels = {
  barLabel: "Bulk actions",
  approveAll: "Approve all",
  rejectAll: "Reject all",
  rejectTitle: "Reject {count}",
  confirmApprove: "Approve {count} submissions?",
  notePlaceholder: "Shared reason",
  cancelLabel: "Cancel",
  tooShortError: "Too short",
};

const approveAction = vi.fn(async () => {});
const rejectAction = vi.fn(async () => {});

function renderBar(ids: string[]) {
  return render(
    <I18nProvider locale="en" t={t}>
      <ModerationBulkBar ids={ids} approveAction={approveAction} rejectAction={rejectAction} labels={labels} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  approveAction.mockClear();
  rejectAction.mockClear();
});

describe("ModerationBulkBar", () => {
  it("renders nothing when there is no selection", () => {
    const { container } = renderBar([]);
    expect(container.firstChild).toBeNull();
  });

  it("posts the joined ids for both verdicts", () => {
    const { container } = renderBar(["a", "b", "c"]);
    const hidden = Array.from(container.querySelectorAll('input[name="ids"]')).map(
      (el) => (el as HTMLInputElement).value,
    );
    expect(hidden).toEqual(["a,b,c", "a,b,c"]);
  });

  it("shows the count on the bar and on each action", () => {
    renderBar(["a", "b"]);
    expect(screen.getByText("2").textContent).toBe("2");
    expect(screen.getByRole("button", { name: /Approve all/ }).textContent).toContain("×2");
    expect(screen.getByRole("button", { name: /Reject all/ }).textContent).toContain("×2");
  });

  it("asks for confirmation with the interpolated count before approving", async () => {
    renderBar(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: /Approve all/ }));
    expect(await screen.findByText("Approve 2 submissions?")).toBeTruthy();
  });

  it("opens the shared-reason modal for the reject-all path", async () => {
    renderBar(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: /Reject all/ }));
    expect(await screen.findByText("Reject 2")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
