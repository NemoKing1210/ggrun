// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { ChallengesPanel, type ChallengeRow } from "./ChallengesPanel";

const t = getDictionary("en");
const e = t.iee.events;

const actions = vi.hoisted(() => ({ submitProof: vi.fn() }));

vi.mock("@/lib/modules/iee/actions", () => ({
  submitEventProofAction: actions.submitProof,
}));

const challenge = (over: Partial<ChallengeRow> = {}): ChallengeRow => ({
  id: "c1",
  title: "Finish Doom",
  descriptionMd: "Beat the first level.",
  status: "assigned",
  requiresProof: false,
  proof: null,
  adminNote: null,
  dueAt: null,
  reward: {},
  ...over,
});

function renderPanel(over: {
  challenges?: ChallengeRow[];
  itemNames?: Record<string, string>;
  effectNames?: Record<string, string>;
} = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <ChallengesPanel
        challenges={over.challenges ?? []}
        itemNames={over.itemNames ?? {}}
        effectNames={over.effectNames ?? {}}
      />
    </I18nProvider>,
  );
}

const openSubmit = (index = 0) => {
  fireEvent.click(screen.getAllByRole("button", { name: e.submit })[index]);
};

beforeEach(() => {
  actions.submitProof.mockReset();
  actions.submitProof.mockResolvedValue({ ok: "submitted" });
});

afterEach(() => cleanup());

describe("ChallengesPanel list", () => {
  it("shows the empty hint when nothing is assigned", () => {
    renderPanel();
    expect(screen.getByText(e.empty)).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("renders the heading count from the challenge list", () => {
    renderPanel({ challenges: [challenge(), challenge({ id: "c2" })] });
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows title, status badge and no-deadline marker per row", () => {
    renderPanel({ challenges: [challenge({ status: "assigned" })] });
    expect(screen.getByText("Finish Doom")).toBeTruthy();
    expect(screen.getByText(e.status.assigned)).toBeTruthy();
    expect(screen.getByText(e.noDeadline)).toBeTruthy();
  });

  it("formats a due date when one is set", () => {
    renderPanel({ challenges: [challenge({ dueAt: "2026-07-01T10:00:00.000Z" })] });
    expect(screen.getByText(/due/)).toBeTruthy();
    expect(screen.queryByText(e.noDeadline)).toBeNull();
  });

  it("spells out a points-and-item reward", () => {
    renderPanel({
      challenges: [challenge({ reward: { points: 10, itemKey: "lodestone" } })],
      itemNames: { lodestone: "Lodestone" },
    });
    expect(screen.getByText(new RegExp(`${e.reward}: \\+10 pts · Lodestone`))).toBeTruthy();
  });

  it("falls back to the raw key and to no-reward", () => {
    renderPanel({
      challenges: [
        challenge({ id: "a", reward: { effectKey: "heavy_boots" } }),
        challenge({ id: "b", reward: {} }),
      ],
      effectNames: {},
    });
    expect(screen.getByText(new RegExp(`${e.reward}: heavy_boots`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`${e.reward}: ${e.noReward}`))).toBeTruthy();
  });

  it("renders the judge's note when present", () => {
    renderPanel({ challenges: [challenge({ adminNote: "Nice run" })] });
    expect(screen.getByText(`${e.adminNote}: Nice run`)).toBeTruthy();
  });

  it("offers submit only for still-open challenges", () => {
    renderPanel({
      challenges: [
        challenge({ id: "open", status: "assigned" }),
        challenge({ id: "done", status: "approved" }),
      ],
    });
    expect(screen.getAllByRole("button", { name: e.submit })).toHaveLength(1);
  });
});

describe("ChallengesPanel proof modal", () => {
  it("opens the modal with the challenge copy", () => {
    renderPanel({ challenges: [challenge({ id: "c9", title: "Beat boss" })] });
    openSubmit();
    expect(screen.getAllByText("Beat boss").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Beat the first level.").length).toBeGreaterThan(0);
  });

  it("carries the challenge id and proof placeholder into the form", () => {
    const { container } = renderPanel({ challenges: [challenge({ id: "c9" })] });
    fireEvent.click(screen.getByRole("button", { name: e.submit }));
    const hidden = container.ownerDocument.querySelector<HTMLInputElement>(
      'input[name="playerEventId"]',
    );
    expect(hidden?.value).toBe("c9");
    expect(screen.getByPlaceholderText(e.proofPlaceholder)).toBeTruthy();
  });

  it("requires a minimum-length proof when the challenge demands one", () => {
    renderPanel({ challenges: [challenge({ requiresProof: true })] });
    openSubmit();
    const textarea = screen.getByPlaceholderText(e.proofPlaceholder) as HTMLTextAreaElement;
    expect(textarea.required).toBe(true);
    expect(textarea.minLength).toBe(5);
  });

  it("leaves the proof optional when proof is not required", () => {
    renderPanel({ challenges: [challenge({ requiresProof: false })] });
    openSubmit();
    const textarea = screen.getByPlaceholderText(e.proofPlaceholder) as HTMLTextAreaElement;
    expect(textarea.required).toBe(false);
    expect(textarea.minLength).toBe(-1);
  });

  it("submits the action with the challenge id and written proof", async () => {
    renderPanel({ challenges: [challenge({ id: "c9" })] });
    openSubmit();
    fireEvent.change(screen.getByPlaceholderText(e.proofPlaceholder), {
      target: { value: "cleared it" },
    });
    fireEvent.submit(screen.getByPlaceholderText(e.proofPlaceholder).closest("form") as HTMLFormElement);
    await waitFor(() => expect(actions.submitProof).toHaveBeenCalledTimes(1));
    const formData = actions.submitProof.mock.calls[0][1] as FormData;
    expect(formData.get("playerEventId")).toBe("c9");
    expect(formData.get("proof")).toBe("cleared it");
  });

  it("closes the modal once the action succeeds", async () => {
    renderPanel({ challenges: [challenge({ id: "c9", title: "Beat boss" })] });
    openSubmit();
    fireEvent.submit(screen.getByPlaceholderText(e.proofPlaceholder).closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.queryByPlaceholderText(e.proofPlaceholder)).toBeNull());
  });

  it("surfaces an action error instead of closing", async () => {
    actions.submitProof.mockResolvedValue({ error: "nope" });
    renderPanel({ challenges: [challenge({ id: "c9", title: "Beat boss" })] });
    openSubmit();
    fireEvent.submit(screen.getByPlaceholderText(e.proofPlaceholder).closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getAllByText("nope").length).toBeGreaterThan(0);
  });

  it("can be cancelled without submitting", () => {
    renderPanel({ challenges: [challenge({ title: "Beat boss" })] });
    openSubmit();
    fireEvent.click(screen.getByRole("button", { name: e.cancel }));
    expect(actions.submitProof).not.toHaveBeenCalled();
  });
});
