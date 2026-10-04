// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { createEventTemplateAction, updateEventTemplateAction } from "@/lib/modules/iee/actions";

import {
  EventTemplatesManager,
  type CatalogOption,
  type EventTemplateRow,
} from "./EventTemplatesManager";

vi.mock("@/lib/modules/iee/actions", () => ({
  createEventTemplateAction: vi.fn(),
  updateEventTemplateAction: vi.fn(),
  toggleEventTemplateAction: vi.fn(),
  deleteEventTemplateAction: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ useActionToast: () => {} }));

const t = getDictionary("en");
const a = t.iee.admin;
const e = a.events;
const f = e.fields;
const filters = a.filters;

const createTpl = vi.mocked(createEventTemplateAction);
const updateTpl = vi.mocked(updateEventTemplateAction);

function template(over: Partial<EventTemplateRow> = {}): EventTemplateRow {
  return {
    id: "tpl-1",
    key: "screenshot_of_the_day",
    title: "Screenshot of the day",
    descriptionMd: "Post a screenshot of your best run.",
    reward: { points: 5, itemKey: "blade", effectKey: "haste" },
    requiresProof: true,
    defaultDeadlineHours: 24,
    isActive: true,
    ...over,
  };
}

function renderManager(
  templates: EventTemplateRow[],
  opts: {
    items?: CatalogOption[];
    effects?: CatalogOption[];
    usage?: Record<string, number>;
  } = {},
) {
  return render(
    <I18nProvider locale="en" t={t}>
      <EventTemplatesManager
        templates={templates}
        items={opts.items ?? []}
        effects={opts.effects ?? []}
        usage={opts.usage ?? {}}
      />
    </I18nProvider>,
  );
}

