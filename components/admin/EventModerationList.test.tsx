// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { approveEventAction, rejectEventAction } from "@/lib/modules/iee/actions";

import { EventModerationList, type EventSubmission } from "./EventModerationList";

vi.mock("@/lib/modules/iee/actions", () => ({
  approveEventAction: vi.fn(),
  rejectEventAction: vi.fn(),
}));

const t = getDictionary("en");
const m = t.iee.events.moderation;

const approve = vi.mocked(approveEventAction);
const reject = vi.mocked(rejectEventAction);

function submission(over: Partial<EventSubmission> = {}): EventSubmission {
  return {
    id: "row-1",
    title: "Screenshot of the day",
    descriptionMd: "Post a screenshot of your best run.",
    proof: "https://example.test/proof.png",
    requiresProof: true,
    submittedAt: null,
    username: "neo",
    reward: { points: 5 },
    ...over,
  };
}

function renderList(
  submissions: EventSubmission[],
  itemNames: Record<string, string> = {},
  effectNames: Record<string, string> = {},
) {
  return render(
    <I18nProvider locale="en" t={t}>
      <EventModerationList
        submissions={submissions}
        itemNames={itemNames}
        effectNames={effectNames}
      />
    </I18nProvider>,
  );
}

describe("EventModerationList", () => {
  beforeEach(() => {
    approve.mockReset();
    reject.mockReset();
    approve.mockResolvedValue({});
    reject.mockResolvedValue({});
  });

  afterEach(cleanup);

  it("renders the empty label when nothing is waiting", () => {
    renderList([]);
    const empty = screen.getByText(m.empty);
    expect(empty.textContent).toBe(m.empty);
  });

  it("renders title, username, proof fallback, joined reward and the no-reward label", () => {
    renderList(
      [
        submission({
          id: "a",
          title: "Alpha challenge",
          username: "neo",
          proof: null,
          reward: { points: 5, itemKey: "blade", effectKey: "haste" },
        }),
        submission({
          id: "b",
          title: "Beta challenge",
          username: "trinity",
          proof: "https://example.test/beta.png",
          reward: {},
        }),
      ],
      { blade: "Blade" },
      {},
    );

    expect(screen.getByText("Alpha challenge")).toBeTruthy();
    expect(screen.getByText("neo")).toBeTruthy();
    expect(screen.getByText("trinity")).toBeTruthy();

    // proof fallback for the row with none, real proof for the row with one
    expect(screen.getByText(m.noProof).textContent).toBe(m.noProof);
    expect(screen.getByText("https://example.test/beta.png")).toBeTruthy();

    // points + resolved item label + raw effect key fallback, joined by " · "
    const reward = [format(t.iee.events.rewardPoints, { count: "5" }), "Blade", "haste"].join(
      " · ",
    );
    expect(screen.getByText(`${m.willGrant} ${reward}`)).toBeTruthy();
    expect(screen.getByText(`${m.willGrant} ${t.iee.events.noReward}`)).toBeTruthy();
  });

  it("wires each row's approve/reject forms to the row id and names the note input", () => {
    const { container } = renderList([submission({ id: "row-9" })]);

    const approveForm = container.querySelector("form#approve-row-9") as HTMLFormElement;
    expect(approveForm).toBeTruthy();
    const approveId = approveForm.querySelector<HTMLInputElement>('input[name="playerEventId"]');
    expect(approveId?.value).toBe("row-9");

    const approveButton = screen.getByRole("button", { name: m.approve });
    expect(approveButton.closest("form")).toBe(approveForm);

    const rejectForm = screen.getByRole("button", { name: m.reject }).closest(
      "form",
    ) as HTMLFormElement;
    expect(rejectForm).toBeTruthy();
    expect(rejectForm.querySelector<HTMLInputElement>('input[name="playerEventId"]')?.value).toBe(
      "row-9",
    );

    // The note input lives outside the form but is associated through `form=`.
    const note = container.querySelector<HTMLInputElement>('input[name="adminNote"]');
    expect(note?.getAttribute("form")).toBe("approve-row-9");
  });

  it("shows the approve error returned by the action and sends the row id", async () => {
    approve.mockResolvedValue({ error: "Already judged by another admin." });
    const { container } = renderList([submission({ id: "row-9" })]);

    const note = container.querySelector<HTMLInputElement>('input[name="adminNote"]');
    expect(note).toBeTruthy();
    fireEvent.change(note as HTMLInputElement, { target: { value: "Looks good." } });

    fireEvent.submit(container.querySelector("form#approve-row-9") as HTMLFormElement);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Already judged by another admin."),
    );

    expect(approve).toHaveBeenCalledTimes(1);
    const formData = approve.mock.calls[0][1];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("playerEventId")).toBe("row-9");
    expect(formData.get("adminNote")).toBe("Looks good.");
    // the other verdict action was not touched
    expect(reject).not.toHaveBeenCalled();
  });

  it("shows the reject error returned by the reject action", async () => {
    reject.mockResolvedValue({ error: "Proof is not verifiable." });
    renderList([submission({ id: "row-3" })]);

    const rejectForm = screen.getByRole("button", { name: m.reject }).closest(
      "form",
    ) as HTMLFormElement;
    expect(rejectForm).toBeTruthy();
    fireEvent.submit(rejectForm);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Proof is not verifiable."),
    );

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject.mock.calls[0][1].get("playerEventId")).toBe("row-3");
    expect(approve).not.toHaveBeenCalled();
  });
});
