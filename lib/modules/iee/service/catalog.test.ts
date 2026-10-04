import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { EFFECTS, ITEMS } from "@/lib/engine";

import {
  createEventTemplateUseCase,
  deleteEventTemplateUseCase,
  EventRewardSchema,
  EventTemplateInputSchema,
  getEventUsage,
  setEventTemplateActiveUseCase,
  updateEventTemplateUseCase,
  type EventTemplateInput,
} from "./catalog";

const session = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isStaff: vi.fn((user: { role?: string } | null) => user?.role === "admin" || user?.role === "judge"),
}));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const eventsInfra = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => eventsInfra);

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const repo = vi.hoisted(() => ({
  createEventTemplate: vi.fn(),
  deleteEventTemplate: vi.fn(),
  getEventTemplateByKey: vi.fn(),
  updateEventTemplate: vi.fn(),
  getEventUsageByKey: vi.fn(),
}));
vi.mock("../repository/events", () => repo);

const ACTOR = { id: "admin-1", role: "admin" };
const VALID_ITEM_KEY = Object.keys(ITEMS)[0]!;
const VALID_EFFECT_KEY = Object.keys(EFFECTS)[0]!;

function input(overrides: Partial<EventTemplateInput> = {}): EventTemplateInput {
  return {
    key: "collect_stamps",
    title: "Collect stamps",
    descriptionMd: "Bring the host five stamps from the market.",
    reward: { points: 5 },
    requiresProof: true,
    defaultDeadlineHours: 48,
    ...overrides,
  };
}

beforeEach(() => {
  session.getCurrentUser.mockReset();
  eventsInfra.logAdminAction.mockReset();
  eventsInfra.logAdminAction.mockResolvedValue(undefined);
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.getEventTemplateByKey.mockResolvedValue(null);
});

describe("EventRewardSchema", () => {
  it("accepts an empty reward — some challenges pay nothing", () => {
    expect(EventRewardSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a reward that names a real item and effect", () => {
    const result = EventRewardSchema.safeParse({
      points: 10,
      itemKey: VALID_ITEM_KEY,
      effectKey: VALID_EFFECT_KEY,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an item key that is not in the catalog", () => {
    const result = EventRewardSchema.safeParse({ itemKey: "not_a_real_item" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["itemKey"]);
      expect(result.error.issues[0]?.message).toBe("ieeUnknownItemKey");
    }
  });

  it("rejects an effect key that is not in the catalog", () => {
    const result = EventRewardSchema.safeParse({ effectKey: "not_a_real_effect" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["effectKey"]);
      expect(result.error.issues[0]?.message).toBe("ieeUnknownEffectKey");
    }
  });

  it("rejects an item key that is only inherited from Object.prototype", () => {
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(EventRewardSchema.safeParse({ itemKey: key }).success, `itemKey "${key}"`).toBe(false);
    }
  });

  it("rejects an effect key that is only inherited from Object.prototype", () => {
    expect(EventRewardSchema.safeParse({ effectKey: "toString" }).success).toBe(false);
  });

  it("bounds points to 0..1000 whole numbers", () => {
    expect(EventRewardSchema.safeParse({ points: -1 }).success).toBe(false);
    expect(EventRewardSchema.safeParse({ points: 1001 }).success).toBe(false);
    expect(EventRewardSchema.safeParse({ points: 1.5 }).success).toBe(false);
    expect(EventRewardSchema.safeParse({ points: 1000 }).success).toBe(true);
  });
});

describe("EventTemplateInputSchema", () => {
  it("accepts a well-formed template and trims its key", () => {
    const parsed = EventTemplateInputSchema.parse(input({ key: "  collect_stamps  " }));
    expect(parsed.key).toBe("collect_stamps");
  });

  it("requires a lowercase digit-underscore key", () => {
    expect(EventTemplateInputSchema.safeParse(input({ key: "Collect-Stamps" })).success).toBe(false);
    expect(EventTemplateInputSchema.safeParse(input({ key: "ab" })).success).toBe(false);
    expect(EventTemplateInputSchema.safeParse(input({ key: "a".repeat(65) })).success).toBe(false);
    expect(EventTemplateInputSchema.safeParse(input({ key: "collect_stamps_2" })).success).toBe(true);
  });

  it("requires a title of at least three characters", () => {
    expect(EventTemplateInputSchema.safeParse(input({ title: "ab" })).success).toBe(false);
    expect(EventTemplateInputSchema.safeParse(input({ title: "abc" })).success).toBe(true);
  });

  it("requires a description of at least ten characters", () => {
    expect(EventTemplateInputSchema.safeParse(input({ descriptionMd: "too short" })).success).toBe(false);
    expect(EventTemplateInputSchema.safeParse(input({ descriptionMd: "long enough" })).success).toBe(true);
  });

  it("allows a null deadline or 1..8760 hours", () => {
    expect(EventTemplateInputSchema.safeParse(input({ defaultDeadlineHours: null })).success).toBe(true);
    expect(EventTemplateInputSchema.safeParse(input({ defaultDeadlineHours: 1 })).success).toBe(true);
    expect(EventTemplateInputSchema.safeParse(input({ defaultDeadlineHours: 8760 })).success).toBe(true);
    expect(EventTemplateInputSchema.safeParse(input({ defaultDeadlineHours: 0 })).success).toBe(false);
    expect(EventTemplateInputSchema.safeParse(input({ defaultDeadlineHours: 8761 })).success).toBe(false);
    expect(EventTemplateInputSchema.safeParse(input({ defaultDeadlineHours: 2.5 })).success).toBe(false);
  });

  it("requires the proof flag to be an explicit boolean", () => {
    expect(EventTemplateInputSchema.safeParse(input({ requiresProof: "on" as unknown as boolean })).success).toBe(false);
  });

  it("rejects a reward that names an unknown catalog key", () => {
    expect(EventTemplateInputSchema.safeParse(input({ reward: { itemKey: "nope" } })).success).toBe(false);
  });
});

describe("createEventTemplateUseCase", () => {
  it("refuses a non-staff actor before validating anything", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(createEventTemplateUseCase(input())).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(repo.getEventTemplateByKey).not.toHaveBeenCalled();
  });

  it("refuses an invalid template before it touches the database", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(createEventTemplateUseCase(input({ title: "x" }))).rejects.toBeInstanceOf(ZodError);
    expect(repo.getEventTemplateByKey).not.toHaveBeenCalled();
    expect(repo.createEventTemplate).not.toHaveBeenCalled();
  });

  it("refuses a key that already exists", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getEventTemplateByKey.mockResolvedValue({ id: "tpl-1", key: "collect_stamps" });
    await expect(createEventTemplateUseCase(input())).rejects.toMatchObject({
      name: "AdminError",
      code: "ieeEventKeyExists",
      params: { key: "collect_stamps" },
    });
    expect(repo.createEventTemplate).not.toHaveBeenCalled();
  });

  it("stores the template with the actor as author and audits it", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    const created = { id: "tpl-1", key: "collect_stamps", title: "Collect stamps" };
    repo.createEventTemplate.mockResolvedValue(created);

    await createEventTemplateUseCase(input({ key: "  collect_stamps  " }));

    expect(repo.createEventTemplate).toHaveBeenCalledWith({
      key: "collect_stamps",
      title: "Collect stamps",
      descriptionMd: "Bring the host five stamps from the market.",
      reward: { points: 5 },
      requiresProof: true,
      defaultDeadlineHours: 48,
      createdBy: "admin-1",
    });
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actionType: "iee_event_template_create",
        targetType: "event_template",
        targetId: "tpl-1",
      }),
    );
  });
});

