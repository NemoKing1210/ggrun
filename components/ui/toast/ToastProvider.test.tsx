// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "./ToastProvider";
import { useToast } from "./useToast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness() {
  const { toasts, toast, success, dismiss, clearAll, push } = useToast();
  return (
    <div>
      <span data-testid="titles">{toasts.map((x) => x.title).join("|")}</span>
      <span data-testid="durations">{toasts.map((x) => String(x.duration)).join("|")}</span>
      <button type="button" onClick={() => toast({ title: "Hello", duration: false })}>
        push
      </button>
      <button type="button" onClick={() => success("Saved")}>
        success
      </button>
      <button type="button" onClick={() => push({ id: "fixed", title: "First", duration: false })}>
        fixed-1
      </button>
      <button type="button" onClick={() => push({ id: "fixed", title: "Second", duration: false })}>
        fixed-2
      </button>
      <button type="button" onClick={() => dismiss(toasts[0]?.id ?? "")}>
        dismiss-first
      </button>
      <button type="button" onClick={() => clearAll()}>
        clear
      </button>
    </div>
  );
}

function setup(maxVisible?: number) {
  return render(
    <ToastProvider maxVisible={maxVisible}>
      <Harness />
    </ToastProvider>,
  );
}

const titles = () => screen.getByTestId("titles").textContent ?? "";

describe("ToastProvider", () => {
  it("starts empty", () => {
    setup();
    expect(titles()).toBe("");
    expect(screen.queryByLabelText("Dismiss")).toBeNull();
  });

  it("enqueues a toast and portals it into the document", () => {
    setup();
    fireEvent.click(screen.getByText("push"));
    expect(titles()).toBe("Hello");
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Hello");
    expect(document.body.contains(status)).toBe(true);
  });

  it("applies the variant defaults through the success helper", () => {
    setup();
    fireEvent.click(screen.getByText("success"));
    expect(titles()).toBe("Saved");
    expect(screen.getByTestId("durations").textContent).toBe("4200");
  });

  it("dismisses a toast by id", () => {
    setup();
    fireEvent.click(screen.getByText("push"));
    expect(titles()).toBe("Hello");
    fireEvent.click(screen.getByText("dismiss-first"));
    expect(titles()).toBe("");
  });

  it("replaces a toast that reuses an id", () => {
    setup();
    fireEvent.click(screen.getByText("fixed-1"));
    fireEvent.click(screen.getByText("fixed-2"));
    expect(titles()).toBe("Second");
  });

  it("caps the visible stack at maxVisible", () => {
    setup(2);
    fireEvent.click(screen.getByText("push"));
    fireEvent.click(screen.getByText("success"));
    fireEvent.click(screen.getByText("fixed-1"));
    expect(titles().split("|")).toHaveLength(2);
  });

  it("clears every toast", () => {
    setup();
    fireEvent.click(screen.getByText("push"));
    fireEvent.click(screen.getByText("success"));
    fireEvent.click(screen.getByText("clear"));
    expect(titles()).toBe("");
  });

  it("runs onDismiss from the toast config", () => {
    const onDismiss = vi.fn();
    function OneShot() {
      const { toasts, toast, dismiss } = useToast();
      return (
        <div>
          <span data-testid="titles">{toasts.map((x) => x.title).join("|")}</span>
          <button
            type="button"
            onClick={() => toast({ title: "Bye", duration: false, onDismiss })}
          >
            push
          </button>
          <button type="button" onClick={() => dismiss(toasts[0]?.id ?? "")}>
            dismiss-first
          </button>
        </div>
      );
    }
    render(
      <ToastProvider>
        <OneShot />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push"));
    fireEvent.click(screen.getByText("dismiss-first"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses once the duration elapses", async () => {
    vi.useFakeTimers();
    setup();
    function Timed() {
      const { toasts, toast } = useToast();
      return (
        <div>
          <span data-testid="titles">{toasts.map((x) => x.title).join("|")}</span>
          <button type="button" onClick={() => toast({ title: "Expires", duration: 1000 })}>
            push
          </button>
        </div>
      );
    }
    // Re-render through a timed harness while fake timers are installed.
    cleanup();
    render(
      <ToastProvider>
        <Timed />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("titles").textContent).toBe("Expires");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("titles").textContent).toBe("");
  });

  it("dismisses the newest toast on Escape", () => {
    setup();
    fireEvent.click(screen.getByText("push"));
    fireEvent.click(screen.getByText("success"));
    expect(titles()).toBe("Saved|Hello");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(titles()).toBe("Hello");
  });

  it("throws when the hook is used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
