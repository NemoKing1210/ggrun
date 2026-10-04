import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToastItem } from "@/components/ui/toast/Toast";
import type { Toast, ToastVariant } from "@/components/ui/toast/types";

const base: Toast = {
  id: "t1",
  title: "Saved",
  variant: "default",
  icon: false,
  duration: 4000,
  dismissible: true,
  showProgress: true,
  actions: [],
  createdAt: 1_700_000_000_000,
};

function renderToast(toast: Partial<Toast>, progress = 1): string {
  const merged: Toast = { ...base, ...toast };
  return renderToStaticMarkup(
    <ToastItem
      toast={merged}
      onDismiss={() => {}}
      onPause={() => {}}
      onResume={() => {}}
      progress={progress}
    />,
  );
}

const VARIANT_LABEL: Record<ToastVariant, string> = {
  success: "SUCCESS",
  error: "ERROR",
  warning: "WARNING",
  info: "INFO",
  default: "NOTE",
};

describe("ToastItem", () => {
  it("renders the title inside a polite status region", () => {
    const html = renderToast({});
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Saved");
  });

  for (const [variant, label] of Object.entries(VARIANT_LABEL)) {
    it(`badges the ${variant} variant`, () => {
      const html = renderToast({ variant: variant as ToastVariant });
      expect(html).toContain(`>${label}<`);
    });
  }

  it("renders the description only when present", () => {
    expect(renderToast({ description: "All good" })).toContain("All good");
    expect(renderToast({})).not.toContain("All good");
  });

  it("renders a custom icon element and skips it when icon is false", () => {
    const withIcon = renderToast({ icon: <span data-mark="custom-icon" /> });
    expect(withIcon).toContain('data-mark="custom-icon"');
    const without = renderToast({ icon: false });
    expect(without).not.toContain('data-mark="custom-icon"');
  });

  it("offers a dismiss control only when dismissible", () => {
    expect(renderToast({ dismissible: true })).toContain('aria-label="Dismiss"');
    expect(renderToast({ dismissible: false })).not.toContain('aria-label="Dismiss"');
  });

  it("renders action buttons with their labels", () => {
    const html = renderToast({
      actions: [
        { label: "Undo", onClick: () => {} },
        { label: "Dismiss all", onClick: () => {}, variant: "danger" },
      ],
    });
    expect(html).toContain("Undo");
    expect(html).toContain("Dismiss all");
  });

  it("shows the progress bar and clamps its width into 0..100", () => {
    expect(renderToast({}, 0.5)).toContain("width:50%");
    expect(renderToast({}, 1.5)).toContain("width:100%");
    expect(renderToast({}, -3)).toContain("width:0%");
  });

  it("hides the progress bar when duration is false", () => {
    const html = renderToast({ duration: false, showProgress: true });
    expect(html).not.toContain("h-[2px]");
  });

  it("hides the debug payload until the toggle is used", () => {
    const html = renderToast({ debug: "SECRET-STACK" });
    expect(html).toContain("show debug");
    expect(html).not.toContain("SECRET-STACK");
  });
});
