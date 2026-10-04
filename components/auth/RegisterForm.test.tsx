// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { FormState } from "@/lib/modules/auth/actions/types";

const register = vi.hoisted(() =>
  vi.fn(async (_prev: FormState, _form: FormData): Promise<FormState> => ({})),
);

vi.mock("@/lib/modules/auth/actions/register", () => ({ registerAction: register }));
vi.mock("@/components/ui/toast", () => ({ useActionToast: () => undefined }));

import { RegisterForm } from "./RegisterForm";

const t = getDictionary("en");

const renderForm = (props: {
  invite?: string | null;
  registrationEnabled?: boolean;
  maintenanceMode?: boolean;
} = {}) =>
  render(
    <I18nProvider locale="en" t={t}>
      <RegisterForm {...props} />
    </I18nProvider>,
  );

const submit = () => {
  const form = document.querySelector("form");
  if (!form) throw new Error("register form not rendered");
  fireEvent.submit(form);
};

afterEach(() => {
  cleanup();
  register.mockReset();
  register.mockResolvedValue({});
});

describe("RegisterForm", () => {
  it("renders the email and password fields with their browser validation contract", () => {
    renderForm();
    const email = document.querySelector<HTMLInputElement>('input[name="email"]')!;
    const password = document.querySelector<HTMLInputElement>('input[name="password"]')!;
    expect(email.type).toBe("email");
    expect(email.required).toBe(true);
    expect(password.required).toBe(true);
    expect(password.minLength).toBe(8);
  });

  it("closes registration without an invite when the flag disables it", () => {
    renderForm({ registrationEnabled: false });
    expect(screen.getByText(t.core.auth.registrationClosed)).toBeTruthy();
    expect(screen.getByText(t.core.errors.authRegistrationDisabled)).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
  });

  it("allows an invited signup even while registration is disabled", () => {
    renderForm({ registrationEnabled: false, invite: "tok_123" });
    expect(screen.queryByText(t.core.auth.registrationClosed)).toBeNull();
    const invite = document.querySelector<HTMLInputElement>('input[name="invite"]')!;
    expect(invite.value).toBe("tok_123");
    expect(invite.type).toBe("hidden");
  });

  it("shows the maintenance banner when maintenance mode is on", () => {
    renderForm({ maintenanceMode: true });
    expect(screen.getByText(t.core.maintenance.text)).toBeTruthy();
  });

  it("toggles password visibility", () => {
    renderForm();
    const password = document.querySelector<HTMLInputElement>('input[name="password"]')!;
    fireEvent.click(screen.getByRole("button", { name: t.core.auth.passwordShow }));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: t.core.auth.passwordHide }));
    expect(password.type).toBe("password");
  });

  it("submits the signup payload including the invite token", async () => {
    renderForm({ invite: "tok_123" });
    fireEvent.change(document.querySelector('input[name="email"]')!, {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(document.querySelector('input[name="displayName"]')!, {
      target: { value: "Ada" },
    });
    fireEvent.change(document.querySelector('input[name="password"]')!, {
      target: { value: "correcthorse" },
    });
    submit();
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    const form = register.mock.calls[0]![1];
    expect(form.get("email")).toBe("ada@example.com");
    expect(form.get("displayName")).toBe("Ada");
    expect(form.get("password")).toBe("correcthorse");
    expect(form.get("invite")).toBe("tok_123");
  });

  it("renders the action error", async () => {
    register.mockResolvedValue({ error: "Email already registered" });
    renderForm();
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Email already registered");
  });

  it("renders the success message and the dev verification link", async () => {
    register.mockResolvedValue({
      ok: "registrationCheckEmail",
      debug: "http://localhost:3000/verify-email?token=abc",
    });
    renderForm();
    submit();
    expect(
      await screen.findByText(t.core.errors.registrationCheckEmail),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: new RegExp(t.core.auth.openVerificationLink, "i") });
    expect(link.getAttribute("href")).toBe("http://localhost:3000/verify-email?token=abc");
  });

  it("links back to the login page", () => {
    renderForm();
    expect(screen.getByRole("link", { name: new RegExp(t.core.auth.goToLogin, "i") }).getAttribute("href")).toBe(
      "/login",
    );
  });
});
