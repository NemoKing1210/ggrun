import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: state.cookies, headers: state.headers }));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: state.getCurrentUser }));

import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { getLocale, getT } from "./server";

function jar(value?: string) {
  return { get: vi.fn((name: string) => (name === LOCALE_COOKIE && value !== undefined ? { value } : undefined)) };
}

function header(value: string | null) {
  return { get: vi.fn((name: string) => (name === "accept-language" ? value : null)) };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.getCurrentUser.mockResolvedValue(null);
  state.cookies.mockResolvedValue(jar());
  state.headers.mockResolvedValue(header(null));
});

describe("getLocale", () => {
  it("prefers the session user's locale", async () => {
    state.getCurrentUser.mockResolvedValue({ id: "u1", locale: "uk" } as never);
    state.cookies.mockResolvedValue(jar("ru"));

    expect(await getLocale()).toBe("uk");
    expect(state.cookies).not.toHaveBeenCalled();
  });

  it("ignores an unsupported user locale and falls back to the cookie", async () => {
    state.getCurrentUser.mockResolvedValue({ id: "u1", locale: "fr" } as never);
    state.cookies.mockResolvedValue(jar("ru"));

    expect(await getLocale()).toBe("ru");
  });

  it("uses the cookie when there is no session", async () => {
    state.cookies.mockResolvedValue(jar("uk"));
    expect(await getLocale()).toBe("uk");
  });

  it("negotiates the Accept-Language header when the cookie is missing or unsupported", async () => {
    state.cookies.mockResolvedValue(jar("de"));
    state.headers.mockResolvedValue(header("uk-UA, ru;q=0.8"));

    expect(await getLocale()).toBe("uk");
  });

  it("defaults to en when nothing is available", async () => {
    expect(await getLocale()).toBe("en");
  });
});

describe("getT", () => {
  it("pairs the resolved locale with its dictionary", async () => {
    state.cookies.mockResolvedValue(jar("ru"));

    const { locale, t } = await getT();

    expect(locale).toBe("ru");
    expect(t).toBe(getDictionary("ru"));
  });

  it("falls back to the default dictionary for the default locale", async () => {
    const { locale, t } = await getT();
    expect(locale).toBe("en");
    expect(t).toBe(getDictionary("en"));
  });
});
