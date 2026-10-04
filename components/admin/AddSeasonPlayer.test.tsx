// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/dictionaries";
import { ToastProvider } from "@/components/ui/toast";
import { addPlayerToSeasonAction } from "@/lib/modules/season/actions/players";

import { AddSeasonPlayer } from "./AddSeasonPlayer";

vi.mock("@/lib/modules/season/actions/players", () => ({
  addPlayerToSeasonAction: vi.fn(),
}));

const t = getDictionary("en");
const p = t.admin.players;
const addPlayer = vi.mocked(addPlayerToSeasonAction);

const candidates = [
  { id: "u1", username: "alice", displayName: "Alice A." },
  { id: "u2", username: "bob", displayName: null },
  { id: "u3", username: "carol", displayName: "Carol C." },
];

function setup() {
  const utils = render(
    <ToastProvider>
      <AddSeasonPlayer seasonId="season-1" candidates={candidates} t={t} />
    </ToastProvider>,
  );
  return {
    ...utils,
    select: utils.container.querySelector('select[name="userId"]') as HTMLSelectElement,
    search: screen.getByPlaceholderText(p.filterUsersPlaceholder) as HTMLInputElement,
  };
}

describe("AddSeasonPlayer", () => {
  beforeEach(() => {
    addPlayer.mockReset();
    addPlayer.mockResolvedValue({});
  });

  afterEach(cleanup);

  it("lists every candidate and counts them as available", () => {
    const { select } = setup();
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toEqual([
      p.pickUserOption,
      "Alice A. (@alice)",
      "bob (@bob)",
      "Carol C. (@carol)",
    ]);
    expect(screen.getByText(/3 users available to add/).textContent).toContain(
      "3 users available to add",
    );
  });

  it("narrows the picker by username or display name and updates the count", () => {
    const { select, search } = setup();
    fireEvent.change(search, { target: { value: "car" } });
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "u3"]);
    expect(screen.getByText(/1 users available to add/).textContent).toContain(
      "1 users available to add",
    );
    // matches the username only (bob has no display name)
    fireEvent.change(search, { target: { value: "bob" } });
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "u2"]);
  });

  it("submits the season id and the picked user to the action", async () => {
    const { select } = setup();
    fireEvent.change(select, { target: { value: "u3" } });
    fireEvent.submit(select.closest("form") as HTMLFormElement);

    expect(addPlayer).toHaveBeenCalledTimes(1);
    const [, formData] = addPlayer.mock.calls[0];
    expect(formData.get("seasonId")).toBe("season-1");
    expect(formData.get("userId")).toBe("u3");
  });

  it("renders the server error inline without clobbering the picker", async () => {
    addPlayer.mockResolvedValue({ error: "User already in the season" });
    const { select } = setup();
    fireEvent.change(select, { target: { value: "u1" } });
    fireEvent.submit(select.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("User already in the season");
    expect(select.options.length).toBe(candidates.length + 1);
  });

  it("confirms a successful add and disables the button while pending", async () => {
    let resolveAction: (value: { ok?: string }) => void = () => {};
    addPlayer.mockImplementation(
      () => new Promise<{ ok?: string }>((resolve) => (resolveAction = resolve)),
    );
    const { select } = setup();
    fireEvent.change(select, { target: { value: "u2" } });
    const submit = screen.getByRole("button", { name: t.core.common.add }) as HTMLButtonElement;
    fireEvent.submit(select.closest("form") as HTMLFormElement);
    await waitFor(() => expect(submit.disabled).toBe(true));

    resolveAction({ ok: "Player added" });
    expect((await screen.findByText("Player added")).textContent).toBe("Player added");
    await waitFor(() => expect(submit.disabled).toBe(false));
  });
});
