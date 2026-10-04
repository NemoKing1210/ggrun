/**
 * Admin command console — server-side executor.
 *
 * Parses a console line with the shared parser and dispatches it to the same
 * use-cases the admin UI calls, so the console cannot drift from the console
 * pages: every mutation also lands in the audit log / event log through those
 * services. Nothing here talks to the UI — it returns message *codes* plus
 * structured rows; `actions.ts` resolves them against the dictionaries.
 */

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { publish } from "@/lib/realtime/bus";
import { CHAT_ROOM } from "@/lib/realtime/protocol";
import { createChatMessage } from "@/lib/modules/chat/repository";
import {
  deleteCatalogGame,
  getGameById,
  listCatalogGames,
  listPendingCompletionRequests,
  listPendingRerollRequests,
  setGameBlacklisted,
} from "@/lib/modules/catalog/repository";
import { countPendingEventSubmissions } from "@/lib/modules/iee/repository";
import { notifySeasonParticipants, notifyStaff, notifyUser } from "@/lib/modules/notifications/service";
import {
  adminSetUserBlocked,
  adminVerifyEmail,
  listUsers,
  type AdminUserRow,
} from "@/lib/modules/player/service/admin";
import { getLeaderboard, getSeasonPlayerForUser } from "@/lib/modules/season/repository/players";
import { getSeasonById, getSeasonBySlug, listSeasons } from "@/lib/modules/season/repository/seasons";
import { adminAddPlayer, adminAdjustPlayer, adminRemovePlayer } from "@/lib/modules/season/service/players";
import { changeSeasonStatus, resetSeason } from "@/lib/modules/season/service/seasons";
import { AdminError } from "@/lib/modules/season/service/errors";
import type { CatalogGame, Season } from "@/db/schema";
import {
  parseInput,
  PLAYER_STATUSES,
  SEASON_STATUSES,
  TOGGLE_VALUES,
  type ArgName,
  type ParsedInput,
} from "@/lib/shared/admin-console";

export interface CommandRow {
  text: string;
  hint?: string;
  href?: string;
}

export interface CommandOutcome {
  ok: boolean;
  /** Key into `adminConsole.result` (success and validation) dictionaries. */
  code: string;
  params?: Record<string, string | number>;
  rows?: CommandRow[];
  navigate?: string;
  /** Server-rendered admin pages should re-fetch (data changed). */
  refresh?: boolean;
}

