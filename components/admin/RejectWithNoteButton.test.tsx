// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { RejectWithNoteButton } from "./RejectWithNoteButton";

const t = getDictionary("en");

const labels = {
  submitLabel: "Reject",
  title: "Reject submission",
  notePlaceholder: "Why?",
  confirmLabel: "Confirm reject",
  cancelLabel: "Cancel",
  tooShortError: "Too short",
};

function renderInsideForm(props: Partial<React.ComponentProps<typeof RejectWithNoteButton>> = {}) {
  let submits = 0;
  let lastForm: FormData | null = null;
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submits += 1;
          lastForm = new FormData(e.currentTarget);
        }}
      >
        <RejectWithNoteButton {...labels} {...props} />
      </form>
    </I18nProvider>,
  );
  return { ...utils, submits: () => submits, lastForm: () => lastForm };
}

afterEach(cleanup);

describe("RejectWithNoteButton", () => {
  it("renders the trigger label and the optional ×count suffix", () => {
    renderInsideForm({ count: 3 });
    const trigger = screen.getByRole("button", { name: /Reject/ });
    expect(trigger.textContent).toContain("×3");
  });

  it("does not submit while the note is shorter than the minimum", async () => {
    const { submits } = renderInsideForm();
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: labels.confirmLabel }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(labels.tooShortError);
    expect(submits()).toBe(0);
  });

  it("writes the trimmed note into the hidden input and submits on confirm", async () => {
    const { submits, lastForm, container } = renderInsideForm({ fieldName: "sharedNote" });
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "  spam content  " } });
    fireEvent.click(screen.getByRole("button", { name: labels.confirmLabel }));

    await waitFor(() => expect(submits()).toBe(1));
    expect(lastForm()?.get("sharedNote")).toBe("spam content");
    expect(container.querySelector('input[name="sharedNote"]')).toBeTruthy();
  });

  it("disables the trigger when disabled is set", () => {
    renderInsideForm({ disabled: true });
    const trigger = screen.getByRole("button", { name: /Reject/ }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });
});
