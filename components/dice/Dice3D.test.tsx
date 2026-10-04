// @vitest-environment jsdom
import { act, cleanup, render, screen, type RenderResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import Dice3D from "./Dice3D";

const t = getDictionary("en");

let reducedMotion = false;

const renderDice = (values: number[] | null) =>
  render(
    <I18nProvider locale="en" t={t}>
      <Dice3D values={values} />
    </I18nProvider>,
  );

const rerenderDice = (view: RenderResult, values: number[]) =>
  view.rerender(
    <I18nProvider locale="en" t={t}>
      <Dice3D values={values} />
    </I18nProvider>,
  );

beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Dice3D", () => {
  it("renders one total per roll with the settled sum", () => {
    renderDice([3, 4]);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("(3 + 4)")).toBeTruthy();
  });

  it("publishes the settled result on the accessible status", () => {
    renderDice([6, 2]);
    expect(screen.getByRole("status").textContent).toBe(
      format(t.core.dashboard.diceResult, { values: "6 + 2" }),
    );
  });

  it("shows a zero total and no faces when there are no values", () => {
    const { container } = renderDice(null);
    expect(screen.getByText("total")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(container.querySelectorAll(".ammo-counter")).toHaveLength(1);
  });

  it("announces the rolling state while a new snapshot spins", () => {
    vi.useFakeTimers();
    const view = renderDice([1, 2]);
    rerenderDice(view, [5, 6]);
    expect(screen.getByRole("status").textContent).toBe(t.core.dashboard.diceRolling);
    expect(screen.queryByText("11")).toBeNull();
  });

  it("settles on the real values after the spin window", () => {
    vi.useFakeTimers();
    const view = renderDice([1, 2]);
    rerenderDice(view, [5, 6]);
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByRole("status").textContent).toBe(
      format(t.core.dashboard.diceResult, { values: "5 + 6" }),
    );
  });

  it("skips the spin when the user prefers reduced motion", () => {
    reducedMotion = true;
    const view = renderDice([1, 2]);
    rerenderDice(view, [4, 4]);
    expect(screen.getByRole("status").textContent).toBe(
      format(t.core.dashboard.diceResult, { values: "4 + 4" }),
    );
  });
});
