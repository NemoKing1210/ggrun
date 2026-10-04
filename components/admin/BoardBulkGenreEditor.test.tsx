// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { GENRES } from "@/lib/modules/catalog/pool/constants";

import { BoardBulkGenreEditor } from "./BoardBulkGenreEditor";

const mocks = vi.hoisted(() => ({
  bulkSetCellGenresAction: vi.fn(),
  randomizeBoardGenresAction: vi.fn(),
}));

vi.mock("@/lib/modules/season/actions/board", () => ({
  bulkSetCellGenresAction: mocks.bulkSetCellGenresAction,
  randomizeBoardGenresAction: mocks.randomizeBoardGenresAction,
}));
vi.mock("@/components/ui/toast", () => ({ useActionToast: () => {} }));

const t = getDictionary("en");

function setup() {
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <BoardBulkGenreEditor boardId="b1" seasonId="s1" boardSize={24} />
    </I18nProvider>,
  );
  const positions = utils.container.querySelector('input[name="positionsInput"], input[placeholder="0-5, 10, 12-15"]') as HTMLInputElement;
  return { ...utils, positions };
}

const submit = (name: string) => {
  const button = screen.getByRole("button", { name });
  fireEvent.click(button);
};

beforeEach(() => {
  mocks.bulkSetCellGenresAction.mockReset().mockResolvedValue({});
  mocks.randomizeBoardGenresAction.mockReset().mockResolvedValue({});
});

afterEach(cleanup);

describe("BoardBulkGenreEditor", () => {
  it("submits board scope, genres, positions and apply-to-all together", async () => {
    const { positions } = setup();
    fireEvent.click(screen.getByRole("button", { name: GENRES[0].label }));
    fireEvent.change(positions, { target: { value: "0-3" } });
    fireEvent.click(screen.getByRole("checkbox"));

    submit(t.admin.boardEditor.applyGenres);

    await waitFor(() => expect(mocks.bulkSetCellGenresAction).toHaveBeenCalledTimes(1));
    const fd = mocks.bulkSetCellGenresAction.mock.calls[0][1] as FormData;
    expect(fd.get("boardId")).toBe("b1");
    expect(fd.get("seasonId")).toBe("s1");
    expect(fd.get("boardSize")).toBe("24");
    expect(fd.get("positions")).toBe("0-3");
    expect(fd.get("applyToAll")).toBe("true");
    expect(JSON.parse(String(fd.get("genres")))).toEqual([GENRES[0].value]);
  });

  it("disables the positions input while apply-to-all is checked", () => {
    const { positions } = setup();
    expect(positions.disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(positions.disabled).toBe(true);
  });

  it("sends the pool genres when randomising", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: GENRES[2].label }));
    submit(t.admin.boardEditor.randomizeGenres);

    await waitFor(() => expect(mocks.randomizeBoardGenresAction).toHaveBeenCalledTimes(1));
    const fd = mocks.randomizeBoardGenresAction.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(fd.get("poolGenres")))).toEqual([GENRES[2].value]);
  });

  it("clears the genres by submitting an empty list through the bulk action", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: GENRES[0].label }));
    submit(t.admin.boardEditor.clearGenres);

    await waitFor(() => expect(mocks.bulkSetCellGenresAction).toHaveBeenCalledTimes(1));
    const fd = mocks.bulkSetCellGenresAction.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(fd.get("genres")))).toEqual([]);
  });

  it("renders the outcome returned by either action", async () => {
    mocks.bulkSetCellGenresAction.mockResolvedValue({ error: "Bad positions" });
    setup();
    submit(t.admin.boardEditor.applyGenres);
    expect((await screen.findByText("Bad positions")).textContent).toBe("Bad positions");
  });
});
