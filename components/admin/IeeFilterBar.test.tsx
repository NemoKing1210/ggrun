// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import { IeeFilterBar, type ChipGroup } from "./IeeFilterBar";

const t = getDictionary("en");
const f = t.iee.admin.filters;

function groups(): ChipGroup[] {
  return [
    {
      id: "polarity",
      label: f.polarity,
      value: "all",
      onChange: vi.fn(),
      options: [
        { value: "positive", label: "Positive" },
        { value: "negative", label: "Negative" },
      ],
    },
  ];
}

function setup(over: Partial<React.ComponentProps<typeof IeeFilterBar>> = {}) {
  const groupList = over.groups ?? groups();
  const props = {
    query: "",
    onQuery: vi.fn(),
    groups: groupList,
    shown: 3,
    total: 10,
    onReset: vi.fn(),
    ...over,
  };
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <IeeFilterBar {...props} />
    </I18nProvider>,
  );
  return { ...utils, props, groupList };
}

afterEach(cleanup);

describe("IeeFilterBar", () => {
  it("reports keystrokes back to the host and shows the shown/total counter", () => {
    const { props } = setup();
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.placeholder).toBe(f.searchPlaceholder);
    fireEvent.change(input, { target: { value: "boots" } });
    expect(props.onQuery).toHaveBeenCalledWith("boots");
    expect(
      screen.getByText(format(f.showing, { shown: "3", total: "10" })).textContent,
    ).toBe(format(f.showing, { shown: "3", total: "10" }));
  });

  it("hides the reset button on a clean bar and shows it once any value is set", () => {
    const { unmount } = setup();
    expect(screen.queryByRole("button", { name: f.reset })).toBeNull();
    unmount();

    setup({ query: "x" });
    expect(screen.getByRole("button", { name: f.reset })).toBeTruthy();
  });

  it("treats a non-all chip group as dirty", () => {
    const list = groups();
    list[0].value = "positive";
    setup({ groups: list });
    expect(screen.getByRole("button", { name: f.reset })).toBeTruthy();
  });

  it("calls onReset when reset is pressed", () => {
    const { props } = setup({ query: "x" });
    fireEvent.click(screen.getByRole("button", { name: f.reset }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("drives each group's selection through its own onChange", () => {
    const { groupList } = setup();
    fireEvent.click(screen.getByRole("button", { name: f.all }));
    expect(groupList[0].onChange).toHaveBeenCalledWith("all");
    fireEvent.click(screen.getByRole("button", { name: "Positive" }));
    expect(groupList[0].onChange).toHaveBeenCalledWith("positive");
  });
});
