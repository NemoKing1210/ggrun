import { describe, expect, it } from "vitest";

import {
  MAX_LINK_TTL_SECONDS,
  fileLinkQuery,
  signFileKey,
  verifyFileKey,
} from "./sign";

const SECRET = "test-signing-secret";
const KEY = "avatar/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg";
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

describe("signFileKey / verifyFileKey", () => {
  it("round-trips a valid token", () => {
    const { exp, sig } = signFileKey(KEY, 600, SECRET, NOW);
    expect(verifyFileKey(KEY, exp, sig, SECRET, NOW)).toBe(true);
  });

  it("rejects an expired token", () => {
    const { exp, sig } = signFileKey(KEY, 60, SECRET, NOW);
    expect(verifyFileKey(KEY, exp, sig, SECRET, NOW + 61_000)).toBe(false);
  });

  it("rejects a token retargeted at another key", () => {
    const { exp, sig } = signFileKey(KEY, 600, SECRET, NOW);
    expect(verifyFileKey("banner/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg", exp, sig, SECRET, NOW)).toBe(false);
  });

  it("rejects a token signed with another secret", () => {
    const { exp, sig } = signFileKey(KEY, 600, "other", NOW);
    expect(verifyFileKey(KEY, exp, sig, SECRET, NOW)).toBe(false);
  });

  it("rejects a hand-extended expiry", () => {
    const { exp, sig } = signFileKey(KEY, 60, SECRET, NOW);
    expect(verifyFileKey(KEY, exp + 86_400, sig, SECRET, NOW)).toBe(false);
  });

  it("caps the granted lifetime at the maximum TTL", () => {
    const { exp } = signFileKey(KEY, MAX_LINK_TTL_SECONDS * 10, SECRET, NOW);
    expect(exp).toBe(Math.floor(NOW / 1000) + MAX_LINK_TTL_SECONDS);
    expect(verifyFileKey(KEY, exp, signFileKey(KEY, MAX_LINK_TTL_SECONDS * 10, SECRET, NOW).sig, SECRET, NOW)).toBe(true);
  });

  it("rejects garbage, non-integer and oversized expiries", () => {
    expect(verifyFileKey(KEY, Number.NaN, "deadbeef", SECRET, NOW)).toBe(false);
    expect(verifyFileKey(KEY, 1.5, "deadbeef", SECRET, NOW)).toBe(false);
    expect(verifyFileKey(KEY, Math.floor(NOW / 1000) + MAX_LINK_TTL_SECONDS + 1, "deadbeef", SECRET, NOW)).toBe(false);
    expect(verifyFileKey(KEY, Math.floor(NOW / 1000) + 60, "not-hex", SECRET, NOW)).toBe(false);
    expect(verifyFileKey(KEY, Math.floor(NOW / 1000) + 60, "", SECRET, NOW)).toBe(false);
  });

  it("formats the query fragment the route reads back", () => {
    const token = signFileKey(KEY, 600, SECRET, NOW);
    const query = new URLSearchParams(fileLinkQuery(token));
    expect(query.get("exp")).toBe(String(token.exp));
    expect(query.get("sig")).toBe(token.sig);
  });
});
