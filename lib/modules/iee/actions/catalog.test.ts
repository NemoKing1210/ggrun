import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AdminError } from "@/lib/modules/season/service/errors";

import {
  createEventTemplateAction,
  deleteEventTemplateAction,
  toggleEventTemplateAction,
  updateEventTemplateAction,
} from "./catalog";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const ERRORS = {
  adminStaffRequired: "Staff only",
  formUnknown: "Unknown error",
};

const i18n = vi.hoisted(() => ({ getT: vi.fn() }));
vi.mock("@/lib/i18n/server", () => i18n);
i18n.getT.mockResolvedValue({
  locale: "en",
  t: { core: { errors: ERRORS }, iee: { admin: { saved: "Saved" } } },
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const useCases = vi.hoisted(() => ({
  createEventTemplateUseCase: vi.fn(),
  updateEventTemplateUseCase: vi.fn(),
  setEventTemplateActiveUseCase: vi.fn(),
  deleteEventTemplateUseCase: vi.fn(),
}));
vi.mock("../service/catalog", () => useCases);

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
  for (const fn of Object.values(useCases)) fn.mockReset();
  for (const fn of Object.values(useCases)) fn.mockResolvedValue(undefined);
});

describe("createEventTemplateAction", () => {
  it("builds the template input from the form and reports success", async () => {
    const result = await createEventTemplateAction(
      EMPTY_STATE,
      formData({
        key: "collect_stamps",
        title: "Collect stamps",
        descriptionMd: "Bring the host five stamps.",
        rewardPoints: "5",
        rewardItemKey: "hex_scroll",
        rewardEffectKey: "shield",
        requiresProof: "on",
        defaultDeadlineHours: "24",
      }),
    );

    expect(useCases.createEventTemplateUseCase).toHaveBeenCalledWith({
      key: "collect_stamps",
      title: "Collect stamps",
      descriptionMd: "Bring the host five stamps.",
      reward: { points: 5, itemKey: "hex_scroll", effectKey: "shield" },
      requiresProof: true,
      defaultDeadlineHours: 24,
    });
    expect(result).toEqual({ ok: "Saved" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/catalog");
  });

  it("truncates a fractional points reward", async () => {
    await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!", rewardPoints: "2.7" }),
    );
    const [input] = useCases.createEventTemplateUseCase.mock.calls[0] as [{ reward: { points?: number } }];
    expect(input.reward.points).toBe(2);
  });

  it("omits a zero, negative or non-numeric points reward", async () => {
    for (const raw of ["0", "-3", "abc", ""]) {
      useCases.createEventTemplateUseCase.mockClear();
      await createEventTemplateAction(
        EMPTY_STATE,
        formData({ key: "abc", title: "Title", descriptionMd: "Description!", rewardPoints: raw }),
      );
      const [input] = useCases.createEventTemplateUseCase.mock.calls[0] as [{ reward: Record<string, unknown> }];
      expect(input.reward.points, `points from "${raw}"`).toBeUndefined();
    }
  });

  it("treats blank optional reward keys as absent", async () => {
    await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!", rewardItemKey: "  ", rewardEffectKey: "" }),
    );
    const [input] = useCases.createEventTemplateUseCase.mock.calls[0] as [{ reward: Record<string, unknown> }];
    expect(input.reward).toEqual({});
  });

  it("reads a blank deadline as none and truncates a fractional one", async () => {
    await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!", defaultDeadlineHours: "" }),
    );
    expect(useCases.createEventTemplateUseCase.mock.calls[0]?.[0]).toMatchObject({ defaultDeadlineHours: null });

    useCases.createEventTemplateUseCase.mockClear();
    await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!", defaultDeadlineHours: "12.9" }),
    );
    expect(useCases.createEventTemplateUseCase.mock.calls[0]?.[0]).toMatchObject({ defaultDeadlineHours: 12 });

    useCases.createEventTemplateUseCase.mockClear();
    await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!", defaultDeadlineHours: "soon" }),
    );
    expect(useCases.createEventTemplateUseCase.mock.calls[0]?.[0]).toMatchObject({ defaultDeadlineHours: null });
  });

  it("accepts the several spellings an HTML form may send for a checkbox", async () => {
    for (const raw of ["on", "true", "1", "yes", "TRUE", "Yes"]) {
      useCases.createEventTemplateUseCase.mockClear();
      await createEventTemplateAction(
        EMPTY_STATE,
        formData({ key: "abc", title: "Title", descriptionMd: "Description!", requiresProof: raw }),
      );
      expect(useCases.createEventTemplateUseCase.mock.calls[0]?.[0]).toMatchObject({ requiresProof: true });
    }

    useCases.createEventTemplateUseCase.mockClear();
    await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!", requiresProof: "off" }),
    );
    expect(useCases.createEventTemplateUseCase.mock.calls[0]?.[0]).toMatchObject({ requiresProof: false });
  });

  it("translates a domain error thrown by the use case", async () => {
    useCases.createEventTemplateUseCase.mockRejectedValue(new AdminError("adminStaffRequired"));
    const result = await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!" }),
    );
    expect(result).toEqual({ ok: undefined, error: "Staff only", debug: undefined });
  });

  it("turns a validation failure into a field-prefixed message", async () => {
    const error = z.object({ key: z.string().min(5) }).safeParse({ key: "ab" }).error;
    useCases.createEventTemplateUseCase.mockRejectedValue(error);
    const result = await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "ab", title: "Title", descriptionMd: "Description!" }),
    );
    expect(result.error?.startsWith("key: ")).toBe(true);
    expect(result.debug).toBeUndefined();
  });

  it("falls back to the unknown-error text for anything else", async () => {
    useCases.createEventTemplateUseCase.mockRejectedValue(new Error("boom"));
    const result = await createEventTemplateAction(
      EMPTY_STATE,
      formData({ key: "abc", title: "Title", descriptionMd: "Description!" }),
    );
    expect(result.error).toBe("Unknown error");
    expect(logger.log.error).toHaveBeenCalled();
  });
});

