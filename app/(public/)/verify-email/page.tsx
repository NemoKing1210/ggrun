import type { Metadata } from "next";

import { getT } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageContainer } from "@/components/ui/PageContainer";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `Verify email — GGRun` };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await getT();
  const { token } = await searchParams;

  if (!token) {
    return (
      <PageContainer>
        <div className="hud-card p-6 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <p className="font-display uppercase tracking-widest text-danger">Missing token</p>
          <p className="mt-2 text-sm text-zinc-400">No verification token provided.</p>
          <Link href="/login" className="hud-btn hud-btn-primary mt-4 inline-flex">Go to login</Link>
        </div>
      </PageContainer>
    );
  }

  const rows = await db.select().from(users).where(eq(users.emailVerificationToken, token)).limit(1);
  const u = rows[0];

  if (!u) {
    return (
      <PageContainer>
        <div className="hud-card border-danger/30 bg-danger/10 p-6 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <p className="font-display uppercase tracking-widest text-danger">Invalid link</p>
          <p className="mt-2 text-sm text-zinc-400">This verification link is invalid or already used.</p>
          <Link href="/login" className="hud-btn mt-4 inline-flex">Go to login</Link>
        </div>
      </PageContainer>
    );
  }

  if (u.emailVerificationExpiresAt && u.emailVerificationExpiresAt < new Date()) {
    return (
      <PageContainer>
        <div className="hud-card border-amber/30 bg-amber/10 p-6 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <p className="font-display uppercase tracking-widest text-amber">Link expired</p>
          <p className="mt-2 text-sm text-zinc-400">This link has expired. Ask an admin to resend a new one.</p>
          <Link href="/login" className="hud-btn mt-4 inline-flex">Go to login</Link>
        </div>
      </PageContainer>
    );
  }

  // Verify
  await db
    .update(users)
    .set({ emailVerified: true, isApproved: true, emailVerificationToken: null, emailVerificationExpiresAt: null })
    .where(eq(users.id, u.id));

  return (
    <PageContainer>
      <div className="hud-card border-military/30 bg-military/10 p-6 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <Badge variant="military" size="md" className="font-mono">Verified</Badge>
        <h1 className="mt-3 font-display text-2xl uppercase tracking-widest text-military">Email verified</h1>
        <p className="mt-2 text-sm text-zinc-400">Your account <span className="text-amber">@{u.username}</span> is now active. You can log in.</p>
        <Link href="/login" className="hud-btn hud-btn-primary mt-4 inline-flex">Go to login</Link>
      </div>
    </PageContainer>
  );
}
