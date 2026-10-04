// @vitest-environment jsdom
import { act, cleanup, render, screen, type RenderResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import DiceRoller from "./DiceRoller";

const t = getDictionary("en");

let reducedMotion = false;

const renderDice = (values: number[] | null) =>
  render(
    <I18nProvider locale="en" t={t}>
      <DiceRoller values={values} />
    </I18nProvider>,
  );

const rerenderDice = (view: RenderResult, values: number[]) =>
  view.rerender(
    <I18nProvider locale="en" t={t}>
      <DiceRoller values={values} />
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

describe("DiceRoller", () => {
  it("renders nothing before the first result arrives", () => {
    const { container } = renderDice(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders one counter per settled value", () => {
    renderDice([2, 5]);
    expect(screen.getAllByText(/^[25]$/)).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe(
      format(t.core.dashboard.diceResult, { values: "2 + 5" }),
    );
  });

  it("flashes random faces and announces rolling on a new result", () => {
    vi.useFakeTimers();
    const view = renderDice([1, 1]);
    rerenderDice(view, [6, 6]);
    expect(screen.getByRole("status").textContent).toBe(t.core.dashboard.diceRolling);
  });

  it("settles on the server values after the spin", () => {
    vi.useFakeTimers();
    const view = renderDice([1, 1]);
    rerenderDice(view, [4, 3]);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByRole("status").textContent).toBe(
      format(t.core.dashboard.diceResult, { values: "4 + 3" }),
    );
  });

  it("shows the final values immediately under reduced motion", () => {
    reducedMotion = true;
    const view = renderDice([1, 1]);
    rerenderDice(view, [6, 1]);
    expect(screen.getByRole("status").textContent).toBe(
      format(t.core.dashboard.diceResult, { values: "6 + 1" }),
    );
  });

  it("clears the display when the result resets to empty", () => {
    const view = renderDice([3]);
    view.rerender(
      <I18nProvider locale="en" t={t}>
        <DiceRoller values={null} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
