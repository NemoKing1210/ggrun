import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from "@/lib/engine";
import type { User } from "@/db/schema";

import { GameLoopError } from "./errors";

/**
 * The session is the only I/O boundary these helpers touch, so it is the one
 * thing faked. `isStaff` mirrors `lib/infrastructure/auth/session.isStaff`
 * (admin or judge); faking it lets each case state who the actor is without a
 * cookie jar.
 */
const session = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isStaff: vi.fn((user: { role?: string } | null) =>
    user !== null && (user.role === "admin" || user.role === "judge"),
  ),
}));
vi.mock("@/lib/infrastructure/auth/session", () => session);

/** Minimal thenable Drizzle stand-in: `select()` resolves the next queued rows. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    then(onFulfilled: (rows: unknown[]) => unknown): Promise<unknown>;
  }
  const selectResults: unknown[][] = [];
  function chain(resolve: () => unknown[]): Chain {
    const c: Chain = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (onFulfilled) => Promise.resolve(resolve()).then(onFulfilled),
    };
    return c;
  }
  const db = { select: () => chain(() => selectResults.shift() ?? []) };
  return {
    db,
    selectResults,
    reset: () => {
      selectResults.length = 0;
    },
  };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

import {
  assertActorAllowed,
  getOpenRollRow,
  parseSeasonConfig,
  requireStaffActor,
} from "./helpers";

function user(id: string, role: string): User {
  return { id, role } as unknown as User;
}

beforeEach(() => {
  dbFake.reset();
  session.getCurrentUser.mockReset();
  session.isStaff.mockClear();
});

describe("parseSeasonConfig", () => {
  it("keeps a season's own tuning", () => {
    const raw = { rerolls: { allowed: false, limitPerGame: 3, requireApproval: false } };
    const config = parseSeasonConfig(raw);
    expect(config.rerolls).toEqual({ allowed: false, limitPerGame: 3, requireApproval: false });
  });

  it("fills the sections a season did not specify from the defaults", () => {
    const config = parseSeasonConfig({});
    expect(config).toEqual(DEFAULT_SEASON_CONFIG);
  });

  it("passes a full config through unchanged", () => {
    expect(parseSeasonConfig(DEFAULT_SEASON_CONFIG)).toEqual(DEFAULT_SEASON_CONFIG);
  });

  it("falls back to the whole default when one value is invalid", () => {
    const config = parseSeasonConfig({ dice: { sides: 0 } });
    expect(config).toEqual(DEFAULT_SEASON_CONFIG);
  });

  it("falls back on a non-object config", () => {
    for (const raw of [null, undefined, 42, "config", [] as unknown[]]) {
      expect(parseSeasonConfig(raw)).toEqual(DEFAULT_SEASON_CONFIG);
    }
  });

  it("never returns a partial config typed as SeasonConfig", () => {
    const config: SeasonConfig = parseSeasonConfig({ board: { size: 12 } });
    expect(config.board.size).toBe(12);
    expect(config.points.startingBalance).toBe(DEFAULT_SEASON_CONFIG.points.startingBalance);
  });
});

describe("assertActorAllowed", () => {
  const SEASON_PLAYER = "sp-1";
  const PLAYER = "user-1";

  it("lets the participant act for themselves", async () => {
    await expect(assertActorAllowed(SEASON_PLAYER, PLAYER, user(PLAYER, "player"))).resolves.toBeUndefined();
  });

  it("lets an admin act on anyone's behalf", async () => {
    await expect(assertActorAllowed(SEASON_PLAYER, PLAYER, user("admin-1", "admin"))).resolves.toBeUndefined();
  });

  it("lets a judge act on anyone's behalf", async () => {
    await expect(assertActorAllowed(SEASON_PLAYER, PLAYER, user("judge-1", "judge"))).resolves.toBeUndefined();
  });

  it("refuses a different non-staff actor", async () => {
    await expect(assertActorAllowed(SEASON_PLAYER, PLAYER, user("other", "player"))).rejects.toMatchObject({
      name: "GameLoopError",
      code: "gameNotAllowed",
    });
  });

  it("resolves the actor from the session when none is passed", async () => {
    session.getCurrentUser.mockResolvedValue(user(PLAYER, "player"));
    await expect(assertActorAllowed(SEASON_PLAYER, PLAYER)).resolves.toBeUndefined();
    expect(session.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("refuses a request with no session", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    const error = await assertActorAllowed(SEASON_PLAYER, PLAYER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GameLoopError);
    expect((error as GameLoopError).code).toBe("gameNotAllowed");
  });

  it("treats an explicit null actor as request-less and falls back to the session", async () => {
    session.getCurrentUser.mockResolvedValue(user("admin-1", "admin"));
    await expect(assertActorAllowed(SEASON_PLAYER, PLAYER, null)).resolves.toBeUndefined();
  });
});

describe("requireStaffActor", () => {
  it("returns an admin", async () => {
    const admin = user("admin-1", "admin");
    session.getCurrentUser.mockResolvedValue(admin);
    await expect(requireStaffActor()).resolves.toBe(admin);
  });

  it("returns a judge", async () => {
    const judge = user("judge-1", "judge");
    session.getCurrentUser.mockResolvedValue(judge);
    await expect(requireStaffActor()).resolves.toBe(judge);
  });

  it("refuses a signed-in player", async () => {
    session.getCurrentUser.mockResolvedValue(user("user-1", "player"));
    await expect(requireStaffActor()).rejects.toMatchObject({ code: "adminStaffRequired" });
  });

  it("refuses a guest", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    await expect(requireStaffActor()).rejects.toMatchObject({ code: "adminStaffRequired" });
  });
});

describe("getOpenRollRow", () => {
  it("returns the newest open roll", async () => {
    const roll = { id: "roll-1", status: "in_progress" };
    dbFake.selectResults.push([roll]);
    await expect(getOpenRollRow("sp-1")).resolves.toBe(roll);
  });

  it("returns null when nothing is open", async () => {
    dbFake.selectResults.push([]);
    await expect(getOpenRollRow("sp-1")).resolves.toBeNull();
  });
});
