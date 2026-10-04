// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/dictionaries";
import { ToastProvider } from "@/components/ui/toast";
import {
  createInviteAction,
  testProxyAction,
  updateProviderKeysAction,
  updateSiteSettingsAction,
} from "@/lib/modules/site-settings/actions";

import { GlobalSettingsForm } from "./GlobalSettingsForm";

vi.mock("@/lib/modules/site-settings/actions", () => ({
  createInviteAction: vi.fn(),
  testProxyAction: vi.fn(),
  updateProviderKeysAction: vi.fn(),
  updateSiteSettingsAction: vi.fn(),
}));

const t = getDictionary("en");
const s = t.admin.siteSettings;

type Mode = "open" | "manual_approval" | "email_link";

type Settings = {
  registrationEnabled: boolean;
  registrationMode: Mode;
  maintenanceMode: boolean;
};

type ProviderKeys = {
  rawgApiKeyMasked: string | null;
  igdbClientIdMasked: string | null;
  igdbClientSecretMasked: string | null;
  steamApiKeyMasked: string | null;
  gamespotApiKeyMasked: string | null;
  proxyUrlMasked: string | null;
  proxyUrlDbValue: string | null;
  proxyUrlEnvRaw: string | null;
  proxyUrlEnvMasked: string | null;
  hasDb: { rawg: boolean; igdb: boolean; steam: boolean; gamespot: boolean; proxy: boolean };
  hasEnv: { rawg: boolean; igdb: boolean; steam: boolean; gamespot: boolean; proxy: boolean };
};

type Invite = {
  id: string;
  token: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string | null;
  createdAt: string;
};

type PendingUser = {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  isApproved: boolean;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  createdAt: string;
};

const updateSettings = vi.mocked(updateSiteSettingsAction);
const createInvite = vi.mocked(createInviteAction);
const updateKeys = vi.mocked(updateProviderKeysAction);
const testProxy = vi.mocked(testProxyAction);

const clipboardWrite = vi.fn((_text: string) => Promise.resolve());

const initial: Settings = {
  registrationEnabled: true,
  registrationMode: "open",
  maintenanceMode: false,
};

function makeKeys(overrides: Partial<ProviderKeys> = {}): ProviderKeys {
  return {
    rawgApiKeyMasked: null,
    igdbClientIdMasked: null,
    igdbClientSecretMasked: null,
    steamApiKeyMasked: null,
    gamespotApiKeyMasked: null,
    proxyUrlMasked: null,
    proxyUrlDbValue: null,
    proxyUrlEnvRaw: null,
    proxyUrlEnvMasked: null,
    hasDb: { rawg: false, igdb: false, steam: false, gamespot: false, proxy: false },
    hasEnv: { rawg: false, igdb: false, steam: false, gamespot: false, proxy: false },
    ...overrides,
  };
}

function renderForm(props: Partial<ComponentProps<typeof GlobalSettingsForm>> = {}) {
  return render(
    <ToastProvider>
      <GlobalSettingsForm
        initial={initial}
        invites={[]}
        pending={[]}
        t={t}
        baseUrl="https://example.com/"
        {...props}
      />
    </ToastProvider>,
  );
}

function firstForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector("form");
  if (!form) throw new Error("expected a form to be rendered");
  return form;
}

beforeEach(() => {
  updateSettings.mockReset();
  createInvite.mockReset();
  updateKeys.mockReset();
  testProxy.mockReset();
  updateSettings.mockResolvedValue({});
  createInvite.mockResolvedValue({});
  updateKeys.mockResolvedValue({});
  testProxy.mockResolvedValue({});

  clipboardWrite.mockReset();
  clipboardWrite.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboardWrite },
    configurable: true,
  });
});

afterEach(cleanup);

