// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { ConfirmButton } from "./ConfirmButton";

const t = getDictionary("en");

/** The button refuses to submit its form itself: it must go through the dialog. */
function renderInForm(button: React.ReactNode) {
  let submits = 0;
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submits += 1;
        }}
      >
        {button}
      </form>
    </I18nProvider>,
  );
  return { ...utils, submits: () => submits };
}

afterEach(cleanup);

describe("ConfirmButton", () => {
  it("is a plain button, never a submit button", () => {
    renderInForm(<ConfirmButton message="Delete this?">Delete</ConfirmButton>);
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("submits the surrounding form only after the admin confirms", async () => {
    const { submits } = renderInForm(<ConfirmButton message="Delete this?">Delete</ConfirmButton>);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    // The dialog is shown with the message; nothing is submitted yet.
    expect(await screen.findByText("Delete this?")).toBeTruthy();
    expect(submits()).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    await waitFor(() => expect(submits()).toBe(1));
  });

  it("does not submit when the admin cancels", async () => {
    const { submits } = renderInForm(<ConfirmButton message="Delete this?">Delete</ConfirmButton>);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Delete this?");
    fireEvent.click(screen.getByRole("button", { name: t.core.common.cancel }));

    await waitFor(() => expect(screen.queryByText("Delete this?")).toBeNull());
    expect(submits()).toBe(0);
  });

  it("blocks interaction while disabled", () => {
    renderInForm(
      <ConfirmButton message="Delete this?" disabled>
        Delete
      </ConfirmButton>,
    );
    const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(screen.queryByText("Delete this?")).toBeNull();
  });
});
