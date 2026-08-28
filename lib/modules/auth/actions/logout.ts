"use server";

import { redirect } from "next/navigation";

import { destroySession } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";

export async function logoutAction(): Promise<void> {
  // Best-effort: don't have a session id easily here, just log the event.
  log.info("auth.logout");
  await destroySession();
  redirect("/login");
}