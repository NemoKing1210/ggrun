import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AdminError } from "@/lib/modules/season/service/errors";

const h = vi.hoisted(() => ({
  getT: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/i18n/server", () => ({ getT: h.getT }));

vi.mock("@/lib/infrastructure/logger", () => ({
  log: {
    warn: h.warn,
    error: h.error,
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: () => ({ warn: h.warn, error: h.error, info: vi.fn(), debug: vi.fn() }),
  },
}));

import { makeToError, zodToMessage } from "./action-error";

const toError = makeToError(AdminError);

beforeEach(() => {
  h.getT.mockReset();
  h.getT.mockResolvedValue({
    locale: "en",
    t: {
      core: {
        errors: {
          formUnknown: "Unknown error",
          adminSeasonNotFound: "Season {id} not found",
          adminStaffRequired: "Staff only",
        },
      },
    },
  });
  h.warn.mockReset();
  h.error.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function zodError(parse: () => { success: boolean; error?: unknown }): z.ZodError {
  const result = parse();
  if (!(result.error instanceof z.ZodError)) throw new Error("expected a ZodError");
  return result.error;
}

describe("zodToMessage", () => {
  it("prefixes the first issue with its dotted path", () => {
    const error = zodError(() => z.object({ displayName: z.string().max(3) }).safeParse({ displayName: "abcd" }));
    const issue = error.issues[0]!;
    expect(zodToMessage(error).user).toBe(`displayName: ${issue.message}`);
  });

  it("joins numeric path segments for nested arrays", () => {
    const error = zodError(() => z.object({ items: z.array(z.number()) }).safeParse({ items: [1, "x"] }));
    const issue = error.issues[0]!;
    expect(issue.path).toEqual(["items", 1]);
    expect(zodToMessage(error).user).toBe(`items.1: ${issue.message}`);
  });

  it("omits the path prefix when the first issue is at the root", () => {
    const error = zodError(() => z.string().max(2).safeParse("abcd"));
    expect(zodToMessage(error).user).toBe(error.issues[0]!.message);
  });

  it("hides the debug dump outside development", () => {
    const error = zodError(() => z.string().max(2).safeParse("abcd"));
    expect(zodToMessage(error).debug).toBeUndefined();
  });

  it("exposes all issues as JSON in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const error = zodError(() => z.object({ a: z.string() }).safeParse({}));
    const { debug } = zodToMessage(error);
    expect(debug).toBeDefined();
    const parsed = JSON.parse(debug!) as { path: unknown[] }[];
    expect(parsed).toHaveLength(error.issues.length);
  });
});

describe("toError", () => {
  it("maps a domain error through the dictionary with its params", async () => {
    const state = await toError(new AdminError("adminSeasonNotFound", { id: "s-9" }), "createSeason");

    expect(state.error).toBe("Season s-9 not found");
    expect(state.debug).toBeUndefined();
    expect(h.warn).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it("falls back to formUnknown for a code with no dictionary entry", async () => {
    const state = await toError(new AdminError("totallyUnknown" as never), "createSeason");
    expect(state.error).toBe("Unknown error");
  });

  it("adds a dev-only debug dump for domain errors", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const state = await toError(new AdminError("adminStaffRequired"), "blockUser");
    expect(state.error).toBe("Staff only");
    expect(state.debug).toContain("AdminError");
    expect(state.debug).toContain("adminStaffRequired");
  });

  it("returns formUnknown and logs unknown Error throws", async () => {
    const state = await toError(new Error("kaboom"), "deletePlayer", { playerId: "p1" });

    expect(state.error).toBe("Unknown error");
    expect(state.debug).toBeUndefined();
    expect(h.error).toHaveBeenCalledTimes(1);
    const [event, ctx] = h.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe("action.failed");
    expect(ctx).toMatchObject({ action: "deletePlayer", playerId: "p1" });
  });

  it("returns formUnknown and logs non-Error throws", async () => {
    const state = await toError("boom", "weirdAction");

    expect(state.error).toBe("Unknown error");
    expect(h.error).toHaveBeenCalledTimes(1);
    const [event, ctx] = h.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe("action.unknown_failure");
    expect(ctx).toMatchObject({ action: "weirdAction", value: "boom" });
  });

  it("turns a ZodError into the first issue message and warns", async () => {
    const error = zodError(() => z.object({ title: z.string().min(3) }).safeParse({ title: "x" }));
    const state = await toError(error, "createGame");

    expect(state.error).toBe(`title: ${error.issues[0]!.message}`);
    expect(state.debug).toBeUndefined();
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(h.warn.mock.calls[0]![0]).toBe("action.validation_failed");
  });

  it("includes the Zod issues in the dev debug dump", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const error = zodError(() => z.object({ title: z.string().min(3) }).safeParse({ title: "x" }));
    const state = await toError(error, "createGame");
    expect(state.debug).toBeDefined();
    const parsed = JSON.parse(state.debug!) as unknown[];
    expect(parsed).toHaveLength(error.issues.length);
  });
});
