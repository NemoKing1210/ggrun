/**
 * Synthetic test-bot detection.
 *
 * Bot users are created by the bots console (`lib/modules/bots/service.ts`)
 * with usernames `bot_<8 of runId>_<index>` (see `botUsername()` in
 * `lib/modules/bots/repository.ts`). There is no `is_bot` column on purpose —
 * the username prefix binds a synthetic user to its run and survives without
 * a migration. Keep the regex in sync with `botUsernamePrefix()`.
 */
export const BOT_USERNAME_RE = /^bot_[0-9a-f]{8}_\d+$/i;

export function isBotUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return BOT_USERNAME_RE.test(username);
}

export function isBotUser(user: { username: string } | null | undefined): boolean {
  if (!user) return false;
  return isBotUsername(user.username);
}
