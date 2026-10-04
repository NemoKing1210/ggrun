// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { FormState } from "@/lib/modules/auth/actions/types";

const actions = vi.hoisted(() => ({
  login: vi.fn(async (_prev: FormState, _form: FormData): Promise<FormState> => ({})),
  devLogin: vi.fn(async () => {}),
}));

vi.mock("@/lib/modules/auth/actions/login", () => ({ loginAction: actions.login }));
vi.mock("@/lib/infrastructure/auth/dev-login", () => ({ devQuickLoginAction: actions.devLogin }));
vi.mock("@/components/ui/toast", () => ({ useActionToast: () => undefined }));

import { LoginForm } from "./LoginForm";

const t = getDictionary("en");

const renderForm = () =>
  render(
    <I18nProvider locale="en" t={t}>
      <LoginForm />
    </I18nProvider>,
  );

const submit = () => {
  const form = document.querySelector("form");
  if (!form) throw new Error("login form not rendered");
  fireEvent.submit(form);
};

afterEach(() => {
  cleanup();
  actions.login.mockReset();
  actions.login.mockResolvedValue({});
  actions.devLogin.mockReset();
});

describe("LoginForm", () => {
  it("renders both credential fields as required and named for the action", () => {
    renderForm();
    const login = screen.getByPlaceholderText(t.core.auth.loginPlaceholder) as HTMLInputElement;
    const password = document.querySelector<HTMLInputElement>('input[name="password"]')!;
    expect(login.name).toBe("login");
    expect(login.required).toBe(true);
    expect(password.name).toBe("password");
    expect(password.required).toBe(true);
    expect(password.type).toBe("password");
  });

  it("links to the registration page", () => {
    renderForm();
    const link = screen.getByRole("link", { name: new RegExp(t.core.auth.goToRegister, "i") });
    expect(link.getAttribute("href")).toBe("/register");
  });

  it("toggles password visibility", () => {
    renderForm();
    const password = document.querySelector<HTMLInputElement>('input[name="password"]')!;
    fireEvent.click(screen.getByRole("button", { name: t.core.auth.passwordShow }));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: t.core.auth.passwordHide }));
    expect(password.type).toBe("password");
  });

  it("submits the credentials to the login action", async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(t.core.auth.loginPlaceholder), {
      target: { value: "ada" },
    });
    fireEvent.change(document.querySelector('input[name="password"]')!, {
      target: { value: "hunter2" },
    });
    submit();
    await waitFor(() => expect(actions.login).toHaveBeenCalledTimes(1));
    const form = actions.login.mock.calls[0]![1];
    expect(form.get("login")).toBe("ada");
    expect(form.get("password")).toBe("hunter2");
  });

  it("renders the error returned by the action", async () => {
    actions.login.mockResolvedValue({ error: "Invalid credentials" });
    renderForm();
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid credentials");
  });

  it("disables the submit button while the action is pending", async () => {
    actions.login.mockImplementation(() => new Promise<FormState>(() => {}));
    renderForm();
    submit();
    const pendingButton = await screen.findByRole("button", { name: t.core.auth.signingIn });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the dev quick-login shortcuts outside production", () => {
    renderForm();
    expect(screen.getByText(t.core.auth.devQuick)).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(t.core.auth.devAsAdmin, "i") })).toBeTruthy();
  });
});
