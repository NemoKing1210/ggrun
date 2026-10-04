import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/use-cases/admin/actions/helpers", () => ({ toError: vi.fn() }));
vi.mock("@/lib/modules/game", () => ({
  approveRerollRequest: vi.fn(),
  rejectRerollRequest: vi.fn(),
  approveCompletionRequest: vi.fn(),
  rejectCompletionRequest: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { toError } from "@/lib/use-cases/admin/actions/helpers";
import {
  approveCompletionRequest,
  approveRerollRequest,
  rejectCompletionRequest,
  rejectRerollRequest,
} from "@/lib/modules/game";

import {
  approveAllCompletionsAction,
  approveAllRerollsAction,
  approveRerollAction,
  rejectAllCompletionsAction,
  rejectAllRerollsAction,
  rejectRerollAction,
} from "./moderation";

const mocks = {
  revalidatePath: vi.mocked(revalidatePath),
  getCurrentUser: vi.mocked(getCurrentUser),
  approveRerollRequest: vi.mocked(approveRerollRequest),
  rejectRerollRequest: vi.mocked(rejectRerollRequest),
  approveCompletionRequest: vi.mocked(approveCompletionRequest),
  rejectCompletionRequest: vi.mocked(rejectCompletionRequest),
};

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "judge-1" } as never);
  vi.mocked(toError).mockResolvedValue({ error: "translated" } as never);
  mocks.approveRerollRequest.mockResolvedValue(undefined);
  mocks.rejectRerollRequest.mockResolvedValue(undefined);
  mocks.approveCompletionRequest.mockResolvedValue(undefined);
  mocks.rejectCompletionRequest.mockResolvedValue(undefined);
});

describe("single-request verdicts", () => {
  it("rejects a missing request id without calling the use-case", async () => {
    const outcome = await approveRerollAction({}, form({}));
    expect(outcome).toEqual({ error: "Missing request" });
    expect(mocks.approveRerollRequest).not.toHaveBeenCalled();
  });

  it("approves a reroll and revalidates the affected pages", async () => {
    const outcome = await approveRerollAction({}, form({ requestId: "r1" }));
    expect(outcome).toEqual({ ok: "approved" });
    expect(mocks.approveRerollRequest).toHaveBeenCalledWith("r1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/moderation");
  });

  it("requires a reason to reject", async () => {
    const outcome = await rejectRerollAction({}, form({ requestId: "r1", adminNote: "   " }));
    expect(outcome).toEqual({ error: "Reason required" });
    expect(mocks.rejectRerollRequest).not.toHaveBeenCalled();
  });

  it("passes the trimmed reason to the reject use-case", async () => {
    const outcome = await rejectRerollAction({}, form({ requestId: "r1", adminNote: "not a real run" }));
    expect(outcome).toEqual({ ok: "rejected" });
    expect(mocks.rejectRerollRequest).toHaveBeenCalledWith("r1", "not a real run");
  });

  it("translates a domain failure through the shared error mapper", async () => {
    mocks.approveRerollRequest.mockRejectedValue(new Error("nope"));
    const outcome = await approveRerollAction({}, form({ requestId: "r1" }));
    expect(outcome).toEqual({ error: "translated" });
  });
});

describe("bulk verdicts", () => {
  it("does nothing when no ids are supplied", async () => {
    await approveAllRerollsAction(form({ ids: " , , " }));
    expect(mocks.approveRerollRequest).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("applies every trimmed id in one pass", async () => {
    await approveAllRerollsAction(form({ ids: " a, b ,, c " }));
    expect(mocks.approveRerollRequest.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
  });

  it("keeps going after an individual failure and still revalidates", async () => {
    mocks.approveRerollRequest.mockImplementation((id: string) =>
      id === "bad" ? Promise.reject(new Error("already resolved")) : Promise.resolve(undefined),
    );
    await expect(approveAllRerollsAction(form({ ids: "good,bad" }))).resolves.toBeUndefined();
    expect(mocks.approveRerollRequest).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/moderation");
  });

  it("throws only when every request in the batch failed", async () => {
    mocks.approveRerollRequest.mockRejectedValue(new Error("nope"));
    await expect(approveAllRerollsAction(form({ ids: "a,b" }))).rejects.toThrow(/failed for all 2/);
  });

  it("requires a shared reason of at least five characters to bulk-reject", async () => {
    await expect(rejectAllRerollsAction(form({ ids: "a", sharedNote: "no" }))).rejects.toThrow(
      /Shared reason required/,
    );
    expect(mocks.rejectRerollRequest).not.toHaveBeenCalled();
  });

  it("applies one shared reason to every rejected request", async () => {
    await rejectAllRerollsAction(form({ ids: "a,b", sharedNote: "duplicate entries" }));
    expect(mocks.rejectRerollRequest.mock.calls).toEqual([
      ["a", "duplicate entries"],
      ["b", "duplicate entries"],
    ]);
  });

  it("bulk-approves completions through the same single-item use-case", async () => {
    await approveAllCompletionsAction(form({ ids: "x,y" }));
    expect(mocks.approveCompletionRequest.mock.calls.map((c) => c[0])).toEqual(["x", "y"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/moderation");
  });

  it("bulk-rejects completions with the shared reason", async () => {
    await rejectAllCompletionsAction(form({ ids: "x", sharedNote: "invalid proof" }));
    expect(mocks.rejectCompletionRequest).toHaveBeenCalledWith("x", "invalid proof");
  });
});
