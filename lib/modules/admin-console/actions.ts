"use server";

/**
 * Admin command console — server actions. The thin presenter over
 * `executeAdminCommand`: it resolves message codes against the dictionaries in
 * the session language and translates domain errors, exactly like every other
 * admin action.
 */

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { isAppError } from "@/lib/errors/app-error";
import { errorText } from "@/lib/i18n/errors";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import { listAllBotRuns } from "@/lib/modules/bots/repository";
import { listCatalogGames } from "@/lib/modules/catalog/repository";
import { listUsers } from "@/lib/modules/player/service/admin";
import { listSeasons } from "@/lib/modules/season/repository/seasons";
import type { ArgOption, DynamicArgKind } from "@/lib/shared/admin-console";

import { executeAdminCommand, type CommandRow } from "./execute";

export interface CommandRunResult {
  ok: boolean;
  /** Localized, ready to print in the console. */
  message: string;
  rows?: CommandRow[];
  navigate?: string;
  refresh?: boolean;
}

const SUGGEST_LIMIT = 8;

export async function runAdminCommandAction(input: string): Promise<CommandRunResult> {
  const { t } = await getT();
  try {
    const outcome = await executeAdminCommand(input);
    const messages = t.adminConsole.result as Record<string, string>;
    const template = messages[outcome.code];
    return {
      ok: outcome.ok,
      message: template ? format(template, outcome.params ?? {}) : outcome.code,
      rows: outcome.rows,
      navigate: outcome.navigate,
      refresh: outcome.refresh,
    };
  } catch (e) {
    if (isAppError(e)) {
      return { ok: false, message: errorText(t.core.errors, e.code, e.params) };
    }
    log.error("console.command_failed", { input, err: e instanceof Error ? e : undefined });
    return { ok: false, message: errorText(t.core.errors, "formUnknown") };
  }
}

/** Live completions for season / user / game arguments. */
export async function suggestAdminArgsAction(
  kind: DynamicArgKind,
  partial: string,
): Promise<ArgOption[]> {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") return [];

  const q = partial.trim().toLowerCase();

  if (kind === "season") {
    const seasons = await listSeasons();
    return seasons
      .filter((s) => !q || s.slug.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))
      .slice(0, SUGGEST_LIMIT)
      .map((s) => ({ value: s.slug, label: s.title, hint: `${s.slug} · ${s.status}` }));
  }

  if (kind === "user") {
    const users = await listUsers(partial.trim() || undefined);
    return users
      .slice(0, SUGGEST_LIMIT)
      .map((u) => ({
        value: u.username,
        label: u.displayName ?? u.username,
        hint: `@${u.username}${u.isBlocked ? " · blocked" : ""}`,
      }));
  }

  if (kind === "bot") {
    const runs = await listAllBotRuns(SUGGEST_LIMIT * 5);
    return runs
      .filter(
        (r) =>
          !q ||
          r.run.id.toLowerCase().startsWith(q) ||
          r.seasonTitle.toLowerCase().includes(q) ||
          r.seasonSlug.toLowerCase().includes(q),
      )
      .slice(0, SUGGEST_LIMIT)
      .map((r) => ({
        value: r.run.id.slice(0, 8),
        label: `#${r.run.id.slice(0, 8)} · ${r.seasonTitle}`,
        hint: r.run.status,
      }));
  }

  const games = await listCatalogGames();
  return games
    .filter((g) => !q || g.title.toLowerCase().includes(q))
    .slice(0, SUGGEST_LIMIT)
    .map((g) => ({ value: g.title, label: g.title, hint: g.platform ?? undefined }));
}
