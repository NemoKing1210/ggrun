// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { MAX_BIO_LENGTH } from "@/lib/shared/constants/profile";
import { ACCENT_KEYS } from "@/lib/shared/ui/accent";
import { ToastProvider } from "@/components/ui/toast";

import { SettingsForm } from "./SettingsForm";

const t = getDictionary("en");

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

const updateUserSettingsAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/modules/player/actions", () => ({
  updateUserSettingsAction,
  revokeOwnSessionAction: vi.fn(),
  revokeOtherSessionsAction: vi.fn(),
}));

type FormState = { ok?: string; error?: string; debug?: string };

type FormProps = {
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accent: string | null;
  locale: string | null;
  links: unknown;
};

beforeEach(() => {
  router.refresh.mockClear();
  updateUserSettingsAction.mockReset();
  updateUserSettingsAction.mockResolvedValue({} as FormState);
});

afterEach(cleanup);

const defaultUser: FormProps = {
  displayName: "Ada",
  bio: "Hi there",
  avatarUrl: "",
  bannerUrl: "",
  accent: "amber",
  locale: "en",
  links: [],
};

function renderForm(overrides: Partial<FormProps> = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>
        <SettingsForm {...defaultUser} {...overrides} />
      </ToastProvider>
    </I18nProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: t.settings.save });
const bioField = () => screen.getByRole("textbox", { name: new RegExp(t.settings.bioLabel) });

describe("SettingsForm", () => {
  it("prefills the identity fields from props", () => {
    renderForm();
    expect((screen.getByLabelText(t.settings.displayNameLabel) as HTMLInputElement).value).toBe(
      "Ada",
    );
    expect((bioField() as HTMLTextAreaElement).value).toBe("Hi there");
    expect(screen.getByText(`${"Hi there".length} / ${MAX_BIO_LENGTH}`)).toBeTruthy();
  });

  it("updates the bio counter while typing", () => {
    renderForm({ bio: "" });
    fireEvent.change(bioField(), { target: { value: "abcd" } });
    expect(screen.getByText(`4 / ${MAX_BIO_LENGTH}`)).toBeTruthy();
  });

  it("marks the saved accent active and switches on click", () => {
    renderForm({ accent: "rust" });
    const rust = screen.getByTitle(t.settings.accentNames.rust);
    expect(rust.getAttribute("aria-pressed")).toBe("true");
    const target = ACCENT_KEYS.find((key) => key !== "rust");
    if (!target) throw new Error("expected another accent key");
    const other = screen.getByTitle(t.settings.accentNames[target]);
    expect(other.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(other);
    expect(other.getAttribute("aria-pressed")).toBe("true");
    expect(rust.getAttribute("aria-pressed")).toBe("false");
  });

  it("marks the saved locale active and switches on click", () => {
    renderForm({ locale: "en" });
    const en = screen.getByRole("button", { name: "English" });
    const ru = screen.getByRole("button", { name: "Русский" });
    expect(en.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(ru);
    expect(ru.getAttribute("aria-pressed")).toBe("true");
    expect(en.getAttribute("aria-pressed")).toBe("false");
  });

  it("flags a link whose host does not match the selected network", () => {
    renderForm({ links: [{ network: "twitch", url: "https://evil.example/x" }] });
    const expected = format(t.settings.linkUrlMismatch, {
      network: t.settings.network.twitch,
    });
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("blocks submit and reports a mismatch once for a bad link", async () => {
    renderForm({ links: [{ network: "twitch", url: "https://evil.example/x" }] });
    fireEvent.click(saveButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      format(t.settings.linkUrlMismatch, { network: t.settings.network.twitch }),
    );
    expect(updateUserSettingsAction).not.toHaveBeenCalled();
  });

  it("submits the edited values as form data", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(t.settings.displayNameLabel), {
      target: { value: "New Name" },
    });
    fireEvent.change(bioField(), { target: { value: "New bio" } });
    const ru = screen.getByRole("button", { name: "Русский" });
    fireEvent.click(ru);
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateUserSettingsAction).toHaveBeenCalledTimes(1));
    const formData = updateUserSettingsAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("displayName")).toBe("New Name");
    expect(formData.get("bio")).toBe("New bio");
    expect(formData.get("accent")).toBe("amber");
    expect(formData.get("locale")).toBe("ru");
    expect(formData.get("links")).toBe("[]");
  });

  it("serialises only the completed link rows", async () => {
    renderForm({
      links: [
        { network: "twitch", url: "https://twitch.tv/ada" },
        { network: "github", url: "" },
      ],
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateUserSettingsAction).toHaveBeenCalledTimes(1));
    const formData = updateUserSettingsAction.mock.calls[0]?.[1] as FormData;
    expect(JSON.parse(String(formData.get("links")))).toEqual([
      { network: "twitch", url: "https://twitch.tv/ada" },
    ]);
  });

  it("shows the server error and debug block on failure", async () => {
    updateUserSettingsAction.mockResolvedValue({ error: "Save failed", debug: "stack" } as FormState);
    renderForm();
    fireEvent.click(saveButton());
    expect(await screen.findByText("Save failed")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows the success banner and refreshes the router", async () => {
    updateUserSettingsAction.mockResolvedValue({ ok: "Saved!" } as FormState);
    renderForm();
    fireEvent.click(saveButton());
    expect(await screen.findByText("Saved!")).toBeTruthy();
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("rejects a non-image file before reading it", async () => {
    renderForm();
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const avatarInput = fileInputs[1];
    if (!avatarInput) throw new Error("avatar file input missing");
    fireEvent.change(avatarInput, {
      target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByText(t.settings.imageInvalid)).toBeTruthy();
  });

  it("clears a present avatar and banner through their remove buttons", () => {
    renderForm({ avatarUrl: "/a.png", bannerUrl: "/b.png" });
    const removes = screen.getAllByRole("button", { name: t.settings.removeAvatar });
    expect(removes).toHaveLength(2);
    fireEvent.click(removes[0]!);
    fireEvent.click(removes[1]!);
    expect(screen.queryByRole("button", { name: t.settings.removeAvatar })).toBeNull();
  });
});