describe("GlobalSettingsForm tabs", () => {
  it("reveals the panel that matches the clicked tab", () => {
    const { container } = renderForm({ providerKeys: makeKeys() });

    expect(screen.getByRole("heading", { name: s.generalHeading }).textContent).toBe(s.generalHeading);

    fireEvent.click(screen.getByRole("button", { name: "Registration" }));
    expect(screen.getByRole("heading", { name: s.registrationHeading }).textContent).toBe(s.registrationHeading);
    expect(screen.queryByRole("heading", { name: s.generalHeading })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));
    expect(screen.getByRole("heading", { name: s.integrationsHeading }).textContent).toBe(s.integrationsHeading);

    fireEvent.click(screen.getByRole("button", { name: "Proxy" }));
    expect(screen.getByRole("heading", { name: s.proxyHeading }).textContent).toBe(s.proxyHeading);

    fireEvent.click(screen.getByRole("button", { name: "Invites" }));
    expect(screen.getByRole("heading", { name: s.invitesHeading }).textContent).toBe(s.invitesHeading);

    fireEvent.click(screen.getByRole("button", { name: "Pending" }));
    expect(screen.getByRole("heading", { name: s.pendingHeading }).textContent).toBe(s.pendingHeading);
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("GlobalSettingsForm status strip", () => {
  it("flips the maintenance strip and reveals the lock warning", () => {
    renderForm();
    expect(screen.getByText(s.maintenanceInactive)).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: s.maintenanceLabel }));

    expect(screen.getByText(s.maintenanceActive)).toBeTruthy();
    expect(screen.queryByText(s.maintenanceInactive)).toBeNull();
    expect(screen.getAllByText(new RegExp(s.maintenanceActive)).length).toBeGreaterThan(1);
  });

  it("flips the registration status when the registration switch is toggled", () => {
    renderForm();
    expect(screen.getByText("Registration OPEN")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: s.registrationEnabledLabel }));

    expect(screen.getByText("Registration CLOSED")).toBeTruthy();
    expect(screen.queryByText("Registration OPEN")).toBeNull();
  });

  it("marks the picked registration-mode card as selected", () => {
    renderForm();
    const openCard = screen.getByRole("button", { name: new RegExp(s.modes.open) });
    const manualCard = screen.getByRole("button", { name: new RegExp(s.modes.manual) });

    expect(openCard.className).toContain("bg-amber");
    expect(manualCard.className).not.toContain("bg-amber");

    fireEvent.click(manualCard);

    expect(manualCard.className).toContain("bg-amber");
    expect(openCard.className).not.toContain("bg-amber");
  });
});

describe("GlobalSettingsForm general submit", () => {
  it("submits the live toggle state through updateSiteSettingsAction", () => {
    const { container } = renderForm();

    fireEvent.click(screen.getByRole("switch", { name: s.maintenanceLabel }));
    fireEvent.click(screen.getByRole("switch", { name: s.registrationEnabledLabel }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(s.modes.email) }));

    fireEvent.submit(firstForm(container));

    expect(updateSettings).toHaveBeenCalledTimes(1);
    const [, formData] = updateSettings.mock.calls[0];
    expect(formData.get("maintenanceMode")).toBe("true");
    expect(formData.get("registrationEnabled")).toBe("false");
    expect(formData.get("registrationMode")).toBe("email_link");
  });
});

