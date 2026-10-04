// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(
      <Modal open={false} onClose={() => undefined}>
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("portals an open dialog to the body with children and aria wiring", () => {
    render(
      <Modal open onClose={() => undefined} labelledBy="title-1">
        <h2 id="title-1">Hello</h2>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("title-1");
    expect(document.body.contains(dialog)).toBe(true);
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("moves focus to the panel on open", () => {
    render(
      <Modal open onClose={() => undefined}>
        <p>body</p>
      </Modal>,
    );
    const panel = screen.getByRole("dialog").querySelector(".hud-card");
    expect(panel).not.toBeNull();
    expect(document.activeElement).toBe(panel);
  });

  it("closes on Escape and on a backdrop click", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ignores interactions inside the panel", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while mounted and restores it on unmount", () => {
    const { unmount } = render(
      <Modal open onClose={() => undefined}>
        <p>body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps content during the exit animation, then unmounts", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <Modal open onClose={() => undefined}>
          <p>body</p>
        </Modal>,
      );
      rerender(
        <Modal open={false} onClose={() => undefined}>
          <p>body</p>
        </Modal>,
      );
      expect(screen.queryByRole("dialog")).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
