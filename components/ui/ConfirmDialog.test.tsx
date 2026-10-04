// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { ConfirmDialog } from "./ConfirmDialog";

const t = getDictionary("en");

afterEach(cleanup);

function renderDialog(props: {
  open?: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <ConfirmDialog
        open={props.open ?? true}
        title={props.title}
        message={props.message}
        confirmLabel={props.confirmLabel}
        cancelLabel={props.cancelLabel}
        danger={props.danger}
        onConfirm={props.onConfirm ?? (() => undefined)}
        onCancel={props.onCancel ?? (() => undefined)}
      />
    </I18nProvider>,
  );
}

describe("ConfirmDialog", () => {
  it("shows the message and default translated actions", () => {
    renderDialog({ message: "Delete the thing?" });
    expect(screen.getByText("Delete the thing?")).toBeTruthy();
    expect(screen.getByText(t.core.common.confirmTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.core.common.confirm })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.core.common.cancel })).toBeTruthy();
  });

  it("honours a custom title and button labels", () => {
    renderDialog({
      message: "Careful",
      title: "Are you sure",
      confirmLabel: "Yep",
      cancelLabel: "Nope",
    });
    expect(screen.getByText("Are you sure")).toBeTruthy();
    expect(screen.queryByText(t.core.common.confirmTitle)).toBeNull();
    expect(screen.getByRole("button", { name: "Yep" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nope" })).toBeTruthy();
  });

  it("reports confirm and cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderDialog({ message: "Proceed?", onConfirm, onCancel });
    fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t.core.common.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("routes Escape to the cancel handler via Modal", () => {
    const onCancel = vi.fn();
    renderDialog({ message: "Proceed?", onCancel });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("swaps the confirm button palette in danger mode", () => {
    const { unmount } = renderDialog({ message: "Irreversible", danger: true });
    const confirm = screen.getByRole("button", { name: t.core.common.confirm });
    expect(confirm.className).toContain("hud-btn-danger");
    unmount();

    renderDialog({ message: "Safe" });
    const safeConfirm = screen.getByRole("button", { name: t.core.common.confirm });
    expect(safeConfirm.className).toContain("hud-btn-primary");
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false, message: "Hidden" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
