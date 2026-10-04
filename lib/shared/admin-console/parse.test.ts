import { describe, expect, it } from "vitest";

import { applySuggestion, buildSuggestions, hasRequiredArgs, parseInput, tokenize } from "./parse";
import { ADMIN_COMMANDS } from "./spec";

describe("tokenize", () => {
  it("splits on whitespace and collapses runs of it", () => {
    expect(tokenize("season  status   run-1").tokens).toEqual(["season", "status", "run-1"]);
    expect(tokenize("season ").endsWithSpace).toBe(true);
    expect(tokenize("season").endsWithSpace).toBe(false);
  });

  it("keeps a double-quoted value with spaces as one token", () => {
    expect(tokenize('game blacklist "Hotline Miami" on').tokens).toEqual([
      "game",
      "blacklist",
      "Hotline Miami",
      "on",
    ]);
  });

  it("does not treat whitespace inside an open quote as a separator", () => {
    const t = tokenize('say "hello ');
    expect(t.tokens).toEqual(["say", "hello "]);
    expect(t.endsWithSpace).toBe(false);
  });
});

describe("parseInput", () => {
  it("prefers the longest command name", () => {
    expect(parseInput("season status run-1 active").command?.name).toBe("season status");
    expect(parseInput("season run-1").command?.name).toBe("season");
  });

  it("resolves the argument under the caret", () => {
    const mid = parseInput("player add run-1 al");
    expect(mid.command?.name).toBe("player add");
    expect(mid.argIndex).toBe(1);
    expect(mid.argPartial).toBe("al");
    expect(mid.argSpec?.name).toBe("user");

    const fresh = parseInput("player add run-1 ");
    expect(fresh.argIndex).toBe(1);
    expect(fresh.argPartial).toBe("");

    const nameOnly = parseInput("season status");
    expect(nameOnly.argIndex).toBe(0);
    expect(nameOnly.argSpec?.name).toBe("season");
  });

  it("folds a rest argument's remaining tokens into one slot", () => {
    const parsed = parseInput("notify staff hello there everyone");
    expect(parsed.command?.name).toBe("notify staff");
    expect(parsed.argIndex).toBe(0);
    expect(parsed.restArg).toBe(true);
    expect(parsed.argPartial).toBe("hello there everyone");
  });

  it("knows when a command has all required arguments", () => {
    expect(hasRequiredArgs(parseInput("season"))).toBe(false);
    expect(hasRequiredArgs(parseInput("season run-1"))).toBe(true);
    expect(hasRequiredArgs(parseInput("player add run-1"))).toBe(false);
    expect(hasRequiredArgs(parseInput("player add run-1 bob"))).toBe(true);
    expect(hasRequiredArgs(parseInput("games"))).toBe(true);
  });

  it("resolves the bot subcommands and their optional arguments", () => {
    const create = parseInput("bot create run-1 5 3");
    expect(create.command?.name).toBe("bot create");
    expect(create.argTokens).toEqual(["run-1", "5", "3"]);
    expect(hasRequiredArgs(create)).toBe(true);

    const bareCreate = parseInput("bot create run-1");
    expect(bareCreate.command?.name).toBe("bot create");
    expect(hasRequiredArgs(bareCreate)).toBe(true);

    expect(hasRequiredArgs(parseInput("bot tick"))).toBe(false);
    expect(hasRequiredArgs(parseInput("bot tick f46d3c77"))).toBe(true);
    expect(parseInput("bot f46d3c77").command?.name).toBe("bot");
    expect(parseInput("bot cleanup f46d3c77").command?.name).toBe("bot cleanup");
  });

  it("treats the system section as an optional argument", () => {
    expect(hasRequiredArgs(parseInput("system"))).toBe(true);
    expect(parseInput("system sockets").argSpec?.name).toBe("section");
    expect(parseInput("system sockets").argTokens).toEqual(["sockets"]);
  });
});

describe("buildSuggestions", () => {
  it("lists the whole catalogue for an empty input", () => {
    const names = buildSuggestions(parseInput("")).map((s) =>
      s.kind === "command" ? s.command.name : s.option.value,
    );
    expect(names).toContain("season status");
    expect(names).toContain("say");
  });

  it("completes a partially typed command name", () => {
    const out = buildSuggestions(parseInput("season stat"));
    const commands = out.filter((s) => s.kind === "command").map((s) => (s.kind === "command" ? s.command.name : ""));
    expect(commands).toContain("season status");
  });

  it("offers enum values filtered by the typed prefix", () => {
    const out = buildSuggestions(parseInput("season status run-1 act"));
    const values = out.filter((s) => s.kind === "arg").map((s) => (s.kind === "arg" ? s.option.value : ""));
    expect(values).toEqual(["active"]);
  });

  it("passes dynamic options through for season/user/game args", () => {
    const out = buildSuggestions(parseInput("season "), [{ value: "run-1", label: "Run 1" }]);
    expect(out).toEqual([{ kind: "arg", argIndex: 0, option: { value: "run-1", label: "Run 1" } }]);
  });
});

describe("applySuggestion", () => {
  it("completes a command name with a trailing space", () => {
    const parsed = parseInput("season stat");
    const spec = ADMIN_COMMANDS.find((c) => c.name === "season status");
    expect(spec).toBeDefined();
    expect(applySuggestion(parsed, { kind: "command", command: spec! })).toBe("season status ");
  });

  it("replaces the argument under the caret and keeps earlier ones", () => {
    const parsed = parseInput("player add run-1 al");
    const next = applySuggestion(parsed, {
      kind: "arg",
      argIndex: 1,
      option: { value: "bob", label: "bob" },
    });
    expect(next).toBe("player add run-1 bob ");
  });

  it("quotes an argument value that contains spaces", () => {
    const parsed = parseInput("game blacklist ");
    const next = applySuggestion(parsed, {
      kind: "arg",
      argIndex: 0,
      option: { value: "Hotline Miami", label: "Hotline Miami" },
    });
    expect(next).toBe('game blacklist "Hotline Miami" ');
  });
});