describe("updateEventTemplateUseCase", () => {
  it("refuses a non-staff actor", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    const patch: Omit<EventTemplateInput, "key"> = {
      title: "Collect stamps",
      descriptionMd: "Bring the host five stamps from the market.",
      reward: { points: 5 },
      requiresProof: true,
      defaultDeadlineHours: 48,
    };
    await expect(updateEventTemplateUseCase("tpl-1", patch)).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(repo.updateEventTemplate).not.toHaveBeenCalled();
  });

  it("patches the template and audits the change", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await updateEventTemplateUseCase("tpl-1", {
      title: "Collect more stamps",
      descriptionMd: "Bring the host seven stamps from the market.",
      reward: { points: 7 },
      requiresProof: false,
      defaultDeadlineHours: null,
    });

    expect(repo.updateEventTemplate).toHaveBeenCalledWith("tpl-1", {
      title: "Collect more stamps",
      descriptionMd: "Bring the host seven stamps from the market.",
      reward: { points: 7 },
      requiresProof: false,
      defaultDeadlineHours: null,
    });
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "iee_event_template_update", targetId: "tpl-1" }),
    );
  });
});

describe("setEventTemplateActiveUseCase", () => {
  it("enables a template and audits an enable", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await setEventTemplateActiveUseCase("tpl-1", true);
    expect(repo.updateEventTemplate).toHaveBeenCalledWith("tpl-1", { isActive: true });
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "iee_event_template_enable", payload: { isActive: true } }),
    );
  });

  it("disables a template and audits a disable", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await setEventTemplateActiveUseCase("tpl-1", false);
    expect(repo.updateEventTemplate).toHaveBeenCalledWith("tpl-1", { isActive: false });
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "iee_event_template_disable", payload: { isActive: false } }),
    );
  });

  it("refuses a non-staff actor", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(setEventTemplateActiveUseCase("tpl-1", true)).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(repo.updateEventTemplate).not.toHaveBeenCalled();
  });
});

describe("deleteEventTemplateUseCase", () => {
  it("deletes the template and audits it", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await deleteEventTemplateUseCase("tpl-1");
    expect(repo.deleteEventTemplate).toHaveBeenCalledWith("tpl-1");
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "iee_event_template_delete", targetId: "tpl-1" }),
    );
  });

  it("refuses a non-staff actor", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    await expect(deleteEventTemplateUseCase("tpl-1")).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(repo.deleteEventTemplate).not.toHaveBeenCalled();
  });
});

describe("getEventUsage", () => {
  it("delegates to the usage aggregate", async () => {
    const usage = { collect_stamps: 3 };
    repo.getEventUsageByKey.mockResolvedValue(usage);
    await expect(getEventUsage()).resolves.toBe(usage);
    expect(repo.getEventUsageByKey).toHaveBeenCalledTimes(1);
  });
});
