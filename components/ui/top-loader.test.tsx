// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TopLoader } from "./top-loader";

let currentPath = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

beforeEach(() => {
  currentPath = "/";
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function clickAnchor(href: string, attrs: Record<string, string> = {}) {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  for (const [key, value] of Object.entries(attrs)) anchor.setAttribute(key, value);
  anchor.addEventListener("click", (event) => event.preventDefault());
  document.body.appendChild(anchor);
  fireEvent.click(anchor);
  anchor.remove();
}

describe("TopLoader", () => {
  it("renders nothing before any navigation", () => {
    const { container } = render(<TopLoader />);
    expect(container.firstChild).toBeNull();
  });

  it("starts the bar when an internal link is clicked", () => {
    const { container } = render(<TopLoader />);
    clickAnchor("/board");
    expect(container.firstChild).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("ignores external, hash, download, modifier and same-path clicks", () => {
    const { container } = render(<TopLoader />);
    clickAnchor("https://example.com/x");
    clickAnchor("#section");
    clickAnchor("/board", { download: "" });
    clickAnchor("/board", { target: "_blank" });
    clickAnchor("/");
    expect(container.firstChild).toBeNull();
  });

  it("completes and clears the bar once the pathname changes", () => {
    const { container, rerender } = render(<TopLoader />);
    currentPath = "/board";
    rerender(<TopLoader />);
    expect(container.firstChild).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.firstChild).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.firstChild).toBeNull();
  });

  it("does not treat the first render as a navigation", () => {
    const { container } = render(<TopLoader />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(container.firstChild).toBeNull();
  });
});
