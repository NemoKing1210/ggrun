import { beforeEach, describe, expect, it, vi } from "vitest";

import { GameLoopError, resolveEventUseCase, submitEventProofUseCase } from "@/lib/modules/game";

import {
  approveAllEventsAction,
  approveEventAction,
  rejectAllEventsAction,
  rejectEventAction,
  submitEventProofAction,
} from "./events";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const i18n = vi.hoisted(() => ({ getT: vi.fn() }));
vi.mock("@/lib/i18n/server", () => i18n);
i18n.getT.mockResolvedValue({
  locale: "en",
  t: {
    core: { errors: { ieeEventNotFound: "Event not found", formUnknown: "Unknown error" } },
  },
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

vi.mock("@/lib/modules/game", async () => {
  const { GameLoopError: LoopError } = await vi.importActual<{ GameLoopError: typeof GameLoopError }>(
    "@/lib/modules/game/service/errors",
  );
  return { GameLoopError: LoopError, resolveEventUseCase: vi.fn(), submitEventProofUseCase: vi.fn() };
});

const EMPTY_STATE = { ok: undefined, error: undefined };

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  cache.revalidatePath.mockClear();
  session.getCurrentUser.mockReset();
  session.getCurrentUser.mockResolvedValue(null);
  vi.mocked(resolveEventUseCase).mockReset();
  vi.mocked(resolveEventUseCase).mockResolvedValue(undefined);
  vi.mocked(submitEventProofUseCase).mockReset();
  vi.mocked(submitEventProofUseCase).mockResolvedValue(undefined as never);
});

describe("submitEventProofAction", () => {
  it("forwards the assignment id and proof and revalidates the player's views", async () => {
    const result = await submitEventProofAction(
      EMPTY_STATE,
      formData({ playerEventId: "pe-1", proof: "  I have the stamps  " }),
    );
    expect(vi.mocked(submitEventProofUseCase)).toHaveBeenCalledWith({
      playerEventId: "pe-1",
      proof: "  I have the stamps  ",
    });
    expect(result).toEqual({ ok: "submitted" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/feed");
  });

  it("translates a domain failure into an actionable message", async () => {
    vi.mocked(submitEventProofUseCase).mockRejectedValue(new GameLoopError("ieeEventNotFound"));
    const result = await submitEventProofAction(EMPTY_STATE, formData({ playerEventId: "pe-1", proof: "x" }));
    expect(result).toEqual({ ok: undefined, error: "Event not found" });
  });

  it("treats a missing field as an empty string rather than crashing", async () => {
    await submitEventProofAction(EMPTY_STATE, new FormData());
    expect(vi.mocked(submitEventProofUseCase)).toHaveBeenCalledWith({ playerEventId: "", proof: "" });
  });
});

describe("single-item judging", () => {
  it("approves the named submission with the note the judge typed", async () => {
    const result = await approveEventAction(
      EMPTY_STATE,
      formData({ playerEventId: "pe-1", adminNote: "clearly proven" }),
    );
    expect(vi.mocked(resolveEventUseCase)).toHaveBeenCalledWith({
      playerEventId: "pe-1",
      outcome: "approved",
      adminNote: "clearly proven",
    });
    expect(result).toEqual({ ok: "approved" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/moderation");
  });

  it("rejects the named submission and reports the outcome", async () => {
    const result = await rejectEventAction(EMPTY_STATE, formData({ playerEventId: "pe-2" }));
    expect(vi.mocked(resolveEventUseCase)).toHaveBeenCalledWith({
      playerEventId: "pe-2",
      outcome: "rejected",
      adminNote: "",
    });
    expect(result).toEqual({ ok: "rejected" });
  });

  it("returns a translated error instead of throwing", async () => {
    vi.mocked(resolveEventUseCase).mockRejectedValue(new GameLoopError("ieeEventNotFound"));
    const result = await approveEventAction(EMPTY_STATE, formData({ playerEventId: "pe-1" }));
    expect(result.error).toBe("Event not found");
  });
});

describe("bulk verdicts", () => {
  it("does nothing at all when no ids were submitted", async () => {
    await expect(approveAllEventsAction(formData({ ids: "" }))).resolves.toBeUndefined();
    expect(vi.mocked(resolveEventUseCase)).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("splits, trims and drops empty ids", async () => {
    await approveAllEventsAction(formData({ ids: "pe-1, pe-2 ,, pe-3" }));
    expect(vi.mocked(resolveEventUseCase).mock.calls.map((c) => c[0].playerEventId)).toEqual([
      "pe-1",
      "pe-2",
      "pe-3",
    ]);
  });

  it("judges each submission with the shared outcome", async () => {
    await approveAllEventsAction(formData({ ids: "pe-1,pe-2" }));
    for (const call of vi.mocked(resolveEventUseCase).mock.calls) {
      expect(call[0]).toMatchObject({ outcome: "approved", adminNote: null });
    }
  });

  it("keeps going when one submission fails and reports the rest", async () => {
    vi.mocked(resolveEventUseCase).mockImplementation(async ({ playerEventId }) => {
      if (playerEventId === "pe-2") throw new Error("boom");
    });

    await expect(approveAllEventsAction(formData({ ids: "pe-1,pe-2,pe-3" }))).resolves.toBeUndefined();
    expect(vi.mocked(resolveEventUseCase)).toHaveBeenCalledTimes(3);
    expect(logger.log.error).toHaveBeenCalledWith(
      "iee.event.bulk_judge",
      expect.objectContaining({ playerEventId: "pe-2", outcome: "approved" }),
    );
    expect(logger.log.info).toHaveBeenCalledWith(
      "iee.event.bulk_judge",
      expect.objectContaining({ outcome: "approved", ok: 2, failed: 1 }),
    );
  });

  it("rethrows only when every submission failed", async () => {
    vi.mocked(resolveEventUseCase).mockRejectedValue(new Error("boom"));
    await expect(approveAllEventsAction(formData({ ids: "pe-1,pe-2" }))).rejects.toThrow(
      "Bulk approved failed for all 2 submissions",
    );
  });

  it("requires a shared reason before rejecting a bulk bar", async () => {
    await expect(rejectAllEventsAction(formData({ ids: "pe-1,pe-2", sharedNote: "no" }))).rejects.toThrow(
      "Shared reason required (min 5 characters)",
    );
    expect(vi.mocked(resolveEventUseCase)).not.toHaveBeenCalled();
  });

  it("skips the shared reason when there is nothing to reject", async () => {
    await expect(rejectAllEventsAction(formData({ ids: "", sharedNote: "no" }))).resolves.toBeUndefined();
    expect(vi.mocked(resolveEventUseCase)).not.toHaveBeenCalled();
  });

  it("passes the trimmed shared reason to every rejection", async () => {
    await rejectAllEventsAction(formData({ ids: "pe-1,pe-2", sharedNote: "  copied proof  " }));
    for (const call of vi.mocked(resolveEventUseCase).mock.calls) {
      expect(call[0]).toMatchObject({ outcome: "rejected", adminNote: "copied proof" });
    }
  });
});
