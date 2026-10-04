// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";

import { FormShell } from "./FormShell";

vi.mock("@/components/ui/toast", () => ({ useActionToast: () => {} }));

const t = getDictionary("en");

function renderShell(props: Partial<React.ComponentProps<typeof FormShell>> = {}) {
  const action = props.action ?? vi.fn(async (): Promise<AdminFormState> => ({}));
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <FormShell action={action} {...props}>
        <input name="field" defaultValue="value" />
      </FormShell>
    </I18nProvider>,
  );
  const form = utils.container.querySelector("form") as HTMLFormElement;
  return { ...utils, form, action };
}

afterEach(cleanup);

describe("FormShell", () => {
  it("renders children and a submit control with the given label", () => {
    renderShell({ submitLabel: "Save changes" });
    expect(screen.getByDisplayValue("value")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(button.type).toBe("submit");
    expect(button.disabled).toBe(false);
  });

  it("submits through the action and renders the returned error", async () => {
    const action = vi.fn(
      async (_prev: AdminFormState, _fd: FormData): Promise<AdminFormState> => ({ error: "Board not found" }),
    );
    const { form } = renderShell({ action, submitLabel: "Save" });

    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Board not found");
    expect(action).toHaveBeenCalledTimes(1);
    const [prev, fd] = action.mock.calls[0];
    expect(prev).toEqual({});
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as unknown as FormData).get("field")).toBe("value");
  });

  it("hides the submit control when asked", () => {
    renderShell({ hideSubmit: true, submitLabel: "Save" });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("uses an in-app confirm button instead of a raw submit when confirmMessage is set", async () => {
    renderShell({ confirmMessage: "Really save?", submitLabel: "Save" });
    const button = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(button.type).toBe("button");
    fireEvent.click(button);
    expect(await screen.findByText("Really save?")).toBeTruthy();
  });

  it("shows a pending label and disables the submit while the action is in flight", async () => {
    let resolve!: (state: AdminFormState) => void;
    const action = vi.fn(
      () => new Promise<AdminFormState>((r) => { resolve = r; }),
    );
    const { form } = renderShell({ action, submitLabel: "Save" });

    fireEvent.submit(form);

    const pendingButton = (await screen.findByRole("button", { name: "..." })) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);

    await act(async () => {
      resolve({});
    });
    await screen.findByRole("button", { name: "Save" });
  });
});
