import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { AdminError } from "./errors";

describe("AdminError", () => {
  it("is an AppError with a 403 status", () => {
    const error = new AdminError("adminStaffRequired");
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(403);
    expect(error.name).toBe("AdminError");
    expect(error.code).toBe("adminStaffRequired");
  });

  it("defaults params to an empty object", () => {
    expect(new AdminError("adminPlayerNotFound").params).toEqual({});
  });

  it("keeps the transition params it is given", () => {
    expect(new AdminError("adminInvalidTransition", { from: "draft", to: "active" }).params).toEqual({
      from: "draft",
      to: "active",
    });
  });
});
