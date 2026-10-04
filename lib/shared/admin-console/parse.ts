/**
 * Admin command console — pure parsing + completion. No React, no DB.
 *
 * The grammar is deliberately shell-like: the first tokens are the command
 * name (`season status`), everything after it is a positional argument.
 * Arguments may be double-quoted so values with spaces stay one token:
 *
 *   game blacklist "Hotline Miami" on
 */

import {
  ADMIN_COMMANDS,
  type ArgSpec,
  type CommandSpec,
} from "./spec";

export interface ArgOption {
  value: string;
  label: string;
  hint?: string;
}

export type Suggestion =
  | { kind: "command"; command: CommandSpec }
  | { kind: "arg"; argIndex: number; option: ArgOption };

export interface ParsedInput {
  input: string;
  tokens: string[];
  endsWithSpace: boolean;
  command: CommandSpec | null;
  /** Raw argument tokens (command name removed). */
  argTokens: string[];
  /** Index of the argument the caret is filling. */
  argIndex: number;
  /** What has been typed into that argument so far ("" for a fresh one). */
  argPartial: string;
  /** The argument being filled, once the command is known. */
  argSpec: ArgSpec | null;
  /** A rest argument swallows every remaining token. */
  restArg: boolean;
}

/** Longest command name first, so `season status run-1` resolves to `season status`. */
const COMMANDS_BY_SPECIFICITY = [...ADMIN_COMMANDS].sort(
  (a, b) => b.name.split(" ").length - a.name.split(" ").length,
);

/** Splits on whitespace; double quotes group a value with spaces into one token. */
export function tokenize(input: string): { tokens: string[]; endsWithSpace: boolean } {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let inQuote = false;

  for (const ch of input) {
    if (ch === '"') {
      inQuote = !inQuote;
      started = true;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) tokens.push(current);

  return { tokens, endsWithSpace: /\s$/.test(input) && !inQuote };
}

export function parseInput(input: string): ParsedInput {
  const { tokens, endsWithSpace } = tokenize(input);

  let command: CommandSpec | null = null;
  for (const spec of COMMANDS_BY_SPECIFICITY) {
    const nameTokens = spec.name.split(" ");
    if (tokens.length >= nameTokens.length && nameTokens.every((t, i) => tokens[i] === t)) {
      command = spec;
      break;
    }
  }

  const nameLength = command ? command.name.split(" ").length : 0;
  const argTokens = command ? tokens.slice(nameLength) : [];
  const restArg = Boolean(command?.args.at(-1)?.rest);

  let argIndex = endsWithSpace ? argTokens.length : Math.max(0, argTokens.length - 1);
  if (command && argIndex >= command.args.length) {
    argIndex = restArg ? command.args.length - 1 : command.args.length;
  }

  const argPartial = restArg
    ? argTokens.slice(argIndex).join(" ")
    : endsWithSpace
      ? ""
      : (argTokens.at(-1) ?? "");

  return {
    input,
    tokens,
    endsWithSpace,
    command,
    argTokens,
    argIndex,
    argPartial,
    argSpec: command ? (command.args[argIndex] ?? null) : null,
    restArg,
  };
}

/** True when every required argument has at least one token. */
export function hasRequiredArgs(parsed: ParsedInput): boolean {
  if (!parsed.command) return false;
  const required = parsed.command.args.filter((a) => !a.optional).length;
  return parsed.argTokens.length >= required;
}

function quote(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/** Suggestions for the current input. `dynamic` supplies season/user/game matches. */
export function buildSuggestions(
  parsed: ParsedInput,
  dynamic: ArgOption[] = [],
): Suggestion[] {
  if (parsed.tokens.length === 0) {
    return ADMIN_COMMANDS.filter((c) => !c.hidden).map((command) => ({
      kind: "command" as const,
      command,
    }));
  }

  const out: Suggestion[] = [];

  // Command-name completions while the name is still being typed.
  if (!parsed.endsWithSpace) {
    const typed = parsed.tokens.join(" ");
    for (const spec of ADMIN_COMMANDS) {
      if (spec.name === typed) continue;
      if (spec.name.startsWith(typed)) out.push({ kind: "command", command: spec });
    }
  }

  // Argument completions for the position under the caret.
  const spec = parsed.argSpec;
  if (spec) {
    if (spec.kind === "enum" && spec.options) {
      const q = parsed.argPartial.toLowerCase();
      for (const option of spec.options) {
        if (option.toLowerCase().includes(q)) out.push({ kind: "arg", argIndex: parsed.argIndex, option: { value: option, label: option } });
      }
    } else {
      out.push(...dynamic.map((option) => ({ kind: "arg" as const, argIndex: parsed.argIndex, option })));
    }
  }

  return out;
}

/** Rewrites the input with a suggestion accepted (command name or argument value). */
export function applySuggestion(parsed: ParsedInput, suggestion: Suggestion): string {
  if (suggestion.kind === "command") return `${suggestion.command.name} `;
  if (!parsed.command) return parsed.input;

  const nameTokens = parsed.command.name.split(" ");
  const committed = parsed.argTokens.slice(0, suggestion.argIndex);
  return [...nameTokens, ...committed, quote(suggestion.option.value)].join(" ") + " ";
}
