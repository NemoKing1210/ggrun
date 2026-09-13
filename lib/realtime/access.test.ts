import { describe, expect, it } from "vitest";

import {
  authorizeJoin,
  isLeavableRoom,
  isStaffRole,
  parseSessionCookie,
  SESSION_COOKIE,
  typingVerdict,
  TYPING_THROTTLE_MS,
  type SocketUser,
} from "./access";
import { AUDIT_ROOM, CHAT_ROOM, seasonRoom } from "./protocol";

const viewer: SocketUser = { id: "u1", username: "viewer", displayName: null, role: "viewer" };
const judge: SocketUser = { id: "u2", username: "judge", displayName: "J", role: "judge" };
const admin: SocketUser = { id: "u3", username: "admin", displayName: null, role: "admin" };

describe("parseSessionCookie", () => {
  it("extracts the session token among other cookies", () => {
    expect(parseSessionCookie(`a=1; ${SESSION_COOKIE}=tok123; b=2`)).toBe("tok123");
  });

  it("decodes url-encoded values", () => {
    expect(parseSessionCookie(`${SESSION_COOKIE}=a%2Fb`)).toBe("a/b");
  });

  it("returns null when absent or empty", () => {
    expect(parseSessionCookie(undefined)).toBeNull();
    expect(parseSessionCookie("")).toBeNull();
    expect(parseSessionCookie("other=1")).toBeNull();
    expect(parseSessionCookie(`${SESSION_COOKIE}=`)).toBeNull();
    expect(parseSessionCookie("nonsense")).toBeNull();
  });
});

describe("isStaffRole", () => {
  it("admits admins and judges only", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("judge")).toBe(true);
    expect(isStaffRole("viewer")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole("ADMIN")).toBe(false);
  });
});

describe("authorizeJoin", () => {
  it("lets anyone into chat and season rooms", () => {
    expect(authorizeJoin(CHAT_ROOM, null)).toEqual({ ok: true });
    expect(authorizeJoin(seasonRoom("s1"), null)).toEqual({ ok: true });
    expect(authorizeJoin(seasonRoom("s1"), viewer)).toEqual({ ok: true });
  });

  it("keeps anonymous users and viewers out of audit", () => {
    expect(authorizeJoin(AUDIT_ROOM, null)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(authorizeJoin(AUDIT_ROOM, viewer)).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("lets staff into audit", () => {
    expect(authorizeJoin(AUDIT_ROOM, judge)).toEqual({ ok: true });
    expect(authorizeJoin(AUDIT_ROOM, admin)).toEqual({ ok: true });
  });

  it("rejects unknown rooms without leaking membership", () => {
    // Same verdict for anonymous and staff: no room oracle.
    for (const room of [undefined, null, 42, "", "lobby", "season:", "chat ", "AUDIT", "x".repeat(81)]) {
      expect(authorizeJoin(room, null)).toEqual({ ok: false, error: "UNKNOWN_ROOM" });
      expect(authorizeJoin(room, admin)).toEqual({ ok: false, error: "UNKNOWN_ROOM" });
    }
  });
});

describe("room and rate limits", () => {
  it("caps rooms held per socket", () => {
    expect(authorizeJoin(seasonRoom("s1"), viewer, { roomsHeld: 7 })).toEqual({ ok: true });
    expect(authorizeJoin(seasonRoom("s1"), viewer, { roomsHeld: 8 })).toEqual({
      ok: false,
      error: "ROOM_LIMIT",
    });
  });

  it("rate-limits join bursts in a sliding window", () => {
    const now = 50_000;
    const recent = Array.from({ length: 20 }, (_, i) => now - i * 100);
    expect(authorizeJoin(CHAT_ROOM, viewer, { recentJoins: recent, now })).toEqual({
      ok: false,
      error: "RATE_LIMITED",
    });
    // Stale attempts outside the window do not count.
    const stale = Array.from({ length: 20 }, () => now - 60_000);
    expect(authorizeJoin(CHAT_ROOM, viewer, { recentJoins: stale, now })).toEqual({ ok: true });
  });
});

describe("isLeavableRoom", () => {
  it("accepts known rooms and rejects stray input", () => {
    expect(isLeavableRoom(CHAT_ROOM)).toBe(true);
    expect(isLeavableRoom(seasonRoom("s1"))).toBe(true);
    expect(isLeavableRoom("lobby")).toBe(false);
    expect(isLeavableRoom(42)).toBe(false);
    expect(isLeavableRoom("")).toBe(false);
  });
});

describe("typingVerdict", () => {
  it("denies anonymous sockets", () => {
    expect(typingVerdict(null, 10_000, 0)).toEqual({ allowed: false });
  });

  it("allows the first hint and stamps the time", () => {
    expect(typingVerdict(viewer, 10_000, 0)).toEqual({ allowed: true, stamp: 10_000 });
  });

  it("throttles bursts inside the window", () => {
    expect(typingVerdict(viewer, 10_000 + TYPING_THROTTLE_MS - 1, 10_000)).toEqual({
      allowed: false,
    });
  });

  it("allows again once the window passes", () => {
    expect(typingVerdict(viewer, 10_000 + TYPING_THROTTLE_MS, 10_000)).toEqual({
      allowed: true,
      stamp: 10_000 + TYPING_THROTTLE_MS,
    });
  });
});
