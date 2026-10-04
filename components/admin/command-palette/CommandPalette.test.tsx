// @vitest-environment jsdom
/**
 * The console's destructive-command gate lives client-side: the first Enter
 * arms the confirmation, the second runs it, and any edit disarms it. The
 * executor is mocked here — this file only owns the keyboard/state machine and
 * the client-only commands (`open`).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runAction, suggestAction, router } = vi.hoisted(() => ({
  runAction: vi.fn(),
  suggestAction: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock("@/lib/modules/admin-console/actions", () => ({
  runAdminCommandAction: runAction,
  suggestAdminArgsAction: suggestAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CommandPalette } from "@/components/admin/command-palette/CommandPalette";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

const t = getDictionary("en");

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function renderPalette() {
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en" t={t}>
      <CommandPalette open onClose={onClose} seasons={[]} />
    </I18nProvider>,
  );
  return { onClose, input: screen.getByPlaceholderText(t.adminConsole.placeholder) };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
  runAction.mockReset();
  runAction.mockResolvedValue({ ok: true, message: "done" });
  suggestAction.mockReset();
  suggestAction.mockResolvedValue([]);
  router.push.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("destructive confirmation", () => {
  it("arms on the first Enter and runs only on the second", async () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "game delete Hotline Miami" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText(t.adminConsole.confirmTitle)).toBeTruthy();
    expect(runAction).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(runAction).toHaveBeenCalledWith("game delete Hotline Miami"));
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("disarms the confirmation as soon as the line is edited", () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "bot cleanup 12345678" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText(t.adminConsole.confirmTitle)).toBeTruthy();

    fireEvent.change(input, { target: { value: "bot cleanup 12345678 " } });

    expect(screen.queryByText(t.adminConsole.confirmTitle)).toBeNull();
    expect(runAction).not.toHaveBeenCalled();
  });

  it("runs a non-destructive command on the first Enter", async () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "whoami" } });

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(runAction).toHaveBeenCalledWith("whoami"));
    expect(screen.queryByText(t.adminConsole.confirmTitle)).toBeNull();
  });
});

describe("client-only and result handling", () => {
  it("routes an open command without touching the executor", () => {
    const { input, onClose } = renderPalette();
    fireEvent.change(input, { target: { value: "open admin/catalog" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(router.push).toHaveBeenCalledWith("/admin/catalog");
    expect(onClose).toHaveBeenCalled();
    expect(runAction).not.toHaveBeenCalled();
  });

  it("prints the unknown-command message for an unparsable line", () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "frobnicate" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText(t.adminConsole.result.unknownCommand.replace("{input}", "frobnicate"))).toBeTruthy();
    expect(runAction).not.toHaveBeenCalled();
  });

  it("revalidates and navigates when the outcome asks for it", async () => {
    runAction.mockResolvedValue({ ok: true, message: "saved", navigate: "/admin/seasons", refresh: true });
    const { input, onClose } = renderPalette();
    fireEvent.change(input, { target: { value: "whoami" } });

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.push).toHaveBeenCalledWith("/admin/seasons");
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText("saved")).toBeTruthy();
  });

  it("renders the localized message returned by the action", async () => {
    runAction.mockResolvedValue({ ok: false, message: "No season matches “x”" });
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "season x" } });

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("No season matches “x”")).toBeTruthy());
  });

  it("lists matching command names as suggestions while the name is typed", () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "sea" } });

    expect(screen.getByText("seasons")).toBeTruthy();
    expect(screen.getByText(t.adminConsole.commands.seasons)).toBeTruthy();
    expect(screen.queryByText("whoami")).toBeNull();
    expect(runAction).not.toHaveBeenCalled();
  });

  it("prints the command catalogue in the session for help", () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "help" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getAllByText("game delete <game>").length).toBeGreaterThan(0);
    expect(screen.getAllByText(t.adminConsole.commands.gameDelete).length).toBeGreaterThan(0);
    expect(runAction).not.toHaveBeenCalled();
  });
});
