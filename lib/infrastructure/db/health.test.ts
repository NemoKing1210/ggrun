import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  execute: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/infrastructure/db", () => ({
  db: { execute: (...args: unknown[]) => state.execute(...args) },
}));

vi.mock("@/lib/infrastructure/logger", () => ({
  log: {
    child: () => ({ warn: state.warn, error: state.error, info: vi.fn(), debug: vi.fn() }),
  },
}));

import { isDbAvailable, isDbConnectionError } from "./health";

const OK_TTL_MS = 30_000;
const FAIL_TTL_MS = 3_000;
const PROBE_TIMEOUT_MS = 5_000;

beforeEach(() => {
  vi.useFakeTimers();
  state.execute.mockReset();
  state.warn.mockReset();
  state.error.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isDbConnectionError", () => {
  it("recognizes every connection errno code", () => {
    for (const code of [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "ENETUNREACH",
    ]) {
      expect(isDbConnectionError(Object.assign(new Error("db failure"), { code }))).toBe(true);
    }
  });

  it("recognizes connection failures by message when no code is set", () => {
    expect(isDbConnectionError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(true);
    expect(isDbConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isDbConnectionError(new Error("connect timeout"))).toBe(true);
    expect(isDbConnectionError(new Error("the database system is starting up"))).toBe(true);
  });

  it("walks the cause chain that Drizzle wraps driver errors in", () => {
    const wrapped = new Error("DrizzleQueryError", {
      cause: Object.assign(new Error("db failure"), { code: "ECONNREFUSED" }),
    });
    const deeper = new Error("query failed", { cause: wrapped });
    expect(isDbConnectionError(deeper)).toBe(true);
  });

  it("rejects unrelated errors and non-errors", () => {
    expect(isDbConnectionError(new Error("syntax error at or near"))).toBe(false);
    expect(
      isDbConnectionError(Object.assign(new Error("unique violation"), { code: "23505" })),
    ).toBe(false);
    expect(isDbConnectionError("ECONNREFUSED")).toBe(false);
    expect(isDbConnectionError(null)).toBe(false);
    expect(isDbConnectionError(undefined)).toBe(false);
    expect(isDbConnectionError(new Error("outer", { cause: "ECONNREFUSED" }))).toBe(false);
  });
});

describe("isDbAvailable", () => {
  it("probes once and trusts the success for the OK ttl", async () => {
    vi.setSystemTime(1_700_000_000_000);
    state.execute.mockResolvedValue([{ ok: 1 }]);

    await expect(isDbAvailable()).resolves.toBe(true);
    expect(state.execute).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_700_000_000_000 + OK_TTL_MS - 1);
    await expect(isDbAvailable()).resolves.toBe(true);
    expect(state.execute).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_700_000_000_000 + OK_TTL_MS + 1);
    await expect(isDbAvailable()).resolves.toBe(true);
    expect(state.execute).toHaveBeenCalledTimes(2);
  });

  it("reports false and fast-rejects further probes during the failure ttl", async () => {
    vi.setSystemTime(1_700_100_000_000);
    state.execute.mockRejectedValue(
      Object.assign(new Error("db failure"), { code: "ECONNREFUSED" }),
    );

    await expect(isDbAvailable()).resolves.toBe(false);
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.warn).toHaveBeenCalledTimes(1);
    expect(state.error).not.toHaveBeenCalled();

    vi.setSystemTime(1_700_100_000_000 + FAIL_TTL_MS - 1);
    await expect(isDbAvailable()).resolves.toBe(false);
    expect(state.execute).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_700_100_000_000 + FAIL_TTL_MS + 1);
    await expect(isDbAvailable()).resolves.toBe(false);
    expect(state.execute).toHaveBeenCalledTimes(2);
  });

  it("logs non-connection probe failures as errors instead of warnings", async () => {
    vi.setSystemTime(1_700_200_000_000);
    state.execute.mockRejectedValue(new Error("permission denied for table"));

    await expect(isDbAvailable()).resolves.toBe(false);
    expect(state.error).toHaveBeenCalledTimes(1);
    expect(state.warn).not.toHaveBeenCalled();
  });

  it("treats a hung probe as unavailable after the timeout", async () => {
    vi.setSystemTime(1_700_300_000_000);
    const hung = Promise.withResolvers<never>();
    state.execute.mockImplementation(() => hung.promise);

    const probe = isDbAvailable();
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    await expect(probe).resolves.toBe(false);
  });
});
