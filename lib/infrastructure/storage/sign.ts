/**
 * Access links for objects the application has to gate itself.
 *
 * S3 can pre-sign a GET, but a local directory has no such thing — so private
 * files served by `/api/files` carry an HMAC token in the query string. The
 * token covers `key` and the expiry, so a link cannot be retargeted at another
 * object and cannot be extended.
 *
 * Links are capped at `MAX_LINK_TTL_SECONDS`: past that the signature is
 * rejected no matter what `exp` says, so a leaked link cannot be turned into a
 * permanent one by hand-editing the URL.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Longest life an access link may be granted (7 days). */
export const MAX_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Default life of an access link (1 hour). */
export const DEFAULT_LINK_TTL_SECONDS = 60 * 60;

function digest(key: string, exp: number, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${key}\n${exp}`).digest();
}

export type FileLinkToken = { exp: number; sig: string };

/**
 * Signs `key` for `expiresIn` seconds. `now` is injectable so expiry behaviour
 * is testable without sleeping.
 */
export function signFileKey(
  key: string,
  expiresIn: number,
  secret: string,
  now: number = Date.now(),
): FileLinkToken {
  const ttl = Math.min(Math.max(Math.floor(expiresIn), 1), MAX_LINK_TTL_SECONDS);
  const exp = Math.floor(now / 1000) + ttl;
  return { exp, sig: digest(key, exp, secret).toString("hex") };
}

/** Verifies a token produced by {@link signFileKey}. Constant-time on the signature. */
export function verifyFileKey(
  key: string,
  exp: number,
  sig: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!Number.isInteger(exp) || typeof sig !== "string" || sig.length === 0) return false;
  const nowSeconds = Math.floor(now / 1000);
  if (exp <= nowSeconds) return false;
  if (exp > nowSeconds + MAX_LINK_TTL_SECONDS) return false;
  const expected = digest(key, exp, secret);
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(expected, given);
}

/** `exp=…&sig=…` — the query fragment appended to `/api/files?key=…`. */
export function fileLinkQuery(token: FileLinkToken): string {
  return `exp=${token.exp}&sig=${token.sig}`;
}
