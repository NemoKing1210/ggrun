import { z } from "zod";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { AdminError } from "@/lib/modules/season/service/errors";

import {
  createEventTemplate,
  deleteEventTemplate,
  getEventTemplateByKey,
  updateEventTemplate,
} from "../repository/events";
import { getEventUsageByKey } from "../repository/events";
import { libraryKeys } from "../catalog";

async function requireStaff() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new AdminError("adminStaffRequired");
  return user;
}

/**
 * Reward shape. Kept as three optional scalars rather than free-form JSON —
 * `docs/DESIGN.md` §1.4 forbids raw-JSON admin controls, and the keys are
 * checked against the library by `assertRewardKeys`.
 */
export const EventRewardSchema = z.object({
  points: z.number().int().min(0).max(1000).optional(),
  itemKey: z.string().optional(),
  effectKey: z.string().optional(),
});

/**
 * A reward names an item or effect by key, which the library must offer. A
 * template is not tied to a season: a season attaches what its challenges
 * hand out when it is saved (spec §4.2). Keys only — an entry id would
 * resolve too, but a template stores what a person can read.
 */
export async function assertRewardKeys(reward: z.infer<typeof EventRewardSchema>): Promise<void> {
  if (!reward.itemKey && !reward.effectKey) return;
  const keys = await libraryKeys();
  if (reward.itemKey && !Object.hasOwn(keys.items, reward.itemKey)) throw new AdminError("ieeUnknownItemKey");
  if (reward.effectKey && !Object.hasOwn(keys.effects, reward.effectKey)) throw new AdminError("ieeUnknownEffectKey");
}

/** Slug rules match the catalog keys: lowercase, digits, underscore. */
const KeySchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9_]+$/, { message: "ieeInvalidKey" });

export const EventTemplateInputSchema = z.object({
  key: KeySchema,
  title: z.string().trim().min(3).max(120),
  descriptionMd: z.string().trim().min(10).max(4000),
  reward: EventRewardSchema,
  requiresProof: z.boolean(),
  defaultDeadlineHours: z.union([z.number().int().min(1).max(8760), z.null()]),
});

export type EventTemplateInput = z.infer<typeof EventTemplateInputSchema>;

export async function createEventTemplateUseCase(
  input: EventTemplateInput,
): Promise<void> {
  const actor = await requireStaff();
  const parsed = EventTemplateInputSchema.parse(input);
  await assertRewardKeys(parsed.reward);

  if (await getEventTemplateByKey(parsed.key)) {
    throw new AdminError("ieeEventKeyExists", { key: parsed.key });
  }

  const created = await createEventTemplate({
    key: parsed.key,
    title: parsed.title,
    descriptionMd: parsed.descriptionMd,
    reward: parsed.reward,
    requiresProof: parsed.requiresProof,
    defaultDeadlineHours: parsed.defaultDeadlineHours,
    createdBy: actor.id,
  });

  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_event_template_create",
    targetType: "event_template",
    targetId: created.id,
    payload: { key: created.key, title: created.title, reward: parsed.reward },
  });
  log.info("iee.event_template.created", { actorId: actor.id, key: created.key });
}

export async function updateEventTemplateUseCase(
  id: string,
  input: Omit<EventTemplateInput, "key">,
): Promise<void> {
  const actor = await requireStaff();
  const parsed = EventTemplateInputSchema.omit({ key: true }).parse(input);
  await assertRewardKeys(parsed.reward);

  await updateEventTemplate(id, {
    title: parsed.title,
    descriptionMd: parsed.descriptionMd,
    reward: parsed.reward,
    requiresProof: parsed.requiresProof,
    defaultDeadlineHours: parsed.defaultDeadlineHours,
  });

  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_event_template_update",
    targetType: "event_template",
    targetId: id,
    payload: { title: parsed.title, reward: parsed.reward },
  });
  log.info("iee.event_template.updated", { actorId: actor.id, id });
}

export async function setEventTemplateActiveUseCase(
  id: string,
  isActive: boolean,
): Promise<void> {
  const actor = await requireStaff();
  await updateEventTemplate(id, { isActive });
  await logAdminAction({
    actorId: actor.id,
    actionType: isActive
      ? "iee_event_template_enable"
      : "iee_event_template_disable",
    targetType: "event_template",
    targetId: id,
    payload: { isActive },
  });
}

/**
 * Deleting a template is allowed even when it is in use: assignments keep
 * their snapshotted title, description and reward and only lose the foreign
 * key, so nothing in a player's history changes. Seasons still listing the
 * key simply stop assigning it.
 */
export async function deleteEventTemplateUseCase(id: string): Promise<void> {
  const actor = await requireStaff();
  await deleteEventTemplate(id);
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_event_template_delete",
    targetType: "event_template",
    targetId: id,
    payload: {},
  });
  log.info("iee.event_template.deleted", { actorId: actor.id, id });
}

/** Read model for the admin catalog page. */
export async function getEventUsage(): Promise<Record<string, number>> {
  return getEventUsageByKey();
}
