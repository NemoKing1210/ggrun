import { describe, expect, it, vi } from "vitest";

vi.mock("./execute", () => ({
  executeAdminCommand: vi.fn(async () => ({ ok: true, code: "whoami", params: { user: "root" } })),
}));

import { executeAdminCommand } from "./execute";
import * as barrel from "./index";

describe("admin-console barrel", () => {
  it("re-exports the executor unchanged", async () => {
    expect(barrel.executeAdminCommand).toBe(executeAdminCommand);
    await expect(barrel.executeAdminCommand("whoami")).resolves.toEqual({
      ok: true,
      code: "whoami",
      params: { user: "root" },
    });
  });
});
