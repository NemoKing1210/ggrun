import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { createChatMessage, getChatMessages } from "@/lib/modules/chat/repository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10) || 30, 100);
  const before = searchParams.get("before");
  try {
    const data = await getChatMessages({ limit, before });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (user.isBlocked) return NextResponse.json({ error: "BLOCKED" }, { status: 403 });

  let body: { content?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "EMPTY_CONTENT" }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: "CONTENT_TOO_LONG" }, { status: 400 });

  try {
    const msg = await createChatMessage({ userId: user.id, content });
    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    if (msg === "RATE_LIMITED") return NextResponse.json({ error: msg }, { status: 429 });
    if (msg === "EMPTY_CONTENT" || msg === "CONTENT_TOO_LONG") return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
