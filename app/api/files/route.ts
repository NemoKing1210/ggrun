import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getStorage, isStorageKey } from "@/lib/infrastructure/storage";
import { canReadFile, verifyFileLink } from "@/lib/modules/files/service/access";
import { getFileByKey } from "@/lib/modules/files/service/storage";

export const dynamic = "force-dynamic";

const IMMUTABLE = "public, max-age=31536000, immutable";
const PRIVATE = "private, max-age=0, no-store";

/**
 * Serves one stored file.
 *
 * Public files are world-readable and cached forever (keys are immutable and
 * unique per upload). Private files need either a signed link or the owner /
 * staff session — the same rule `canReadFile` applies everywhere else, so the
 * route cannot drift from the module's policy.
 *
 * When a public base URL is configured the request is answered with a redirect
 * to the direct object URL, which keeps big media off the app server; otherwise
 * the bytes stream through here.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key || !isStorageKey(key)) {
    return NextResponse.json({ error: "MISSING_KEY" }, { status: 400 });
  }

  try {
    const file = await getFileByKey(key);
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    if (file.visibility === "private") {
      const exp = Number(searchParams.get("exp"));
      const sig = searchParams.get("sig") ?? "";
      let allowed = Number.isInteger(exp) && verifyFileLink(key, exp, sig);
      if (!allowed) {
        const user = await getCurrentUser();
        allowed = canReadFile(file, user ? { id: user.id, role: user.role } : null);
      }
      if (!allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const driver = getStorage();
    if (file.visibility === "public") {
      const direct = driver.publicUrl(key);
      if (direct) return NextResponse.redirect(direct, 302);
    }

    const bytes = await driver.get(key);
    if (!bytes) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const name = key.slice(key.lastIndexOf("/") + 1);
    // Copy into a plain ArrayBuffer-backed view: `BodyInit` does not accept a
    // `Uint8Array<ArrayBufferLike>` (a Buffer slice may share a pool).
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": file.visibility === "public" ? IMMUTABLE : PRIVATE,
        "Content-Disposition": `inline; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
