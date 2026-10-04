import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

const HASH_FORMAT = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/;

describe("hashPassword", () => {
  it("stores a 16-byte salt and a 64-byte key as hex in the scrypt$salt$hash format", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(HASH_FORMAT);
  });

  it("derives a fresh salt so equal passwords produce different hashes", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    // Only the salt differs — the format is otherwise identical.
    expect(a.split("$")[0]).toBe("scrypt");
    expect(b.split("$")[0]).toBe("scrypt");
  });
});

describe("verifyPassword", () => {
  it("accepts the password that was hashed", async () => {
    const stored = await hashPassword("s3cret-password");
    await expect(verifyPassword("s3cret-password", stored)).resolves.toBe(true);
  });

  it("rejects a different password and the empty string", async () => {
    const stored = await hashPassword("s3cret-password");
    await expect(verifyPassword("s3cret-passworD", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
    await expect(verifyPassword("s3cret-password ", stored)).resolves.toBe(false);
  });

  it("rejects a hash whose derived key was tampered with", async () => {
    const stored = await hashPassword("pw");
    const [scheme, salt, hash] = stored.split("$") as [string, string, string];
    const flipped = (hash[0] === "0" ? "1" : "0") + hash.slice(1);
    await expect(verifyPassword("pw", `${scheme}$${salt}$${flipped}`)).resolves.toBe(false);
  });

  it("rejects a hash whose salt was tampered with", async () => {
    const stored = await hashPassword("pw");
    const [scheme, salt, hash] = stored.split("$") as [string, string, string];
    const flipped = (salt[0] === "0" ? "1" : "0") + salt.slice(1);
    await expect(verifyPassword("pw", `${scheme}$${flipped}$${hash}`)).resolves.toBe(false);
  });

  it("rejects every malformed stored value without throwing", async () => {
    const malformed = [
      "",
      "plaintext",
      "scrypt",
      "scrypt$onlysalt",
      "scrypt$onlysalt$",
      "scrypt$$deadbeef",
      "bcrypt$00112233445566778899aabbccddeeff$deadbeef",
      "scrypt$0011$deadbeef",
      "argon2$00112233445566778899aabbccddeeff$00",
    ];
    for (const stored of malformed) {
      await expect(verifyPassword("pw", stored)).resolves.toBe(false);
    }
  });

  it("rejects a derived key of the wrong length without throwing", async () => {
    const [scheme, salt] = (await hashPassword("pw")).split("$") as [string, string, string];
    await expect(verifyPassword("pw", `${scheme}$${salt}$00`)).resolves.toBe(false);
    await expect(verifyPassword("pw", `${scheme}$${salt}$` + "ab".repeat(63))).resolves.toBe(false);
  });
});
