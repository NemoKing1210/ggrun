/**
 * Admin command console — the static contract shared by the client palette and
 * the server executor. Pure data + types: no DB, no i18n, no Next.
 *
 * Adding a command takes three edits:
 *   1. a spec in `ADMIN_COMMANDS` below,
 *   2. a `case` in `lib/modules/admin-console/execute.ts`,
 *   3. a description under `adminConsole.commands` in en/ru/uk dictionaries.
 */

export const COMMAND_GROUPS = [
  "nav",
  "season",
  "player",
  "game",
  "bots",
  "chat",
  "notify",
  "system",
] as const;

export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/** Where an argument's completions come from. */
export type ArgKind = "season" | "user" | "game" | "bot" | "text" | "rest" | "enum" | "number";

/** Kinds the client fills from live data (server lookup) instead of a static list. */
export const DYNAMIC_ARG_KINDS = ["season", "user", "game", "bot"] as const;
export type DynamicArgKind = (typeof DYNAMIC_ARG_KINDS)[number];

export function isDynamicArgKind(kind: ArgKind): kind is DynamicArgKind {
  return (DYNAMIC_ARG_KINDS as readonly string[]).includes(kind);
}

export type ArgName =
  | "season"
  | "user"
  | "game"
  | "run"
  | "value"
  | "section"
  | "status"
  | "text"
  | "query";

export interface ArgSpec {
  name: ArgName;
  kind: ArgKind;
  /** Allowed values for `enum` args. */
  options?: readonly string[];
  /** Trailing args may be omitted. */
  optional?: boolean;
  /** Whether the arg is a free-text tail (`say`, `notify … <text>`). */
  rest?: boolean;
}

export interface CommandSpec {
  /** Full command, space-separated (`season status`). */
  name: string;
  group: CommandGroup;
  args: readonly ArgSpec[];
  /** Destructive: the palette asks for a second Enter before running. */
  danger?: boolean;
  /** Hidden from the "no input" catalogue but still runnable. */
  hidden?: boolean;
}

export const SEASON_STATUSES = ["draft", "active", "paused", "finished", "archived"] as const;
export const PLAYER_STATUSES = ["active", "finished", "eliminated", "withdrawn"] as const;
export const TOGGLE_VALUES = ["on", "off"] as const;

/** Sections of the `system` diagnostics command. */
export const SYSTEM_SECTIONS = ["overview", "sockets", "notifications"] as const;

/** Quick navigation targets for `open <section>`. */
export const OPEN_TARGETS: ReadonlyArray<{ value: string; href: string }> = [
  { value: "site", href: "/" },
  { value: "dashboard", href: "/dashboard" },
  { value: "board", href: "/board" },
  { value: "leaderboard", href: "/leaderboard" },
  { value: "feed", href: "/feed" },
  { value: "seasons", href: "/seasons" },
  { value: "notifications", href: "/notifications" },
  { value: "admin", href: "/admin" },
  { value: "admin/seasons", href: "/admin/seasons" },
  { value: "admin/users", href: "/admin/users" },
  { value: "admin/games", href: "/admin/games" },
  { value: "admin/catalog", href: "/admin/catalog" },
  { value: "admin/moderation", href: "/admin/moderation" },
  { value: "admin/audit", href: "/admin/audit" },
  { value: "admin/settings", href: "/admin/settings" },
];

const OPEN_VALUES = OPEN_TARGETS.map((t) => t.value);

