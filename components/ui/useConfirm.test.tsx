// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { useConfirm } from "./useConfirm";

const t = getDictionary("en");

afterEach(cleanup);

function Harness() {
  const { confirm, dialog } = useConfirm();
  const [result, setResult] = useState("none");
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void confirm({ message: "Delete it?", title: "Sure?" }).then((ok) =>
            setResult(String(ok)),
          );
        }}
      >
        ask
      </button>
      <button
        type="button"
        onClick={() => {
          void confirm({ message: "Second?", danger: true }).then((ok) =>
            setResult(String(ok)),
          );
        }}
      >
        ask-danger
      </button>
      <span data-testid="result">{result}</span>
      {dialog}
    </div>
  );
}

function setup() {
  return render(
    <I18nProvider locale="en" t={t}>
      <Harness />
    </I18nProvider>,
  );
}

describe("useConfirm", () => {
  it("stays hidden until confirm is called", () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves true when the confirm button is pressed", async () => {
    setup();
    fireEvent.click(screen.getByText("ask"));
    expect(screen.getByText("Delete it?")).toBeTruthy();
    expect(screen.getByText("Sure?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("true"));
  });

  it("resolves false when cancelled", async () => {
    setup();
    fireEvent.click(screen.getByText("ask"));
    fireEvent.click(screen.getByRole("button", { name: t.core.common.cancel }));
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("false"));
  });

  it("passes danger through to the dialog", () => {
    setup();
    fireEvent.click(screen.getByText("ask-danger"));
    const confirm = screen.getByRole("button", { name: t.core.common.confirm });
    expect(confirm.className).toContain("hud-btn-danger");
  });
});
