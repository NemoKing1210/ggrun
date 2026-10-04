import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/http/external-fetch", () => ({
  fetchExternal: vi.fn(),
}));

import { fetchExternal } from "@/lib/infrastructure/http/external-fetch";

import { providerFetch, withTimeout } from "./adapter";

const fetchMock = vi.mocked(fetchExternal);

const ok = () => new Response("{}", { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("providerFetch", () => {
  it("caches for the configured TTL via next.revalidate", async () => {
    fetchMock.mockResolvedValue(ok());

    const res = await providerFetch("https://api.example/games", { cacheTtlHours: 5 });

    expect(res?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]).toEqual({ next: { revalidate: 18000 } });
  });

  it("defaults to a 24 hour revalidate", async () => {
    fetchMock.mockResolvedValue(ok());

    await providerFetch("https://api.example/games");

    expect(fetchMock.mock.calls[0]![1]).toEqual({ next: { revalidate: 86400 } });
  });

  it("clamps a sub-minute TTL up to 60 seconds", async () => {
    fetchMock.mockResolvedValue(ok());

    await providerFetch("https://api.example/games", { cacheTtlHours: 0.001 });

    expect(fetchMock.mock.calls[0]![1]).toEqual({ next: { revalidate: 60 } });
  });

  it("disables caching when the TTL is zero", async () => {
    fetchMock.mockResolvedValue(ok());

    await providerFetch("https://api.example/games", { cacheTtlHours: 0 });

    expect(fetchMock.mock.calls[0]![1]).toEqual({ cache: "no-store" });
  });

  it("returns null on a client error without retrying", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));

    await expect(providerFetch("https://api.example/games", { retries: 2 })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx and gives up after the retry budget", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 503 }));

    await expect(providerFetch("https://api.example/games", { retries: 1 })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown network error and then returns null", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    await expect(providerFetch("https://api.example/games", { retries: 1 })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("succeeds on a retry after a transient failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("flaky")).mockResolvedValueOnce(ok());

    const res = await providerFetch("https://api.example/games", { retries: 1 });

    expect(res?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes one retry by default", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));

    await expect(providerFetch("https://api.example/games")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the inner value when it settles in time", async () => {
    const p = withTimeout(Promise.resolve("done"), 1000);
    await expect(p).resolves.toBe("done");
  });

  it("rejects with a timeout when the promise is too slow", async () => {
    const p = withTimeout(new Promise<string>(() => {}), 500);
    const assertion = expect(p).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it("propagates the inner rejection unchanged", async () => {
    const p = withTimeout(Promise.reject(new Error("inner")), 1000);
    await expect(p).rejects.toThrow("inner");
  });
});
