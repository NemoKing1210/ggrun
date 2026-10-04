// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import RollCard, {
  type GameSummary,
  type OpenRollView,
  type PendingCompletionView,
  type PendingRerollView,
} from "./RollCard";

const t = getDictionary("en");
const d = t.core.dashboard;

const actions = vi.hoisted(() => ({
  roll: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/lib/modules/player/actions/game", () => ({
  rollAction: actions.roll,
  resolveAction: actions.resolve,
}));

vi.mock("@/components/ui/toast", () => ({
  useActionToast: () => undefined,
}));

vi.mock("@/components/dice/Dice3D", () => ({
  DiceCube: ({ value }: { value: number }) => <span data-dice>{value}</span>,
}));

vi.mock("@/components/game/WheelOverlay", () => ({
  WheelOverlay: () => null,
}));

const game = (over: Partial<GameSummary> = {}): GameSummary => ({
  title: "Doom",
  platform: "PC",
  coverUrl: "/doom.png",
  genres: [],
  tags: [],
  metacritic: null,
  rating: null,
  releasedAt: null,
  esrb: null,
  description: null,
  playtimeHours: null,
  stores: null,
  website: null,
  externalSource: null,
  ...over,
});

const openRoll = (over: Partial<OpenRollView> = {}): OpenRollView => ({
  id: "r1",
  game: game(),
  rolledAt: new Date().toISOString(),
  ...over,
});

function renderCard(over: {
  openRoll?: OpenRollView | null;
  pendingReroll?: PendingRerollView | null;
  pendingCompletion?: PendingCompletionView | null;
  rerollsUsed?: number;
  rerollNeedsApproval?: boolean;
  rerollApproved?: boolean;
  lastDice?: number[] | null;
  catalogGames?: Array<{ title: string; coverUrl: string | null; platform: string | null }>;
} = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <RollCard
        seasonPlayerId="sp1"
        openRoll={over.openRoll ?? null}
        pendingReroll={over.pendingReroll ?? null}
        pendingCompletion={over.pendingCompletion ?? null}
        rerollsUsed={over.rerollsUsed ?? 0}
        rerollNeedsApproval={over.rerollNeedsApproval ?? false}
        rerollApproved={over.rerollApproved ?? false}
        lastDice={over.lastDice ?? null}
        catalogGames={over.catalogGames ?? []}
      />
    </I18nProvider>,
  );
}

const formOf = (el: HTMLElement) => el.closest("form") as HTMLFormElement;

