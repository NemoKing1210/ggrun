import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";

import { GameLoopError } from "./errors";

/**
 * `GameLoopError` is the shape every game use-case throws. The action layer
 * maps it through `makeToError`, which reads `code` to pick the translated
 * message and `status` to decide whether it is a client error — so both must
 * be fixed here rather than left to each call site.
 */
describe("GameLoopError", () => {
  it("is an AppError carrying the code it was built with", () => {
    const error = new GameLoopError("gameNotAllowed");
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("gameNotAllowed");
  });

  it("has no params for a code that needs none", () => {
    expect(new GameLoopError("gameRollNotFound").params).toEqual({});
  });

  it("is a 400 — a bad request, not a server fault", () => {
    expect(new GameLoopError("gameRollAlreadyResolved").status).toBe(400);
  });

  it("names itself so logs distinguish it from other AppErrors", () => {
    expect(new GameLoopError("ieeProofRequired").name).toBe("GameLoopError");
  });

  it("uses the code as the message, which is what gets translated", () => {
    expect(new GameLoopError("ieeEventNotOpen").message).toBe("ieeEventNotOpen");
  });
});
