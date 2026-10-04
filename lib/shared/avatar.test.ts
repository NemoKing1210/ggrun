import { describe, expect, it } from "vitest";

import { AVATAR_EMOJI, avatarEmojiFor, avatarTintFor, hashAvatarSeed } from "./avatar";

describe("hashAvatarSeed", () => {
  it("returns the FNV-1a offset basis for an empty seed", () => {
    expect(hashAvatarSeed("")).toBe(0x811c9dc5);
  });

  it("is stable across calls", () => {
    expect(hashAvatarSeed("user-42")).toBe(hashAvatarSeed("user-42"));
  });

  it("distinguishes different seeds", () => {
    expect(hashAvatarSeed("alice")).not.toBe(hashAvatarSeed("bob"));
  });

  it("stays within an unsigned 32-bit range", () => {
    for (const seed of ["", "a", "longer seed", "🦄"]) {
      const h = hashAvatarSeed(seed);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("avatarEmojiFor", () => {
  it("selects the emoji by the hash modulo the palette length", () => {
    const seed = "user-42";
    const expected = AVATAR_EMOJI[hashAvatarSeed(seed) % AVATAR_EMOJI.length];
    expect(avatarEmojiFor(seed)).toBe(expected);
  });

  it("is deterministic for the same seed", () => {
    expect(avatarEmojiFor("stable")).toBe(avatarEmojiFor("stable"));
  });

  it("falls back to the empty-seed emoji for null and undefined", () => {
    expect(avatarEmojiFor(null)).toBe(avatarEmojiFor(""));
    expect(avatarEmojiFor(undefined)).toBe(avatarEmojiFor(""));
  });

  it("always returns a glyph from the exported palette", () => {
    for (const seed of ["", "a", "b", "c", "user-1", "user-2"]) {
      expect(AVATAR_EMOJI).toContain(avatarEmojiFor(seed));
    }
  });
});

describe("avatarTintFor", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarTintFor("stable")).toBe(avatarTintFor("stable"));
  });

  it("returns a tailwind gradient-tint class", () => {
    expect(avatarTintFor("user-1")).toMatch(/^from-\S+ to-\S+$/);
  });

  it("falls back to the empty-seed tint for null and undefined", () => {
    expect(avatarTintFor(null)).toBe(avatarTintFor(""));
    expect(avatarTintFor(undefined)).toBe(avatarTintFor(""));
  });

  it("varies the tint independently of the emoji via the higher hash bits", () => {
    // user-0 and user-44 hash to the same emoji slot but different tint slots.
    expect(avatarEmojiFor("user-0")).toBe(avatarEmojiFor("user-44"));
    expect(avatarTintFor("user-0")).not.toBe(avatarTintFor("user-44"));
  });
});
