import { beforeEach, describe, expect, it, vi } from "vitest";

const dict = {
  core: {
    errors: {
      gameParticipantNotFound: "Participant not found",
      gameRollNotFound: "Roll not found",
      gameAlreadyHaveRoll: "You already have a rolled game",
      formUnknown: "Unknown error",
    },
  },
};

const state = vi.hoisted(() => {
  class GameLoopError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
      this.name = "GameLoopError";
    }
  }
  return {
    revalidatePath: vi.fn(),
    getCurrentUser: vi.fn(),
    getT: vi.fn(),
    rollNewGame: vi.fn(),
    resolveGameRoll: vi.fn(),
    logError: vi.fn(),
    GameLoopError,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: state.getCurrentUser }));
vi.mock("@/lib/i18n/server", () => ({ getT: state.getT }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: state.logError, debug: vi.fn() },
}));
vi.mock("@/lib/modules/game", () => ({
  GameLoopError: state.GameLoopError,
  rollNewGame: state.rollNewGame,
  resolveGameRoll: state.resolveGameRoll,
}));

import { resolveAction, rollAction } from "./game";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.getT.mockResolvedValue({ locale: "en", t: dict });
  state.getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("rollAction", () => {
  it("rejects a form without a season player id", async () => {
    const result = await rollAction({}, form({}));
    expect(result).toEqual({ error: "Participant not found" });
    expect(state.rollNewGame).not.toHaveBeenCalled();
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });

  it("rolls, revalidates the dashboard and returns no error", async () => {
    state.rollNewGame.mockResolvedValue("roll-1");

    const result = await rollAction({}, form({ seasonPlayerId: "sp-1" }));

    expect(result).toEqual({});
    expect(state.rollNewGame).toHaveBeenCalledWith("sp-1");
    expect(state.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("translates a game-loop failure", async () => {
    state.rollNewGame.mockRejectedValue(new state.GameLoopError("gameAlreadyHaveRoll"));

    const result = await rollAction({}, form({ seasonPlayerId: "sp-1" }));

    expect(result).toEqual({ error: "You already have a rolled game" });
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("resolveAction", () => {
  it("requires a season player id first", async () => {
    expect(await resolveAction({}, form({}))).toEqual({ error: "Participant not found" });
    expect(state.resolveGameRoll).not.toHaveBeenCalled();
  });

  it("requires a roll id next", async () => {
    expect(await resolveAction({}, form({ seasonPlayerId: "sp-1" }))).toEqual({ error: "Roll not found" });
  });

  it("rejects an unknown outcome", async () => {
    const result = await resolveAction({}, form({ seasonPlayerId: "sp-1", rollId: "r1", outcome: "exploded" }));
    expect(result).toEqual({ error: "Unknown error" });
    expect(state.resolveGameRoll).not.toHaveBeenCalled();
  });

  it("passes the parsed rating and comment through and returns the wheel", async () => {
    const wheel = { kind: "advance", steps: 2 };
    state.resolveGameRoll.mockResolvedValue({ wheel });

    const result = await resolveAction(
      {},
      form({
        seasonPlayerId: "sp-1",
        rollId: "r1",
        outcome: "passed",
        reason: "finished it",
        comment: "great",
        rating: "8",
      }),
    );

    expect(state.resolveGameRoll).toHaveBeenCalledWith({
      rollId: "r1",
      outcome: "passed",
      reason: "finished it",
      comment: "great",
      rating: 8,
    });
    expect(result).toEqual({ wheel });
    expect(state.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(state.revalidatePath).toHaveBeenCalledWith("/board");
  });

  it("falls back to the comment as the reason and drops an empty rating", async () => {
    state.resolveGameRoll.mockResolvedValue({ wheel: undefined });

    const result = await resolveAction(
      {},
      form({ seasonPlayerId: "sp-1", rollId: "r1", outcome: "dropped", comment: "not my genre", rating: "" }),
    );

    expect(state.resolveGameRoll).toHaveBeenCalledWith({
      rollId: "r1",
      outcome: "dropped",
      reason: "not my genre",
      comment: "not my genre",
      rating: undefined,
    });
    expect(result).toEqual({});
  });

  it("translates a game-loop failure without revalidating", async () => {
    state.resolveGameRoll.mockRejectedValue(new state.GameLoopError("gameRollNotFound"));

    const result = await resolveAction({}, form({ seasonPlayerId: "sp-1", rollId: "r1", outcome: "passed" }));

    expect(result).toEqual({ error: "Roll not found" });
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });
});
