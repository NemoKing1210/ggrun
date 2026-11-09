/**
 * What a library use case runs with: an admin (D1 — only admins create and
 * edit packs and entries) and a transaction. Kept apart from the rules so
 * tests swap in an in-memory store and a fixed actor.
 */
import { db } from "@/lib/infrastructure/db";
import { AdminError } from "@/lib/modules/season/service/errors";

import { pgLibraryStore, type LibraryStore } from "./store";

export interface LibraryActor {
  id: string;
}

/** The signed-in admin, or `ieeAdminRequired`. Judges keep the season wizard, not the library. */
export async function libraryAdmin(): Promise<LibraryActor> {
  const { getCurrentUser } = await import("@/lib/infrastructure/auth/session");
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new AdminError("ieeAdminRequired");
  return { id: user.id };
}

/** One transaction per use case: a publish writes its revisions and dependencies together. */
export function withLibrary<T>(fn: (store: LibraryStore) => Promise<T>): Promise<T> {
  return db.transaction((tx) => fn(pgLibraryStore(tx)));
}

/**
 * The system pack is read-only in production; a development install edits it
 * in the constructor and exports it back into `seed/iee/core.ggpack` (§10.2).
 */
export function coreEditable(): boolean {
  return process.env.IEE_CORE_EDITABLE === "1";
}
