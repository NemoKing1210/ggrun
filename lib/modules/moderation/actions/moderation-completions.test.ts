/**
 * Branches the sibling `moderation.test.ts` leaves out: the single completion
 * verdicts, the empty-batch early returns that bypass reason validation, and
 * the missing-ids parse path.
 */
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
import { log } from "@/lib/infrastructure/logger";
import { toError } from "@/lib/use-cases/admin/actions/helpers";
import { approveCompletionRequest, rejectCompletionRequest } from "@/lib/modules/game";

import {
  approveAllCompletionsAction,
  approveCompletionAction,
  rejectAllCompletionsAction,
  rejectAllRerollsAction,
  rejectCompletionAction,
} from "./moderation";

const mocks = {
  revalidatePath: vi.mocked(revalidatePath),
  getCurrentUser: vi.mocked(getCurrentUser),
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
  mocks.approveCompletionRequest.mockResolvedValue(undefined);
  mocks.rejectCompletionRequest.mockResolvedValue(undefined);
});

describe("single completion verdicts", () => {
  it("approves a completion and revalidates the completion surfaces", async () => {
    const outcome = await approveCompletionAction({}, form({ requestId: "c1", userId: "u1" }));
    expect(outcome).toEqual({ ok: "approved" });
    expect(mocks.approveCompletionRequest).toHaveBeenCalledWith("c1");
    for (const path of ["/admin/moderation", "/admin/completions", "/dashboard", "/board", "/feed"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("rejects a missing completion id without calling the use-case", async () => {
    const outcome = await approveCompletionAction({}, form({}));
    expect(outcome).toEqual({ error: "Missing request" });
    expect(mocks.approveCompletionRequest).not.toHaveBeenCalled();
  });

  it("translates a completion approval failure", async () => {
    mocks.approveCompletionRequest.mockRejectedValue(new Error("gone"));
    const outcome = await approveCompletionAction({}, form({ requestId: "c1" }));
    expect(outcome).toEqual({ error: "translated" });
    expect(vi.mocked(toError)).toHaveBeenCalledWith(expect.any(Error), "completion.approve", {
      actorId: "judge-1",
      requestId: "c1",
    });
  });

  it("requires a reason to reject a completion", async () => {
    const outcome = await rejectCompletionAction({}, form({ requestId: "c1", adminNote: "   " }));
    expect(outcome).toEqual({ error: "Reason required" });
    expect(mocks.rejectCompletionRequest).not.toHaveBeenCalled();
  });

  it("also rejects a completion with no request id", async () => {
    expect(await rejectCompletionAction({}, form({ adminNote: "because" }))).toEqual({
      error: "Missing request",
    });
  });

  it("passes the reason through to the completion use-case", async () => {
    const outcome = await rejectCompletionAction(
      {},
      form({ requestId: "c1", adminNote: "invalid proof", userId: "u1" }),
    );
    expect(outcome).toEqual({ ok: "rejected" });
    expect(mocks.rejectCompletionRequest).toHaveBeenCalledWith("c1", "invalid proof");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("translates a completion rejection failure", async () => {
    mocks.rejectCompletionRequest.mockRejectedValue(new Error("gone"));
    const outcome = await rejectCompletionAction({}, form({ requestId: "c1", adminNote: "nope" }));
    expect(outcome).toEqual({ error: "translated" });
    expect(vi.mocked(toError)).toHaveBeenCalledWith(expect.any(Error), "completion.reject", {
      actorId: "judge-1",
      requestId: "c1",
    });
  });
});

describe("batch validation boundaries", () => {
  it("returns before the reason check when the batch is empty", async () => {
    await expect(rejectAllRerollsAction(form({ ids: " , ", sharedNote: "no" }))).resolves.toBeUndefined();
    await expect(rejectAllCompletionsAction(form({ sharedNote: "no" }))).resolves.toBeUndefined();
    expect(vi.mocked(log.info)).not.toHaveBeenCalled();
  });

  it("requires a shared reason of at least five characters for completions", async () => {
    await expect(rejectAllCompletionsAction(form({ ids: "x", sharedNote: "bad" }))).rejects.toThrow(
      /Shared reason required/,
    );
    expect(mocks.rejectCompletionRequest).not.toHaveBeenCalled();
  });

  it("applies one shared reason to every completion", async () => {
    await rejectAllCompletionsAction(form({ ids: "x,y", sharedNote: "not ours" }));
    expect(mocks.rejectCompletionRequest.mock.calls).toEqual([
      ["x", "not ours"],
      ["y", "not ours"],
    ]);
  });

  it("treats a missing ids field as an empty batch", async () => {
    await expect(approveAllCompletionsAction(form({}))).resolves.toBeUndefined();
    expect(mocks.approveCompletionRequest).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("logs each failed completion and keeps the successful ones", async () => {
    mocks.approveCompletionRequest.mockImplementation((id: string) =>
      id === "bad" ? Promise.reject(new Error("already resolved")) : Promise.resolve(undefined),
    );
    await expect(approveAllCompletionsAction(form({ ids: "good,bad" }))).resolves.toBeUndefined();
    expect(mocks.approveCompletionRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(log.error)).toHaveBeenCalledWith(
      "moderation.bulk_completion_approve",
      expect.objectContaining({ requestId: "bad", actorId: "judge-1" }),
    );
    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      "moderation.bulk_completion_approve",
      expect.objectContaining({ ok: 1, failed: 1 }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/moderation");
  });

  it("rethrows when every completion in the batch failed", async () => {
    mocks.approveCompletionRequest.mockRejectedValue(new Error("nope"));
    await expect(approveAllCompletionsAction(form({ ids: "a,b,c" }))).rejects.toThrow(
      /failed for all 3/,
    );
  });
});
