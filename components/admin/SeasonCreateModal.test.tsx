// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ToastProvider } from "@/components/ui/toast";
import { createSeasonAction } from "@/lib/modules/season/actions/seasons";

import { SeasonCreateModal } from "./SeasonCreateModal";

vi.mock("@/lib/modules/season/actions/seasons", () => ({ createSeasonAction: vi.fn() }));

const t = getDictionary("en");
const cs = t.admin.createSeason;
const createSeason = vi.mocked(createSeasonAction);

const seasons = [
  { id: "s1", title: "Season One", slug: "run-1" },
  { id: "s2", title: "Season Two", slug: "run-2" },
];

function renderModal() {
  return render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>
        <SeasonCreateModal seasons={seasons} />
      </ToastProvider>
    </I18nProvider>,
  );
}

/** Opens the modal and returns its dialog element. */
function openModal() {
  renderModal();
  fireEvent.click(screen.getByRole("button", { name: t.admin.overview.newSeason }));
  return screen.getByRole("dialog");
}

describe("SeasonCreateModal", () => {
  beforeEach(() => {
    createSeason.mockReset();
    createSeason.mockResolvedValue({});
  });

  afterEach(cleanup);

  it("opens the form from its launcher and lists the seasons to clone", () => {
    const dialog = openModal();
    expect(dialog.textContent).toContain(cs.cloneLabel);
    expect(dialog.textContent).toContain(cs.titlePlaceholder);
    const select = dialog.querySelector('select[name="cloneFrom"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      cs.noCloneOption,
      "Season One — run-1",
      "Season Two — run-2",
    ]);
  });

  it("submits title, derived slug and the picked clone source", async () => {
    const dialog = openModal();
    const title = dialog.querySelector('input[name="title"]') as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Gamma Run" } });
    const clone = dialog.querySelector('select[name="cloneFrom"]') as HTMLSelectElement;
    fireEvent.change(clone, { target: { value: "s2" } });

    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    expect(createSeason).toHaveBeenCalledTimes(1);
    const [, formData] = createSeason.mock.calls[0];
    expect(formData.get("title")).toBe("Gamma Run");
    expect(formData.get("slug")).toBe("gamma-run");
    expect(formData.get("cloneFrom")).toBe("s2");
  });

  it("renders a server error inline as an alert", async () => {
    createSeason.mockResolvedValue({ error: "Slug already taken" });
    const dialog = openModal();
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Slug already taken");
    // the form stays open so the admin can correct it
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("shows the success message from the server", async () => {
    createSeason.mockResolvedValue({ ok: "Season created" });
    const dialog = openModal();
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(await screen.findByText("Season created")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables the submit button and shows the pending glyph while saving", async () => {
    let resolveAction: (value: { ok?: string }) => void = () => {};
    createSeason.mockImplementation(
      () => new Promise<{ ok?: string }>((resolve) => (resolveAction = resolve)),
    );
    const dialog = openModal();
    const submit = dialog.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(submit.disabled).toBe(true));
    expect(submit.textContent).toContain("…");
    resolveAction({});
  });
});
