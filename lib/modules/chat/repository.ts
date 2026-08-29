import { and, count, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { chatMessages, users } from "@/db/schema";

export type ChatMessageRow = {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
};

export async function getChatMessages(params: {
  limit: number;
  before?: string | null;
}): Promise<{ messages: ChatMessageRow[]; hasMore: boolean; nextBefore: string | null }> {
  const limit = Math.min(Math.max(params.limit, 1), 100);
  const beforeDate = params.before ? new Date(params.before) : null;
  const where = beforeDate && !isNaN(beforeDate.getTime()) ? lt(chatMessages.createdAt, beforeDate) : undefined;

  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: users.role,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.userId))
    .where(where)
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const messages = [...sliced].reverse();
  const nextBefore = hasMore ? messages[0]?.createdAt.toISOString() ?? null : null;
  return { messages, hasMore, nextBefore };
}

export async function createChatMessage(params: { userId: string; content: string }): Promise<ChatMessageRow> {
  const trimmed = params.content.trim();
  if (trimmed.length === 0) throw new Error("EMPTY_CONTENT");
  if (trimmed.length > 1000) throw new Error("CONTENT_TOO_LONG");

  const since = new Date(Date.now() - 30_000);
  const recent = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, params.userId), sql`${chatMessages.createdAt} > ${since}`))
    .limit(10);
  if (recent.length >= 8) throw new Error("RATE_LIMITED");

  const [inserted] = await db
    .insert(chatMessages)
    .values({ userId: params.userId, content: trimmed })
    .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });

  const [full] = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: users.role,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.userId))
    .where(eq(chatMessages.id, inserted.id))
    .limit(1);

  return full;
}

export async function getChatMessagesCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(chatMessages);
  return Number(row?.n ?? 0);
}
