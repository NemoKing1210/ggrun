"use server";

"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const DEV_USERS = {
  admin: {
    email: "admin@ggrun.local",
    username: "admin",
    displayName: "Admin",
    role: "admin" as const,
    password: "admin12345",
  },
  player: {
    email: "player1@ggrun.local",
    username: "player1",
    displayName: "TestPlayer",
    role: "player" as const,
    password: "player12345",
  },
} as const;

/**
 * Quick dev-mode login: outside production only.
 * Users are created when missing, so it works against a clean DB.
 */
export async function devQuickLoginAction(
  formData: FormData,
): Promise<void> {
  if (process.env.NODE_ENV === "production") redirect("/login");

  const kind = String(formData.get("devUser"));
  const spec = DEV_USERS[kind as keyof typeof DEV_USERS];
  if (!spec) redirect("/login");

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, spec.email))
    .limit(1);

  let userId = existing[0]?.id;
  if (!userId) {
    const [created] = await db
      .insert(users)
      .values({
        email: spec.email,
        username: spec.username,
        passwordHash: await hashPassword(spec.password),
        displayName: spec.displayName,
        role: spec.role,
      })
      .returning({ id: users.id });
    userId = created!.id;
  }

  await createSession(userId);
  redirect("/dashboard");
}
