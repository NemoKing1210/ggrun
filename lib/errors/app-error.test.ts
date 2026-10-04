import { describe, expect, it } from "vitest";

import { AppError, isAppError } from "./app-error";

describe("AppError", () => {
  it("defaults to no params and HTTP 400 and uses the code as its message", () => {
    const error = new AppError("formUnknown");
    expect(error.message).toBe("formUnknown");
    expect(error.params).toEqual({});
    expect(error.status).toBe(400);
    expect(error.name).toBe("AppError");
    expect(error).toBeInstanceOf(Error);
  });

  it("keeps the supplied params and non-default status", () => {
    const error = new AppError("adminSeasonNotFound", { id: "s-1" }, 404);
    expect(error.code).toBe("adminSeasonNotFound");
    expect(error.params).toEqual({ id: "s-1" });
    expect(error.status).toBe(404);
  });

  it("preserves the error code verbatim even when it is not a known key", () => {
    const error = new AppError("customDomainCode" as never);
    expect(error.code).toBe("customDomainCode");
  });
});

describe("isAppError", () => {
  it("recognizes AppError and subclasses", () => {
    class DomainError extends AppError {}
    expect(isAppError(new AppError("formUnknown"))).toBe(true);
    expect(isAppError(new DomainError("formUnknown"))).toBe(true);
  });

  it("rejects other errors and non-error values", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("AppError")).toBe(false);
    expect(isAppError({ code: "formUnknown" })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});
