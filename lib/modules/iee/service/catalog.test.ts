import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { coreLibrary } from "../catalog/fixtures.test-helpers";
import { keysOf } from "../catalog/views";
import {
  assertRewardKeys,
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

/** Reward keys are checked against the library — here, the system pack. */
const library = vi.hoisted(() => ({ libraryKeys: vi.fn() }));
vi.mock("../catalog", () => library);

const ACTOR = { id: "admin-1", role: "admin" };
const KEYS = keysOf(coreLibrary());
const VALID_ITEM_KEY = "hex_scroll";
const VALID_EFFECT_KEY = "swamp";

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
  library.libraryKeys.mockReset();
  library.libraryKeys.mockResolvedValue(KEYS);
});

describe("EventRewardSchema", () => {
  it("accepts an empty reward — some challenges pay nothing", () => {
    expect(EventRewardSchema.safeParse({}).success).toBe(true);
  });

  it("bounds points to 0..1000 whole numbers", () => {
    expect(EventRewardSchema.safeParse({ points: -1 }).success).toBe(false);
    expect(EventRewardSchema.safeParse({ points: 1001 }).success).toBe(false);
    expect(EventRewardSchema.safeParse({ points: 1.5 }).success).toBe(false);
    expect(EventRewardSchema.safeParse({ points: 1000 }).success).toBe(true);
  });
});

describe("assertRewardKeys — a reward names what the library offers", () => {
  it("does not read the library for a points-only reward", async () => {
    await expect(assertRewardKeys({ points: 5 })).resolves.toBeUndefined();
    expect(library.libraryKeys).not.toHaveBeenCalled();
  });

  it("accepts a real item and effect", async () => {
    expect(Object.keys(KEYS.items)).toContain(VALID_ITEM_KEY);
    await expect(
      assertRewardKeys({ points: 10, itemKey: VALID_ITEM_KEY, effectKey: VALID_EFFECT_KEY }),
    ).resolves.toBeUndefined();
  });

  it("refuses an item key the library does not offer", async () => {
    await expect(assertRewardKeys({ itemKey: "not_a_real_item" })).rejects.toMatchObject({
      name: "AdminError",
      code: "ieeUnknownItemKey",
    });
  });

  it("refuses an effect key the library does not offer, or an effect named as an item", async () => {
    await expect(assertRewardKeys({ effectKey: "not_a_real_effect" })).rejects.toMatchObject({ code: "ieeUnknownEffectKey" });
    await expect(assertRewardKeys({ itemKey: VALID_EFFECT_KEY })).rejects.toMatchObject({ code: "ieeUnknownItemKey" });
  });

  it("refuses keys that are only inherited from Object.prototype", async () => {
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      await expect(assertRewardKeys({ itemKey: key }), `itemKey "${key}"`).rejects.toMatchObject({ code: "ieeUnknownItemKey" });
    }
    await expect(assertRewardKeys({ effectKey: "toString" })).rejects.toMatchObject({ code: "ieeUnknownEffectKey" });
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

  it("refuses a reward the library does not offer before it touches the templates", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(createEventTemplateUseCase(input({ reward: { itemKey: "nope" } }))).rejects.toMatchObject({
      code: "ieeUnknownItemKey",
    });
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

  it("refuses a reward the library does not offer", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(
      updateEventTemplateUseCase("tpl-1", {
        title: "Collect stamps",
        descriptionMd: "Bring the host five stamps from the market.",
        reward: { effectKey: "nope" },
        requiresProof: true,
        defaultDeadlineHours: 48,
      }),
    ).rejects.toMatchObject({ code: "ieeUnknownEffectKey" });
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