describe("updateEventTemplateAction", () => {
  it("passes the id from the form and omits the key", async () => {
    await updateEventTemplateAction(
      EMPTY_STATE,
      formData({ id: "tpl-1", title: "New title", descriptionMd: "New description.", rewardPoints: "9" }),
    );
    expect(useCases.updateEventTemplateUseCase).toHaveBeenCalledWith("tpl-1", {
      title: "New title",
      descriptionMd: "New description.",
      reward: { points: 9 },
      requiresProof: false,
      defaultDeadlineHours: null,
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/catalog");
  });
});

describe("toggleEventTemplateAction", () => {
  it("enables a template and revalidates the catalog", async () => {
    await toggleEventTemplateAction(formData({ id: "tpl-1", isActive: "on" }));
    expect(useCases.setEventTemplateActiveUseCase).toHaveBeenCalledWith("tpl-1", true);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/catalog");
  });

  it("disables a template when the flag is absent", async () => {
    await toggleEventTemplateAction(formData({ id: "tpl-1" }));
    expect(useCases.setEventTemplateActiveUseCase).toHaveBeenCalledWith("tpl-1", false);
  });

  it("logs and rethrows a failure so the form shows an error", async () => {
    const failure = new AdminError("adminStaffRequired");
    useCases.setEventTemplateActiveUseCase.mockRejectedValue(failure);
    await expect(toggleEventTemplateAction(formData({ id: "tpl-1", isActive: "on" }))).rejects.toBe(failure);
    expect(logger.log.error).toHaveBeenCalledWith(
      "iee.event_template.toggle_failed",
      expect.objectContaining({ id: "tpl-1" }),
    );
  });
});

describe("deleteEventTemplateAction", () => {
  it("deletes the template and revalidates the catalog", async () => {
    await deleteEventTemplateAction(formData({ id: "tpl-1" }));
    expect(useCases.deleteEventTemplateUseCase).toHaveBeenCalledWith("tpl-1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/catalog");
  });

  it("logs and rethrows a failure", async () => {
    const failure = new AdminError("adminStaffRequired");
    useCases.deleteEventTemplateUseCase.mockRejectedValue(failure);
    await expect(deleteEventTemplateAction(formData({ id: "tpl-1" }))).rejects.toBe(failure);
    expect(logger.log.error).toHaveBeenCalledWith(
      "iee.event_template.delete_failed",
      expect.objectContaining({ id: "tpl-1" }),
    );
  });
});