describe("EventTemplatesManager", () => {
  beforeEach(() => {
    createTpl.mockReset();
    updateTpl.mockReset();
    createTpl.mockResolvedValue({});
    updateTpl.mockResolvedValue({});
  });

  afterEach(cleanup);

  it("renders the empty label when there are no templates", () => {
    const { container } = renderManager([]);
    expect(screen.getByText(e.empty).textContent).toBe(e.empty);
    // nothing to filter, so the bar and the table are absent
    expect(screen.queryByPlaceholderText(filters.searchPlaceholder)).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("opens the create form from the create button and closes it on cancel", () => {
    const { container } = renderManager([template()]);

    expect(container.querySelector('input[name="key"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: e.create }));

    // create-only fields and no id hidden input
    const keyInput = container.querySelector('input[name="key"]');
    expect(keyInput).toBeTruthy();
    const form = keyInput?.closest("form") as HTMLFormElement;
    expect(form.querySelector('input[name="id"]')).toBeNull();
    expect(screen.getByRole("button", { name: e.save })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: e.cancel }));
    expect(container.querySelector('input[name="key"]')).toBeNull();
  });

  it("opens a prefilled form when editing a template", () => {
    const tpl = template();
    const { container } = renderManager([template(), template({ id: "tpl-2", title: "Other" })]);

    fireEvent.click(screen.getAllByRole("button", { name: e.edit })[0]);

    expect(screen.getByText(format(e.editing, { title: tpl.title }))).toBeTruthy();
    const editForm = container
      .querySelector<HTMLTextAreaElement>('textarea[name="descriptionMd"]')
      ?.closest("form") as HTMLFormElement;
    expect(editForm).toBeTruthy();
    // key is immutable in edit mode
    expect(editForm.querySelector('input[name="key"]')).toBeNull();
    expect(editForm.querySelector<HTMLInputElement>('input[name="id"]')?.value).toBe(tpl.id);
    expect(editForm.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe(tpl.title);
    expect(
      editForm.querySelector<HTMLTextAreaElement>('textarea[name="descriptionMd"]')?.value,
    ).toBe(tpl.descriptionMd);
    expect(
      editForm.querySelector<HTMLInputElement>('input[name="rewardPoints"]')?.value,
    ).toBe("5");
    expect(
      editForm.querySelector<HTMLInputElement>('input[name="defaultDeadlineHours"]')?.value,
    ).toBe("24");

    const requiresProof = screen.getByRole("switch", { name: f.requiresProof });
    expect(requiresProof.getAttribute("aria-checked")).toBe("true");
    expect(
      editForm.querySelector<HTMLInputElement>('input[name="requiresProof"]')?.value,
    ).toBe("true");

    fireEvent.click(requiresProof);
    expect(requiresProof.getAttribute("aria-checked")).toBe("false");
    expect(
      editForm.querySelector<HTMLInputElement>('input[name="requiresProof"]')?.value,
    ).toBe("false");
  });

  it("shows the filter bar only when there is more than one template", () => {
    renderManager([template()]);
    expect(screen.queryByPlaceholderText(filters.searchPlaceholder)).toBeNull();
    cleanup();

    renderManager([template(), template({ id: "tpl-2", title: "Other" })]);
    expect(screen.getByPlaceholderText(filters.searchPlaceholder)).toBeTruthy();
  });

  it("filters rows by query and exposes the shown-of-total counter with a reset", () => {
    const alpha = template({ id: "a", key: "alpha", title: "Alpha event", descriptionMd: "first" });
    const beta = template({ id: "b", key: "beta", title: "Beta event", descriptionMd: "second" });
    renderManager([alpha, beta]);

    const search = screen.getByPlaceholderText(filters.searchPlaceholder) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "beta" } });

    expect(screen.queryByText("Alpha event")).toBeNull();
    expect(screen.getByText("Beta event")).toBeTruthy();
    expect(screen.getByText(format(filters.showing, { shown: "1", total: "2" }))).toBeTruthy();

    // matches the key too, not just the title
    fireEvent.change(search, { target: { value: "alpha" } });
    expect(screen.getByText("Alpha event")).toBeTruthy();
    expect(screen.queryByText("Beta event")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: filters.reset }));
    expect(search.value).toBe("");
    expect(screen.getByText("Alpha event")).toBeTruthy();
    expect(screen.getByText("Beta event")).toBeTruthy();
    expect(screen.getByText(format(filters.showing, { shown: "2", total: "2" }))).toBeTruthy();
  });

  it("filters by active/inactive status chips", () => {
    const active = template({ id: "a", title: "Alpha event", isActive: true });
    const inactive = template({ id: "b", title: "Beta event", isActive: false });
    renderManager([active, inactive]);

    const bar = screen
      .getByPlaceholderText(filters.searchPlaceholder)
      .closest("div.hud-card") as HTMLElement;
    expect(bar).toBeTruthy();

    fireEvent.click(within(bar).getByRole("button", { name: e.inactive }));
    expect(screen.queryByText("Alpha event")).toBeNull();
    expect(screen.getByText("Beta event")).toBeTruthy();

    fireEvent.click(within(bar).getByRole("button", { name: e.active }));
    expect(screen.getByText("Alpha event")).toBeTruthy();
    expect(screen.queryByText("Beta event")).toBeNull();

    fireEvent.click(within(bar).getByRole("button", { name: filters.all }));
    expect(screen.getByText("Alpha event")).toBeTruthy();
    expect(screen.getByText("Beta event")).toBeTruthy();
  });

  it("renders reward badges with key fallbacks plus proof, deadline, usage and status cells", () => {
    const alpha = template({
      id: "a",
      key: "alpha",
      title: "Alpha event",
      reward: { points: 5, itemKey: "blade", effectKey: "haste" },
      requiresProof: true,
      defaultDeadlineHours: 24,
      isActive: true,
    });
    const beta = template({
      id: "b",
      key: "beta",
      title: "Beta event",
      reward: { itemKey: "unknown_item", effectKey: "unknown_effect" },
      requiresProof: false,
      defaultDeadlineHours: null,
      isActive: false,
    });
    const { container } = renderManager([alpha, beta], {
      items: [{ key: "blade", label: "Blade" }],
      effects: [{ key: "haste", label: "Haste" }],
      usage: { alpha: 3 },
    });

    // reward: points badge, resolved labels, raw-key fallbacks
    expect(screen.getByText("+5")).toBeTruthy();
    expect(screen.getByText("Blade")).toBeTruthy();
    expect(screen.getByText("Haste")).toBeTruthy();
    expect(screen.getByText("unknown_item")).toBeTruthy();
    expect(screen.getByText("unknown_effect")).toBeTruthy();

    expect(screen.getByText(e.proofRequired)).toBeTruthy();
    expect(screen.getByText(e.proofNotRequired)).toBeTruthy();
    expect(screen.getByText(format(e.deadlineHours, { count: "24" }))).toBeTruthy();
    expect(screen.getByText(e.noDeadline)).toBeTruthy();
    expect(screen.getByText(format(a.usedInSeasons, { count: "3" }))).toBeTruthy();
    expect(screen.getByText(a.usedInNone)).toBeTruthy();

    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    expect(within(rows[0] as HTMLElement).getByText(e.active)).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText(e.inactive)).toBeTruthy();
  });

  it("wires the per-row toggle button to its hidden form with the inverted state", () => {
    const active = template({ id: "tpl-7", title: "Alpha", isActive: true });
    const inactive = template({ id: "tpl-8", title: "Beta", isActive: false });
    const { container } = renderManager([active, inactive]);

    const toggleActive = container.querySelector<HTMLButtonElement>('button[form="toggle-tpl-7"]');
    expect(toggleActive).toBeTruthy();
    // active template offers to deactivate
    expect(toggleActive?.textContent).toBe(e.inactive);
    const activeForm = container.querySelector<HTMLFormElement>("form#toggle-tpl-7");
    expect(activeForm?.querySelector<HTMLInputElement>('input[name="id"]')?.value).toBe("tpl-7");
    expect(activeForm?.querySelector<HTMLInputElement>('input[name="isActive"]')?.value).toBe(
      "false",
    );

    const toggleInactive = container.querySelector<HTMLButtonElement>('button[form="toggle-tpl-8"]');
    expect(toggleInactive?.textContent).toBe(e.active);
    const inactiveForm = container.querySelector<HTMLFormElement>("form#toggle-tpl-8");
    expect(inactiveForm?.querySelector<HTMLInputElement>('input[name="isActive"]')?.value).toBe(
      "true",
    );
  });

  it("opens the delete confirmation with the formatted message", async () => {
    const tpl = template({ id: "tpl-7", title: "Alpha event" });
    const { container } = renderManager([tpl, template({ id: "tpl-2", title: "Other" })]);

    const del = container.querySelector<HTMLButtonElement>('button[form="delete-tpl-7"]');
    expect(del?.getAttribute("aria-label")).toBe(e.delete);
    const deleteForm = container.querySelector<HTMLFormElement>("form#delete-tpl-7");
    expect(deleteForm?.querySelector<HTMLInputElement>('input[name="id"]')?.value).toBe("tpl-7");

    fireEvent.click(del as HTMLButtonElement);

    const message = format(e.deleteConfirm, { title: tpl.title });
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("keeps the hidden forms for every template even when a filter hides the row", () => {
    const alpha = template({ id: "a", key: "alpha", title: "Alpha event" });
    const beta = template({ id: "b", key: "beta", title: "Beta event" });
    const { container } = renderManager([alpha, beta]);

    fireEvent.change(screen.getByPlaceholderText(filters.searchPlaceholder), {
      target: { value: "alpha" },
    });

    expect(container.querySelectorAll("tbody tr").length).toBe(1);
    for (const id of ["a", "b"]) {
      expect(container.querySelector(`form#toggle-${id}`)).toBeTruthy();
      expect(container.querySelector(`form#delete-${id}`)).toBeTruthy();
    }
    expect(container.querySelector("form#toggle-c")).toBeNull();
  });
});