export const ADMIN_COMMANDS: readonly CommandSpec[] = [
  // --- navigation -----------------------------------------------------------
  { name: "open", group: "nav", args: [{ name: "section", kind: "enum", options: OPEN_VALUES }] },

  // --- seasons --------------------------------------------------------------
  { name: "seasons", group: "season", args: [] },
  { name: "season", group: "season", args: [{ name: "season", kind: "season" }] },
  {
    name: "season status",
    group: "season",
    args: [
      { name: "season", kind: "season" },
      { name: "status", kind: "enum", options: SEASON_STATUSES },
    ],
  },
  {
    name: "season reset",
    group: "season",
    args: [{ name: "season", kind: "season" }],
    danger: true,
  },
  { name: "season roster", group: "season", args: [{ name: "season", kind: "season" }] },

  // --- players --------------------------------------------------------------
  {
    name: "player add",
    group: "player",
    args: [
      { name: "season", kind: "season" },
      { name: "user", kind: "user" },
    ],
  },
  {
    name: "player remove",
    group: "player",
    args: [
      { name: "season", kind: "season" },
      { name: "user", kind: "user" },
    ],
    danger: true,
  },
  {
    name: "player position",
    group: "player",
    args: [
      { name: "season", kind: "season" },
      { name: "user", kind: "user" },
      { name: "value", kind: "number" },
    ],
  },
  {
    name: "player points",
    group: "player",
    args: [
      { name: "season", kind: "season" },
      { name: "user", kind: "user" },
      { name: "value", kind: "number" },
    ],
  },
  {
    name: "player status",
    group: "player",
    args: [
      { name: "season", kind: "season" },
      { name: "user", kind: "user" },
      { name: "status", kind: "enum", options: PLAYER_STATUSES },
    ],
  },
  {
    name: "player block",
    group: "player",
    args: [
      { name: "user", kind: "user" },
      { name: "status", kind: "enum", options: TOGGLE_VALUES },
    ],
  },
  { name: "player verify", group: "player", args: [{ name: "user", kind: "user" }] },
  { name: "user", group: "player", args: [{ name: "user", kind: "user" }] },

  // --- games ----------------------------------------------------------------
  { name: "games", group: "game", args: [{ name: "query", kind: "text", optional: true }] },
  {
    name: "game blacklist",
    group: "game",
    args: [
      { name: "game", kind: "game" },
      { name: "status", kind: "enum", options: TOGGLE_VALUES },
    ],
  },
  { name: "game delete", group: "game", args: [{ name: "game", kind: "game" }], danger: true },

  // --- test bots ------------------------------------------------------------
  { name: "bots", group: "bots", args: [{ name: "season", kind: "season", optional: true }] },
  { name: "bot", group: "bots", args: [{ name: "run", kind: "bot" }] },
  {
    name: "bot create",
    group: "bots",
    args: [
      { name: "season", kind: "season" },
      { name: "value", kind: "number", optional: true },
      { name: "value", kind: "number", optional: true },
    ],
  },
  { name: "bot start", group: "bots", args: [{ name: "run", kind: "bot" }] },
  { name: "bot pause", group: "bots", args: [{ name: "run", kind: "bot" }] },
  { name: "bot stop", group: "bots", args: [{ name: "run", kind: "bot" }] },
  { name: "bot restart", group: "bots", args: [{ name: "run", kind: "bot" }] },
  {
    name: "bot tick",
    group: "bots",
    args: [
      { name: "run", kind: "bot" },
      { name: "value", kind: "number", optional: true },
    ],
  },
  {
    name: "bot logs",
    group: "bots",
    args: [
      { name: "run", kind: "bot" },
      { name: "value", kind: "number", optional: true },
    ],
  },
  { name: "bot cleanup", group: "bots", args: [{ name: "run", kind: "bot" }], danger: true },

  // --- chat / messages ------------------------------------------------------
  { name: "say", group: "chat", args: [{ name: "text", kind: "text", rest: true }] },

  // --- notifications --------------------------------------------------------
  {
    name: "notify user",
    group: "notify",
    args: [
      { name: "user", kind: "user" },
      { name: "text", kind: "text", rest: true },
    ],
  },
  {
    name: "notify season",
    group: "notify",
    args: [
      { name: "season", kind: "season" },
      { name: "text", kind: "text", rest: true },
    ],
  },
  { name: "notify staff", group: "notify", args: [{ name: "text", kind: "text", rest: true }] },

  // --- system ---------------------------------------------------------------
  {
    name: "system",
    group: "system",
    args: [{ name: "section", kind: "enum", options: SYSTEM_SECTIONS, optional: true }],
  },
  { name: "moderation", group: "system", args: [] },
  { name: "whoami", group: "system", args: [] },
  { name: "help", group: "system", args: [{ name: "query", kind: "text", optional: true }] },
  { name: "clear", group: "system", args: [] },
];

/** `season status` → `seasonStatus`. Keys the dictionaries and the executor dispatch. */
export function commandKey(name: string): string {
  const parts = name.split(/[\s_-]+/).filter(Boolean);
  return parts
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}
