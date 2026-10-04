// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { GENRES } from "@/lib/modules/catalog/pool/constants";

import { BoardSingleCellForm } from "./BoardSingleCellForm";

const mocks = vi.hoisted(() => ({ setBoardCellAction: vi.fn() }));

vi.mock("@/lib/modules/season/actions/board", () => ({
  setBoardCellAction: mocks.setBoardCellAction,
}));
vi.mock("@/components/ui/toast", () => ({ useActionToast: () => {} }));

const t = getDictionary("en");

function renderForm(perCellGenre: boolean) {
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <BoardSingleCellForm boardId="b1" seasonId="s1" perCellGenre={perCellGenre} />
    </I18nProvider>,
  );
  return { ...utils, form: utils.container.querySelector("form") as HTMLFormElement };
}

beforeEach(() => {
  mocks.setBoardCellAction.mockReset().mockResolvedValue({});
});

afterEach(cleanup);

describe("BoardSingleCellForm", () => {
  it("renders the board fields and submits the cell to the action", async () => {
    const { form, container } = renderForm(false);
    expect((container.querySelector('input[name="boardId"]') as HTMLInputElement).value).toBe("b1");
    expect((container.querySelector('input[name="seasonId"]') as HTMLInputElement).value).toBe("s1");
    expect(screen.getByText(t.admin.boardEditor.formHeading)).toBeTruthy();

    fireEvent.change(container.querySelector('input[name="position"]') as HTMLInputElement, {
      target: { value: "5" },
    });
    fireEvent.submit(form);

    await waitFor(() => expect(mocks.setBoardCellAction).toHaveBeenCalledTimes(1));
    const fd = mocks.setBoardCellAction.mock.calls[0][1] as FormData;
    expect(fd.get("position")).toBe("5");
    expect(fd.get("boardId")).toBe("b1");
    expect(fd.get("cellType")).toBe("normal");
    // without per-cell genres the browser never sets the field
    expect(fd.get("genres")).toBeNull();
  });

  it("serialises the picked genres into the submitted form when per-cell", async () => {
    const { form } = renderForm(true);
    const first = GENRES[0];
    const second = GENRES[1];
    fireEvent.click(screen.getByRole("button", { name: first.label }));
    fireEvent.click(screen.getByRole("button", { name: second.label }));
    // the selected badge reflects the local chip state
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.submit(form);

    await waitFor(() => expect(mocks.setBoardCellAction).toHaveBeenCalledTimes(1));
    const fd = mocks.setBoardCellAction.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(fd.get("genres")))).toEqual([first.value, second.value]);
  });

  it("hides the genre section entirely when genres are not per-cell", () => {
    renderForm(false);
    expect(screen.queryByText(t.admin.boardEditor.cellGenresLabel)).toBeNull();
  });

  it("renders the error returned by the action", async () => {
    mocks.setBoardCellAction.mockResolvedValue({ error: "Position out of range" });
    const { form } = renderForm(false);
    fireEvent.submit(form);
    expect((await screen.findByText("Position out of range")).textContent).toBe("Position out of range");
  });

  it("renders the success message returned by the action", async () => {
    mocks.setBoardCellAction.mockResolvedValue({ ok: "Cell saved" });
    const { form } = renderForm(false);
    fireEvent.submit(form);
    expect((await screen.findByText("Cell saved")).textContent).toBe("Cell saved");
  });
});
