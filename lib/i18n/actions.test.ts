import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookies: vi.fn(),
  revalidatePath: vi.fn(),
  setUserLocale: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: state.cookies }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("@/lib/modules/player/service", () => ({ setUserLocale: state.setUserLocale }));

import { LOCALE_COOKIE } from "@/lib/i18n/config";

import { setLocaleAction } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  state.cookies.mockResolvedValue({ set: vi.fn() });
});

describe("setLocaleAction", () => {
  it("ignores an unsupported locale", async () => {
    await setLocaleAction("de");

    expect(state.setUserLocale).not.toHaveBeenCalled();
    expect(state.cookies).not.toHaveBeenCalled();
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });

  it("persists the locale, writes the cookie and revalidates the layout", async () => {
    const set = vi.fn();
    state.cookies.mockResolvedValue({ set });

    await setLocaleAction("uk");

    expect(state.setUserLocale).toHaveBeenCalledWith("uk");
    expect(set).toHaveBeenCalledWith(
      LOCALE_COOKIE,
      "uk",
      expect.objectContaining({ path: "/", sameSite: "lax" }),
    );
    expect(state.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("saves the preference before touching the cookie", async () => {
    const set = vi.fn();
    state.cookies.mockResolvedValue({ set });

    await setLocaleAction("ru");

    expect(state.setUserLocale.mock.invocationCallOrder[0]).toBeLessThan(set.mock.invocationCallOrder[0]!);
  });

  it("propagates a persistence failure without writing the cookie", async () => {
    const set = vi.fn();
    state.cookies.mockResolvedValue({ set });
    state.setUserLocale.mockRejectedValue(new Error("db down"));

    await expect(setLocaleAction("ru")).rejects.toThrow("db down");
    expect(set).not.toHaveBeenCalled();
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });
});
