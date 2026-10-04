"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";

import { markAllRead, markRead, removeNotification } from "./service";

/** Simple controls (button/icon) — void shape with rethrow + revalidate. */

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const id = formData.get("id");
  if (!user || typeof id !== "string" || !id) return;
  try {
    await markRead(user.id, id);
  } catch (error) {
    log.error("notifications.read.failed", {
      userId: user.id,
      err: error instanceof Error ? error : undefined,
    });
    throw error;
  }
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await markAllRead(user.id);
  } catch (error) {
    log.error("notifications.read_all.failed", {
      userId: user.id,
      err: error instanceof Error ? error : undefined,
    });
    throw error;
  }
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function deleteNotificationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const id = formData.get("id");
  if (!user || typeof id !== "string" || !id) return;
  try {
    await removeNotification(user.id, id);
  } catch (error) {
    log.error("notifications.delete.failed", {
      userId: user.id,
      err: error instanceof Error ? error : undefined,
    });
    throw error;
  }
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
