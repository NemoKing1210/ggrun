import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const KEY_LEN = 64;

/** Формат: scrypt$<saltHex>$<hashHex> */
export async function hashPassword(
  password: string,
): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const derived = (await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    KEY_LEN,
  )) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}