/** Console-level failure (bad input, unknown reference) — resolved from the console dictionary. */
class CommandError extends Error {
  constructor(
    readonly code: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "CommandError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSeason(ref: string): Promise<Season> {
  const bySlug = await getSeasonBySlug(ref);
  if (bySlug) return bySlug;
  if (UUID_RE.test(ref)) {
    const byId = await getSeasonById(ref);
    if (byId) return byId;
  }
  const q = ref.toLowerCase();
  const matches = (await listSeasons()).filter(
    (s) => s.slug.toLowerCase().includes(q) || s.title.toLowerCase().includes(q),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new CommandError("seasonNotFound", { ref });
  throw new CommandError("seasonAmbiguous", { ref, count: matches.length });
}

async function resolveGame(ref: string): Promise<CatalogGame> {
  if (UUID_RE.test(ref)) {
    const byId = await getGameById(ref);
    if (byId) return byId;
  }
  const q = ref.toLowerCase();
  const all = await listCatalogGames();
  const exact = all.filter((g) => g.title.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const partial = all.filter((g) => g.title.toLowerCase().includes(q));
  if (exact.length === 0 && partial.length === 1) return partial[0];
  if (exact.length === 0 && partial.length === 0) throw new CommandError("gameNotFound", { ref });
  throw new CommandError("gameAmbiguous", { ref, count: exact.length || partial.length });
}

async function resolveUser(ref: string): Promise<AdminUserRow> {
  const q = ref.toLowerCase();
  const rows = await listUsers(ref);
  const exact =
    rows.find((u) => u.username.toLowerCase() === q) ??
    rows.find((u) => (u.email ?? "").toLowerCase() === q);
  if (exact) return exact;
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CommandError("userNotFound", { ref });
  throw new CommandError("userAmbiguous", { ref, count: rows.length });
}

/** Validates an enum argument; the error names the allowed values. */
function requireEnum<T extends string>(value: string, allowed: readonly T[], arg: ArgName): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new CommandError("invalidArg", { arg, value, options: allowed.join(", ") });
}

async function requireActor() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") throw new AdminError("adminStaffRequired");
  return actor;
}

/** Trailing free-text argument, quotes already stripped by the tokenizer. */
function restText(parsed: ParsedInput, from: number): string {
  return parsed.argTokens.slice(from).join(" ").trim();
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Runs one console line. Console-level errors come back as `ok:false` outcomes;
 *  domain errors (AdminError) propagate for the action to translate. */
export async function executeAdminCommand(input: string): Promise<CommandOutcome> {
  const actor = await requireActor();
  const parsed = parseInput(input);
  const { command, argTokens } = parsed;

  if (!command) {
    return { ok: false, code: "unknownCommand", params: { input: input.trim() } };
  }

  const required = command.args.filter((a) => !a.optional).length;
  if (argTokens.length < required) {
    return {
      ok: false,
      code: "missingArg",
      params: { arg: command.args[argTokens.length]?.name ?? "" },
    };
  }

  try {
    switch (command.name) {
      // --- seasons ---------------------------------------------------------
      case "seasons": {
        const all = await listSeasons();
        return {
          ok: true,
          code: "seasonList",
          params: { count: all.length },
          rows: all.map((s) => ({
            text: s.title,
            hint: `${s.slug} · ${s.status}`,
            href: `/admin/seasons/${s.id}`,
          })),
        };
      }
      case "season": {
        const season = await resolveSeason(argTokens[0]);
        const roster = await getLeaderboard(season.id);
        return {
          ok: true,
          code: "seasonInfo",
          params: { title: season.title, slug: season.slug, status: season.status, players: roster.length },
          rows: [{ text: season.title, hint: `${season.slug} · ${season.status}`, href: `/admin/seasons/${season.id}` }],
        };
      }
      case "season status": {
        const season = await resolveSeason(argTokens[0]);
        const status = requireEnum(argTokens[1], SEASON_STATUSES, "status");
        await changeSeasonStatus(season.id, status);
        log.info("console.season_status", { actorId: actor.id, seasonId: season.id, status });
        return {
          ok: true,
          code: "seasonStatusChanged",
          params: { title: season.title, status },
          refresh: true,
        };
      }
      case "season reset": {
        const season = await resolveSeason(argTokens[0]);
        await resetSeason(season.id);
        log.info("console.season_reset", { actorId: actor.id, seasonId: season.id });
        return { ok: true, code: "seasonReset", params: { title: season.title }, refresh: true };
      }
      case "season roster": {
        const season = await resolveSeason(argTokens[0]);
        const roster = await getLeaderboard(season.id);
        return {
          ok: true,
          code: "seasonRoster",
          params: { title: season.title, count: roster.length },
          rows: roster.map((p) => ({
            text: p.displayName ?? p.username,
            hint: `${p.username} · pos ${p.position} · ${p.balancePoints} pts · ${p.status}`,
            href: `/admin/users/${p.playerId}`,
          })),
        };
      }

      // --- players ---------------------------------------------------------
      case "player add": {
        const season = await resolveSeason(argTokens[0]);
        const user = await resolveUser(argTokens[1]);
        await adminAddPlayer(season.id, user.id);
        log.info("console.player_add", { actorId: actor.id, seasonId: season.id, userId: user.id });
        return {
          ok: true,
          code: "playerAdded",
          params: { user: user.username, season: season.title },
          refresh: true,
        };
      }
      case "player remove": {
        const season = await resolveSeason(argTokens[0]);
        const user = await resolveUser(argTokens[1]);
        await adminRemovePlayer(season.id, user.id);
        log.info("console.player_remove", { actorId: actor.id, seasonId: season.id, userId: user.id });
        return {
          ok: true,
          code: "playerRemoved",
          params: { user: user.username, season: season.title },
          refresh: true,
        };
      }
      case "player position":
      case "player points": {
        const season = await resolveSeason(argTokens[0]);
        const user = await resolveUser(argTokens[1]);
        const value = Number(argTokens[2]);
        if (!Number.isFinite(value)) {
          return { ok: false, code: "invalidNumber", params: { arg: "value", value: argTokens[2] } };
        }
        const seasonPlayer = await getSeasonPlayerForUser(season.id, user.id);
        if (!seasonPlayer) throw new CommandError("playerNotInSeason", { user: user.username, season: season.title });
        await adminAdjustPlayer({
          seasonPlayerId: seasonPlayer.id,
          ...(command.name === "player position" ? { position: value } : { balancePoints: value }),
          reason: "admin console",
        });
        log.info("console.player_adjust", { actorId: actor.id, seasonPlayerId: seasonPlayer.id, field: command.name });
        return {
          ok: true,
          code: command.name === "player position" ? "playerPositionSet" : "playerPointsSet",
          params: { user: user.username, value },
          refresh: true,
        };
      }
      case "player status": {
        const season = await resolveSeason(argTokens[0]);
        const user = await resolveUser(argTokens[1]);
        const status = requireEnum(argTokens[2], PLAYER_STATUSES, "status");
        const seasonPlayer = await getSeasonPlayerForUser(season.id, user.id);
        if (!seasonPlayer) throw new CommandError("playerNotInSeason", { user: user.username, season: season.title });
        await adminAdjustPlayer({ seasonPlayerId: seasonPlayer.id, status, reason: "admin console" });
        log.info("console.player_status", { actorId: actor.id, seasonPlayerId: seasonPlayer.id, status });
        return { ok: true, code: "playerStatusSet", params: { user: user.username, status }, refresh: true };
      }
      case "player block": {
        const user = await resolveUser(argTokens[0]);
        const blocked = requireEnum(argTokens[1], TOGGLE_VALUES, "status") === "on";
        await adminSetUserBlocked(user.id, blocked);
        log.info("console.player_block", { actorId: actor.id, userId: user.id, blocked });
        return { ok: true, code: blocked ? "playerBlocked" : "playerUnblocked", params: { user: user.username }, refresh: true };
      }
      case "player verify": {
        const user = await resolveUser(argTokens[0]);
        await adminVerifyEmail(user.id);
        log.info("console.player_verify", { actorId: actor.id, userId: user.id });
        return { ok: true, code: "playerVerified", params: { user: user.username }, refresh: true };
      }
      case "user": {
        const user = await resolveUser(argTokens[0]);
        return {
          ok: true,
          code: "userInfo",
          params: { user: user.username },
          rows: [
            { text: user.username, hint: user.email ?? "—", href: `/admin/users/${user.id}` },
            { text: `role: ${user.role}` },
            { text: `blocked: ${user.isBlocked ? "yes" : "no"}` },
            { text: `created: ${user.createdAt.toISOString().slice(0, 10)}` },
          ],
        };
      }

      // --- games -----------------------------------------------------------
      case "games": {
        const query = argTokens[0]?.toLowerCase() ?? "";
        const all = await listCatalogGames();
        const matches = query ? all.filter((g) => g.title.toLowerCase().includes(query)) : all;
        const shown = matches.slice(0, 25);
        return {
          ok: true,
          code: "gameList",
          params: { count: matches.length, shown: shown.length, query: argTokens[0] ?? "" },
          rows: shown.map((g) => ({
            text: g.title,
            hint: `${g.isBlacklisted ? "blacklisted · " : ""}${g.platform ?? "—"}`,
          })),
        };
      }
      case "game blacklist": {
        const game = await resolveGame(argTokens[0]);
        const blacklisted = requireEnum(argTokens[1], TOGGLE_VALUES, "status") === "on";
        await setGameBlacklisted(game.id, blacklisted);
        log.info("console.game_blacklist", { actorId: actor.id, gameId: game.id, blacklisted });
        return { ok: true, code: blacklisted ? "gameBlacklisted" : "gameUnblacklisted", params: { game: game.title } };
      }
      case "game delete": {
        const game = await resolveGame(argTokens[0]);
        await deleteCatalogGame(game.id);
        log.info("console.game_delete", { actorId: actor.id, gameId: game.id });
        return { ok: true, code: "gameDeleted", params: { game: game.title } };
      }

      // --- chat / notifications -------------------------------------------
      case "say": {
        const content = restText(parsed, 0);
        if (!content) return { ok: false, code: "textRequired", params: { arg: "text" } };
        try {
          const msg = await createChatMessage({ userId: actor.id, content });
          publish(CHAT_ROOM, "chat:message", {
            id: msg.id,
            userId: msg.userId,
            content: msg.content,
            createdAt: msg.createdAt.toISOString(),
            username: msg.username,
            displayName: msg.displayName,
            avatarUrl: msg.avatarUrl,
            role: msg.role,
          });
        } catch (e) {
          if (e instanceof Error && e.message === "RATE_LIMITED") {
            return { ok: false, code: "rateLimited" };
          }
          if (e instanceof Error && (e.message === "EMPTY_CONTENT" || e.message === "CONTENT_TOO_LONG")) {
            return { ok: false, code: "textRequired", params: { arg: "text" } };
          }
          throw e;
        }
        log.info("console.chat_say", { actorId: actor.id });
        return { ok: true, code: "chatPosted" };
      }
      case "notify user": {
        const user = await resolveUser(argTokens[0]);
        const note = restText(parsed, 1);
        if (!note) return { ok: false, code: "textRequired", params: { arg: "text" } };
        await notifyUser(user.id, "admin_broadcast", { params: { note }, data: { note } });
        log.info("console.notify_user", { actorId: actor.id, userId: user.id });
        return { ok: true, code: "notifiedUser", params: { user: user.username } };
      }
      case "notify season": {
        const season = await resolveSeason(argTokens[0]);
        const note = restText(parsed, 1);
        if (!note) return { ok: false, code: "textRequired", params: { arg: "text" } };
        await notifySeasonParticipants(season.id, "admin_broadcast", {
          params: { note },
          data: { note, seasonId: season.id, seasonSlug: season.slug, seasonTitle: season.title },
        });
        log.info("console.notify_season", { actorId: actor.id, seasonId: season.id });
        return { ok: true, code: "notifiedSeason", params: { season: season.title } };
      }
      case "notify staff": {
        const note = restText(parsed, 0);
        if (!note) return { ok: false, code: "textRequired", params: { arg: "text" } };
        await notifyStaff("admin_broadcast", { params: { note }, data: { note } });
        log.info("console.notify_staff", { actorId: actor.id });
        return { ok: true, code: "notifiedStaff" };
      }

      // --- system ----------------------------------------------------------
      case "moderation": {
        const [rerolls, completions, events] = await Promise.all([
          listPendingRerollRequests(),
          listPendingCompletionRequests(),
          countPendingEventSubmissions(),
        ]);
        return {
          ok: true,
          code: "moderationSummary",
          params: { rerolls: rerolls.length, completions: completions.length, events },
          rows: [
            { text: `rerolls: ${rerolls.length}`, href: "/admin/moderation" },
            { text: `completions: ${completions.length}`, href: "/admin/moderation" },
            { text: `event submissions: ${events}`, href: "/admin/moderation" },
          ],
        };
      }
      case "whoami": {
        return {
          ok: true,
          code: "whoami",
          params: { user: actor.username },
          rows: [
            { text: actor.username, href: `/admin/users/${actor.id}` },
            { text: `role: ${actor.role}` },
            { text: `email: ${actor.email ?? "—"}` },
          ],
        };
      }
      // Client-side commands never reach here.
      case "open":
      case "help":
      case "clear":
      default:
        return { ok: false, code: "unknownCommand", params: { input: input.trim() } };
    }
  } catch (e) {
    if (e instanceof CommandError) {
      return { ok: false, code: e.code, params: e.params };
    }
    throw e;
  }
}