describe("GlobalSettingsForm invites", () => {
  it("creates an invite with the picked max uses and expiry", () => {
    const { container } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Invites" }));

    const form = firstForm(container);
    const maxUses = form.querySelector('select[name="maxUses"]');
    const expires = form.querySelector('select[name="expires"]');
    if (!maxUses || !expires) throw new Error("invite selects missing");
    fireEvent.change(maxUses, { target: { value: "5" } });
    fireEvent.change(expires, { target: { value: "24h" } });

    fireEvent.submit(form);

    expect(createInvite).toHaveBeenCalledTimes(1);
    const [, formData] = createInvite.mock.calls[0];
    expect(formData.get("maxUses")).toBe("5");
    expect(formData.get("expires")).toBe("24h");
  });

  it("copies the built invite link for an existing invite", async () => {
    const invite: Invite = {
      id: "inv-1",
      token: "tok/with space",
      maxUses: 5,
      usesCount: 1,
      expiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    };
    renderForm({ invites: [invite] });
    fireEvent.click(screen.getByRole("button", { name: "Invites" }));

    const expected = "https://example.com/register?invite=tok%2Fwith%20space";
    expect(screen.getByText(expected)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${s.inviteCopy}$`) }));
    });

    expect(clipboardWrite).toHaveBeenCalledWith(expected);
    await waitFor(() => expect(screen.getByText(s.inviteCopied)).toBeTruthy());
  });

  it("shows the empty invite hint when there are none", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Invites" }));
    expect(screen.getByText(s.inviteEmpty)).toBeTruthy();
  });
});

describe("GlobalSettingsForm pending users", () => {
  const pending: PendingUser[] = [
    {
      id: "u-approval",
      email: "alice@example.com",
      username: "alice",
      displayName: "Alice A.",
      isApproved: false,
      emailVerified: false,
      emailVerificationToken: null,
      createdAt: new Date("2026-02-01T10:00:00Z").toISOString(),
    },
    {
      id: "u-verify",
      email: "bob@example.com",
      username: "bob",
      displayName: null,
      isApproved: false,
      emailVerified: false,
      emailVerificationToken: "vtok-1",
      createdAt: new Date("2026-02-02T10:00:00Z").toISOString(),
    },
  ];

  it("counts pending users on the tab and renders each status", () => {
    renderForm({ pending });
    expect(screen.getByRole("button", { name: /Pending \(2\)/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Pending \(2\)/ }));

    expect(screen.getByText("Alice A.")).toBeTruthy();
    expect(screen.getByText(`@alice · alice@example.com`)).toBeTruthy();
    expect(screen.getByText("bob")).toBeTruthy();
    expect(screen.getByText(s.pendingApproval)).toBeTruthy();
    expect(screen.getByText(s.pendingVerification)).toBeTruthy();
  });

  it("builds the verification link and copies it", async () => {
    renderForm({ pending: [pending[1]!] });
    fireEvent.click(screen.getByRole("button", { name: /Pending \(1\)/ }));

    const expected = "https://example.com/verify-email?token=vtok-1";
    expect(screen.getByText(expected)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${s.inviteCopy}$`) }));
    });

    expect(clipboardWrite).toHaveBeenCalledWith(expected);
  });
});

describe("GlobalSettingsForm proxy", () => {
  it("runs the proxy test and surfaces the ok then error message", async () => {
    testProxy.mockResolvedValueOnce({ ok: "Proxy OK — reachable" });
    renderForm({
      providerKeys: makeKeys({
        hasDb: { rawg: false, igdb: false, steam: false, gamespot: false, proxy: true },
        proxyUrlDbValue: "http://proxy.local:8080",
        proxyUrlMasked: "http://proxy.local:8080",
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Proxy" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(s.proxyTest) }));
    });

    expect(testProxy).toHaveBeenCalledTimes(1);
    const [, formData] = testProxy.mock.calls[0];
    expect(formData.get("proxyUrl")).toBe("http://proxy.local:8080");
    await screen.findByText(/Proxy OK — reachable/);

    testProxy.mockResolvedValueOnce({ error: "connection refused" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(s.proxyTest) }));
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("connection refused");
  });
});

describe("GlobalSettingsForm provider keys", () => {
  const keys = makeKeys({
    hasDb: { rawg: true, igdb: false, steam: false, gamespot: false, proxy: false },
    rawgApiKeyMasked: "rawg-secret-1234",
  });

  it("toggles a provider key input between password and text", () => {
    renderForm({ providerKeys: keys });
    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));

    const input = screen.getByLabelText(s.rawgApiKeyLabel) as HTMLInputElement;
    expect(input.type).toBe("password");

    const toggle = input.parentElement?.querySelector("button");
    if (!toggle) throw new Error("show/hide toggle missing");

    fireEvent.click(toggle);
    expect(input.type).toBe("text");

    fireEvent.click(toggle);
    expect(input.type).toBe("password");
  });

  it("submits a clear flag as an empty value and keeps untouched keys", () => {
    const { container } = renderForm({ providerKeys: keys });
    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));

    fireEvent.click(screen.getByRole("button", { name: s.clearOverrideFallback }));

    const input = screen.getByLabelText(s.rawgApiKeyLabel) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText(s.willClearDb)).toBeTruthy();

    fireEvent.submit(firstForm(container));

    expect(updateKeys).toHaveBeenCalledTimes(1);
    const [, formData] = updateKeys.mock.calls[0];
    expect(formData.get("rawgApiKey")).toBe("");
    expect(formData.get("igdbClientId")).toBe("__KEEP__");
    expect(formData.get("steamApiKey")).toBe("__KEEP__");
  });
});