beforeEach(() => {
  actions.roll.mockReset();
  actions.resolve.mockReset();
  actions.roll.mockResolvedValue({});
  actions.resolve.mockResolvedValue({});
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RollCard idle state", () => {
  it("invites a roll with the season player wired into the form", () => {
    const { container } = renderCard();
    expect(screen.getByText("// READY TO ROLL")).toBeTruthy();
    expect(screen.getByText(d.noCurrentGame)).toBeTruthy();
    expect(screen.getByRole("button", { name: d.rollButton })).toBeTruthy();
    const hidden = container.querySelector<HTMLInputElement>('input[name="seasonPlayerId"]');
    expect(hidden?.value).toBe("sp1");
  });

  it("surfaces a failed roll as an alert", async () => {
    actions.roll.mockResolvedValue({ error: "pool empty" });
    renderCard();
    await act(async () => {
      fireEvent.submit(formOf(screen.getByRole("button", { name: d.rollButton })));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("pool empty"));
  });
});

describe("RollCard open roll", () => {
  it("shows the rolled game with its details and the resolve actions", () => {
    renderCard({ openRoll: openRoll({ game: game({ description: "Rip and tear." }) }) });
    expect(screen.getByText("Doom")).toBeTruthy();
    expect(screen.getByText("IN RUN")).toBeTruthy();
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByText("Rip and tear.")).toBeTruthy();
    expect(screen.getByRole("button", { name: d.passedButton })).toBeTruthy();
    expect(screen.getByRole("button", { name: d.dropButton })).toBeTruthy();
    expect(screen.queryByRole("button", { name: d.rollButton })).toBeNull();
  });

  it("falls back to the roll hint when the game has no description", () => {
    renderCard({ openRoll: openRoll() });
    expect(screen.getByText(d.rollHint)).toBeTruthy();
  });

  it("renders a missing catalog entry with a reset action", () => {
    renderCard({ openRoll: openRoll({ game: null }) });
    expect(screen.getByText("NO ENTRY")).toBeTruthy();
    expect(screen.getByText(d.missingCatalogEntry)).toBeTruthy();
    expect(screen.getByRole("button", { name: d.resetRoll })).toBeTruthy();
  });

  it("locks the reroll once the season allowance is spent", () => {
    renderCard({ openRoll: openRoll(), rerollsUsed: 1, rerollApproved: false });
    const reroll = screen.getByRole("button", { name: d.rerollButton }) as HTMLButtonElement;
    expect(reroll.disabled).toBe(true);
    expect(reroll.getAttribute("title")).toBe(d.rerollLockedTitle);
  });

  it("keeps the reroll open when a judge approved it", () => {
    renderCard({ openRoll: openRoll(), rerollsUsed: 1, rerollApproved: true });
    const reroll = screen.getByRole("button", { name: d.rerollApprovedButton }) as HTMLButtonElement;
    expect(reroll.disabled).toBe(false);
    expect(screen.getByText(d.rerollApprovedBanner)).toBeTruthy();
  });

  it("blocks resolve actions while a reroll waits for moderation", () => {
    renderCard({
      openRoll: openRoll(),
      pendingReroll: { id: "pr1", reason: "bad dice", requestedAt: new Date().toISOString() },
    });
    expect(screen.getByText(`${d.rerollPending} · ${d.awaitingModeration}`)).toBeTruthy();
    expect(screen.getByText("bad dice")).toBeTruthy();
    expect((screen.getByRole("button", { name: d.passedButton }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: d.rerollPending }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows a completion pending banner with outcome and rating", () => {
    renderCard({
      openRoll: openRoll({ game: game({ title: "Quake" }) }),
      pendingCompletion: {
        id: "pc1",
        outcome: "passed",
        reason: "done",
        rating: 9,
        requestedAt: new Date().toISOString(),
      },
    });
    expect(screen.getByText(`${d.completionPendingLabel} · ${d.awaitingModeration}`)).toBeTruthy();
    expect(screen.getByText(format(d.ratingValue, { value: 9 }))).toBeTruthy();
  });

  it("labels a drop-pending banner for the dropped outcome", () => {
    renderCard({
      openRoll: openRoll(),
      pendingCompletion: {
        id: "pc1",
        outcome: "dropped",
        reason: null,
        rating: null,
        requestedAt: new Date().toISOString(),
      },
    });
    expect(screen.getByText(`${d.dropPendingLabel} · ${d.awaitingModeration}`)).toBeTruthy();
  });

  it("shows the previous dice with their total", () => {
    renderCard({ lastDice: [3, 5] });
    expect(screen.getByText(d.lastRoll)).toBeTruthy();
    expect(screen.getByText("3 + 5 = 8")).toBeTruthy();
  });
});

describe("RollCard resolve modals", () => {
  it("submits a pass with comment and rating", async () => {
    renderCard({ openRoll: openRoll() });
    fireEvent.click(screen.getByRole("button", { name: d.passedButton }));
    expect(screen.getByText(d.passModalTitle)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(d.passCommentPlaceholder), {
      target: { value: "loved it" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.ratingPlaceholder), { target: { value: "8" } });
    fireEvent.submit(formOf(screen.getByRole("button", { name: d.submit })));
    await waitFor(() => expect(actions.resolve).toHaveBeenCalledTimes(1));
    const formData = actions.resolve.mock.calls[0][1] as FormData;
    expect(formData.get("outcome")).toBe("passed");
    expect(formData.get("rollId")).toBe("r1");
    expect(formData.get("seasonPlayerId")).toBe("sp1");
    expect(formData.get("comment")).toBe("loved it");
    expect(formData.get("rating")).toBe("8");
  });

  it("submits a drop with a required reason", async () => {
    renderCard({ openRoll: openRoll() });
    fireEvent.click(screen.getByRole("button", { name: d.dropButton }));
    expect(screen.getByText(d.dropModalTitle)).toBeTruthy();
    const reason = screen.getByPlaceholderText(d.dropReasonPlaceholder) as HTMLTextAreaElement;
    expect(reason.required).toBe(true);
    expect(reason.minLength).toBe(5);
    fireEvent.change(reason, { target: { value: "not my thing" } });
    fireEvent.submit(
      formOf(within(screen.getByRole("dialog")).getByRole("button", { name: d.dropButton })),
    );
    await waitFor(() => expect(actions.resolve).toHaveBeenCalledTimes(1));
    const formData = actions.resolve.mock.calls[0][1] as FormData;
    expect(formData.get("outcome")).toBe("dropped");
    expect(formData.get("reason")).toBe("not my thing");
  });

  it("submits a moderated reroll with its reason", async () => {
    renderCard({ openRoll: openRoll(), rerollNeedsApproval: true });
    fireEvent.click(screen.getByRole("button", { name: d.rerollButton }));
    expect(screen.getByText(d.rerollModalTitle)).toBeTruthy();
    const reason = screen.getByPlaceholderText(d.rerollReasonPlaceholder) as HTMLTextAreaElement;
    expect(reason.required).toBe(true);
    fireEvent.change(reason, { target: { value: "wrong genre" } });
    fireEvent.submit(formOf(screen.getByRole("button", { name: d.submit })));
    await waitFor(() => expect(actions.resolve).toHaveBeenCalledTimes(1));
    const formData = actions.resolve.mock.calls[0][1] as FormData;
    expect(formData.get("outcome")).toBe("rerolled");
    expect(formData.get("reason")).toBe("wrong genre");
  });

  it("skips the reason field for an approved reroll", () => {
    renderCard({ openRoll: openRoll(), rerollNeedsApproval: true, rerollApproved: true });
    fireEvent.click(screen.getByRole("button", { name: d.rerollApprovedButton }));
    expect(screen.getByText(d.rerollModalTitleNow)).toBeTruthy();
    expect(screen.queryByPlaceholderText(d.rerollReasonPlaceholder)).toBeNull();
  });

  it("opens game details for the open roll", () => {
    renderCard({ openRoll: openRoll({ game: game({ title: "Quake" }) }) });
    fireEvent.click(screen.getByRole("button", { name: t.core.gameInfo.details }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Quake")).toBeTruthy();
  });
});
