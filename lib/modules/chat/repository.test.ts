import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  select: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  whereArgs: [] as unknown[],
  orderByArgs: [] as unknown[][],
  limitArgs: [] as number[],
}));

vi.mock("@/lib/infrastructure/db", () => ({ db: { select: state.select, insert: state.insert } }));

import { createChatMessage, getChatMessages, getChatMessagesCount } from "./repository";

function chainFor(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.leftJoin = () => chain;
  chain.where = (cond: unknown) => {
    state.whereArgs.push(cond);
    return chain;
  };
  chain.orderBy = (...args: unknown[]) => {
    state.orderByArgs.push(args);
    return chain;
  };
  chain.limit = (n: number) => {
    state.limitArgs.push(n);
    return chain;
  };
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

function message(id: string, iso: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u1",
    content: `hello ${id}`,
    createdAt: new Date(iso),
    username: "alice",
    displayName: "Alice",
    avatarUrl: null,
    role: "player",
    ...extra,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.selectRows.length = 0;
  state.whereArgs.length = 0;
  state.orderByArgs.length = 0;
  state.limitArgs.length = 0;
  state.select.mockImplementation(() => chainFor(state.selectRows.shift() ?? []));
  state.insert.mockReturnValue({
    values: (value: unknown) => {
      state.insertValues(value);
      return { returning: state.insertReturning };
    },
  });
  state.insertReturning.mockResolvedValue([{ id: "m-new", createdAt: new Date("2026-01-02T00:00:00Z") }]);
});

describe("getChatMessages", () => {
  it("reads limit + 1 and clamps the requested limit into 1..100", async () => {
    state.selectRows.push([]);
    await getChatMessages({ limit: 500 });
    expect(state.limitArgs).toEqual([101]);

    state.limitArgs.length = 0;
    state.selectRows.push([]);
    await getChatMessages({ limit: 0 });
    expect(state.limitArgs).toEqual([2]);
  });

  it("orders by created-at and id descending", async () => {
    state.selectRows.push([]);
    await getChatMessages({ limit: 10 });
    expect(state.orderByArgs).toHaveLength(1);
    expect(state.orderByArgs[0]).toHaveLength(2);
  });

  it("does not filter when there is no cursor", async () => {
    state.selectRows.push([]);
    await getChatMessages({ limit: 10 });
    expect(state.whereArgs).toEqual([undefined]);
  });

  it("ignores an unparsable cursor date", async () => {
    state.selectRows.push([]);
    await getChatMessages({ limit: 10, before: "not-a-date" });
    expect(state.whereArgs).toEqual([undefined]);
  });

  it("applies a filter for a valid cursor date", async () => {
    state.selectRows.push([]);
    await getChatMessages({ limit: 10, before: "2026-01-02T00:00:00Z" });
    expect(state.whereArgs).toHaveLength(1);
    expect(state.whereArgs[0]).toBeDefined();
  });

  it("reports no more pages and a null cursor for a short page", async () => {
    state.selectRows.push([message("m2", "2026-01-02T00:00:00Z"), message("m1", "2026-01-01T00:00:00Z")]);

    const result = await getChatMessages({ limit: 5 });

    expect(result.hasMore).toBe(false);
    expect(result.nextBefore).toBeNull();
    expect(result.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("trims the page, flags more and points the cursor at the oldest kept message", async () => {
    state.selectRows.push([
      message("m3", "2026-01-03T00:00:00Z"),
      message("m2", "2026-01-02T00:00:00Z"),
      message("m1", "2026-01-01T00:00:00Z"),
    ]);

    const result = await getChatMessages({ limit: 2 });

    expect(result.hasMore).toBe(true);
    expect(result.messages.map((m) => m.id)).toEqual(["m2", "m3"]);
    expect(result.nextBefore).toBe("2026-01-02T00:00:00.000Z");
  });

  it("passes the joined row fields through unchanged", async () => {
    state.selectRows.push([message("m1", "2026-01-01T00:00:00Z", { displayName: null, role: "judge" })]);

    const result = await getChatMessages({ limit: 5 });

    expect(result.messages[0]).toMatchObject({
      id: "m1",
      userId: "u1",
      username: "alice",
      displayName: null,
      role: "judge",
    });
  });
});

describe("createChatMessage", () => {
  it("rejects empty or whitespace-only content before querying", async () => {
    await expect(createChatMessage({ userId: "u1", content: "   " })).rejects.toThrow("EMPTY_CONTENT");
    expect(state.select).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("rejects content longer than 1000 characters", async () => {
    await expect(createChatMessage({ userId: "u1", content: "x".repeat(1001) })).rejects.toThrow(
      "CONTENT_TOO_LONG",
    );
  });

  it("rate-limits the ninth message inside the window", async () => {
    state.selectRows.push(Array.from({ length: 8 }, (_, i) => ({ id: `m${i}` })));

    await expect(createChatMessage({ userId: "u1", content: "hi" })).rejects.toThrow("RATE_LIMITED");
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("stores the trimmed content and returns the re-read joined row", async () => {
    state.selectRows.push([]); // rate-limit probe
    state.selectRows.push([message("m-new", "2026-01-02T00:00:00Z", { content: "hi there" })]);

    const result = await createChatMessage({ userId: "u1", content: "  hi there  " });

    expect(state.insertValues).toHaveBeenCalledWith({ userId: "u1", content: "hi there" });
    expect(result).toMatchObject({ id: "m-new", content: "hi there", username: "alice" });
    // The rate probe is capped at 10 recent rows.
    expect(state.limitArgs).toContain(10);
  });
});

describe("getChatMessagesCount", () => {
  it("coerces the count to a number", async () => {
    state.selectRows.push([{ n: 5 }]);
    expect(await getChatMessagesCount()).toBe(5);
  });

  it("returns zero when the aggregate row is missing", async () => {
    state.selectRows.push([]);
    expect(await getChatMessagesCount()).toBe(0);
  });
});
