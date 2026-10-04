// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { AddUserModal } from "@/components/admin/AddUserModal";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createUserAction } from "@/lib/modules/player/actions";

vi.mock("@/lib/modules/player/actions", () => ({
  createUserAction: vi.fn(),
}));

const t = getDictionary("en");
const u = t.admin.users;

const createUserMock = vi.mocked(createUserAction);

function renderModal() {
  return render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>
        <AddUserModal />
      </ToastProvider>
    </I18nProvider>,
  );
}

function openModal() {
  const utils = renderModal();
  fireEvent.click(screen.getByRole("button", { name: u.addHeading }));
  return utils;
}

beforeEach(() => {
  createUserMock.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddUserModal", () => {
  it("opens the modal through a portal only after the add button is clicked", async () => {
    const { container } = renderModal();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("form")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: u.addHeading }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(u.addHeading);
    // Rendered via createPortal to document.body, outside the render container.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("submits createUserAction with the entered email/username/password/displayName/role", async () => {
    openModal();
    const dialog = await screen.findByRole("dialog");
    const form = dialog.querySelector("form");
    expect(form).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText("user@example.com"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("player_one"), {
      target: { value: "new_player" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "supersecret" },
    });
    fireEvent.change(screen.getByPlaceholderText(t.core.auth.displayName), {
      target: { value: "New Player" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "judge" } });

    await waitFor(() => expect(form).not.toBeNull());
    fireEvent.submit(form!);

    await waitFor(() => expect(createUserMock).toHaveBeenCalledTimes(1));
    const [, formData] = createUserMock.mock.calls[0];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("email")).toBe("new@example.com");
    expect(formData.get("username")).toBe("new_player");
    expect(formData.get("password")).toBe("supersecret");
    expect(formData.get("displayName")).toBe("New Player");
    expect(formData.get("role")).toBe("judge");
  });

  it("lists admin/judge/player/viewer in the role select", async () => {
    openModal();
    await screen.findByRole("dialog");

    const select = screen.getByRole("combobox");
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      u.roles.admin,
      u.roles.judge,
      u.roles.player,
      u.roles.viewer,
    ]);
    expect((select as HTMLSelectElement).value).toBe("player");
  });

  it("renders a returned error string with role=alert", async () => {
    createUserMock.mockResolvedValueOnce({ error: "Email already registered" });
    openModal();
    const dialog = await screen.findByRole("dialog");
    fireEvent.submit(dialog.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Email already registered");
  });

  it("renders the success text returned by the action", async () => {
    createUserMock.mockResolvedValueOnce({ ok: u.userAdded });
    openModal();
    const dialog = await screen.findByRole("dialog");
    fireEvent.submit(dialog.querySelector("form")!);

    await waitFor(() =>
      expect(screen.getByText(u.userAdded).textContent).toBe(u.userAdded),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
