import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { BotError } from "./errors";

describe("BotError", () => {
  it("is an AppError carrying the bot code and a 400 status", () => {
    const error = new BotError("botInvalidConfig");
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("botInvalidConfig");
    expect(error.status).toBe(400);
    expect(error.name).toBe("BotError");
  });

  it("defaults params to an empty object when none are supplied", () => {
    const error = new BotError("botRunNotFound");
    expect(error.params).toEqual({});
  });

  it("preserves the interpolation params it is given", () => {
    const error = new BotError("botRunNotFound", { runId: "abc" });
    expect(error.params).toEqual({ runId: "abc" });
  });
});
