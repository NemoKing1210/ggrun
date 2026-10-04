// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { ActivityCalendar } from "./ActivityCalendar";

const t = getDictionary("en");

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCalendar(days: Array<{ date: string; count: number }> = []) {
  return render(
    <I18nProvider locale="en" t={t}>
      <ActivityCalendar days={days} />
    </I18nProvider>,
  );
}

const firstCell = () => screen.getAllByRole("gridcell")[0]!;

describe("ActivityCalendar tooltip", () => {
  it("ports a tooltip matching the hovered cell and removes it on leave", () => {
    renderCalendar();
    const cell = firstCell();
    const label = cell.getAttribute("aria-label");
    if (!label) throw new Error("cell missing label");
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(cell);
    expect(screen.getByRole("tooltip").textContent).toBe(label);
    expect(cell.className).toContain("ring-amber/60");

    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows and hides the tooltip on keyboard focus", () => {
    renderCalendar();
    const cell = firstCell();
    fireEvent.focus(cell);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.blur(cell);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("labels a hovered day using its recorded count", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    renderCalendar([{ date: today.toISOString().slice(0, 10), count: 4 }]);
    const target = screen
      .getAllByRole("gridcell")
      .find((cell) => cell.getAttribute("aria-label")?.includes("4 contributions"));
    if (!target) throw new Error("target cell not found");
    fireEvent.mouseEnter(target);
    expect(screen.getByRole("tooltip").textContent).toContain("4 contributions");
  });
});
