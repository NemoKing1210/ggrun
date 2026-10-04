import { describe, expect, it } from "vitest";

import {
  ADMIN_COMMANDS,
  COMMAND_GROUPS,
  commandKey,
  DYNAMIC_ARG_KINDS,
  isDynamicArgKind,
  OPEN_TARGETS,
  PLAYER_STATUSES,
  SEASON_STATUSES,
  SYSTEM_SECTIONS,
  TOGGLE_VALUES,
} from "./spec";

const ARG_KINDS = ["season", "user", "game", "bot", "text", "rest", "enum", "number"] as const;

describe("commandKey", () => {
  it("camel-cases a multi-word command name", () => {
    expect(commandKey("season status")).toBe("seasonStatus");
    expect(commandKey("player position")).toBe("playerPosition");
  });

  it("keeps a single-word command unchanged", () => {
    expect(commandKey("help")).toBe("help");
    expect(commandKey("open")).toBe("open");
  });

  it("treats spaces, hyphens, and underscores as the same separator", () => {
    expect(commandKey("season_status")).toBe("seasonStatus");
    expect(commandKey("season-status")).toBe("seasonStatus");
    expect(commandKey("season   status")).toBe("seasonStatus");
  });
});

describe("isDynamicArgKind", () => {
  it("accepts the server-looked-up kinds", () => {
    for (const kind of DYNAMIC_ARG_KINDS) {
      expect(isDynamicArgKind(kind)).toBe(true);
    }
  });

  it("rejects static kinds", () => {
    expect(isDynamicArgKind("text")).toBe(false);
    expect(isDynamicArgKind("enum")).toBe(false);
    expect(isDynamicArgKind("number")).toBe(false);
  });
});

describe("ADMIN_COMMANDS invariants", () => {
  it("has a command for every declared group", () => {
    const used = new Set(ADMIN_COMMANDS.map((c) => c.group));
    for (const group of COMMAND_GROUPS) {
      expect(used.has(group)).toBe(true);
    }
  });

  it("has unique, non-empty command names", () => {
    const names = ADMIN_COMMANDS.map((c) => c.name);
    expect(names.every((n) => n.trim().length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every command a unique dispatch key", () => {
    const keys = ADMIN_COMMANDS.map((c) => commandKey(c.name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses only known argument kinds", () => {
    for (const command of ADMIN_COMMANDS) {
      for (const arg of command.args) {
        expect(ARG_KINDS).toContain(arg.kind);
      }
    }
  });

  it("gives every enum argument a non-empty option list", () => {
    for (const command of ADMIN_COMMANDS) {
      for (const arg of command.args) {
        if (arg.kind === "enum") {
          expect(arg.options).toBeDefined();
          expect(arg.options!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("places a rest argument last, if present", () => {
    for (const command of ADMIN_COMMANDS) {
      command.args.forEach((arg, i) => {
        if (arg.rest) expect(i).toBe(command.args.length - 1);
      });
    }
  });

  it("keeps navigation targets unique with absolute hrefs", () => {
    const values = OPEN_TARGETS.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
    for (const target of OPEN_TARGETS) {
      expect(target.href.startsWith("/")).toBe(true);
    }
  });

  it("exposes the enum value sets", () => {
    expect(SEASON_STATUSES).toEqual(["draft", "active", "paused", "finished", "archived"]);
    expect(PLAYER_STATUSES).toEqual(["active", "finished", "eliminated", "withdrawn"]);
    expect(TOGGLE_VALUES).toEqual(["on", "off"]);
    expect(SYSTEM_SECTIONS).toEqual(["overview", "sockets", "notifications"]);
  });
});
