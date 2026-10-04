"use client";

import { Command } from "cmdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { runAdminCommandAction } from "@/lib/modules/admin-console/actions";
import type { CommandRow } from "@/lib/modules/admin-console/execute";
import {
  ADMIN_COMMANDS,
  applySuggestion,
  buildSuggestions,
  COMMAND_GROUPS,
  commandKey,
  hasRequiredArgs,
  OPEN_TARGETS,
  parseInput,
  type CommandSpec,
  type Suggestion,
} from "@/lib/shared/admin-console";

import { useArgSuggestions } from "./useArgSuggestions";
import type { ConsoleSeason } from "./CommandPaletteProvider";

interface ConsoleRow extends CommandRow {
  /** Help output: clicking the row seeds the input with this command. */
  command?: string;
}

interface ConsoleEntry {
  id: number;
  input: string;
  ok: boolean;
  message: string;
  rows?: ConsoleRow[];
}

const ITEM_CLASS =
  "flex cursor-pointer items-baseline gap-2 px-3 py-1.5 font-mono text-xs text-zinc-300 " +
  "data-[selected=true]:bg-amber/15 data-[selected=true]:text-amber";

const GROUP_HEADING_CLASS =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 " +
  "[&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] " +
  "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest " +
  "[&_[cmdk-group-heading]]:text-dim";

function suggestionKey(s: Suggestion): string {
  return s.kind === "command" ? `cmd:${s.command.name}` : `arg:${s.argIndex}:${s.option.value}`;
}

function usage(spec: CommandSpec): string {
  return spec.args.map((a) => (a.optional ? `[${a.name}]` : `<${a.name}>`)).join(" ");
}

/**
 * Admin command console: a Ctrl+K terminal over the same use-cases as the
 * console pages. Type a command, Tab/click to accept a suggestion, Enter to
 * run. Destructive commands ask for a second Enter.
 */
export function CommandPalette({
  open,
  onClose,
  seasons,
}: {
  open: boolean;
  onClose: () => void;
  seasons: ConsoleSeason[];
}) {
  const router = useRouter();
  const { t } = useI18n();

  const [input, setInput] = useState("");
  const [selected, setSelected] = useState("");
  const [history, setHistory] = useState<ConsoleEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmInput, setConfirmInput] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  const parsed = useMemo(() => parseInput(input), [input]);
  const canRun = hasRequiredArgs(parsed);
  const { options: dynamicOptions, loading } = useArgSuggestions(parsed, seasons);
  const suggestions = useMemo(() => buildSuggestions(parsed, dynamicOptions), [parsed, dynamicOptions]);
  const descriptions = t.adminConsole.commands as Record<string, string>;

  useEffect(() => {
    setSelected(suggestions[0] ? suggestionKey(suggestions[0]) : "");
  }, [suggestions]);

  useEffect(() => {
    if (!open) {
      setInput("");
      setSelected("");
      setConfirmInput(null);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  function push(entry: Omit<ConsoleEntry, "id">) {
    idRef.current += 1;
    const id = idRef.current;
    setHistory((h) => [...h, { ...entry, id }]);
  }

  function helpEntry(query: string): Omit<ConsoleEntry, "id"> {
    const q = query.trim().toLowerCase();
    const rows = ADMIN_COMMANDS.filter((s) => !q || s.name.includes(q)).map((s) => ({
      text: s.name + (usage(s) ? ` ${usage(s)}` : ""),
      hint: descriptions[commandKey(s.name)] ?? "",
      command: s.name,
    }));
    return { input: `help${query ? ` ${query}` : ""}`, ok: true, message: "", rows };
  }

  async function run(raw: string, confirmed = false) {
    const trimmed = raw.trim();
    if (!trimmed || busy) return;
    const p = parseInput(trimmed);

    if (!p.command) {
      push({
        input: trimmed,
        ok: false,
        message: format(t.adminConsole.result.unknownCommand, { input: trimmed }),
      });
      setInput("");
      setConfirmInput(null);
      return;
    }

    const name = p.command.name;
    if (name === "clear") {
      setHistory([]);
      setInput("");
      setConfirmInput(null);
      return;
    }
    if (name === "open") {
      const target = OPEN_TARGETS.find((x) => x.value === p.argTokens[0]);
      if (!target) {
        push({
          input: trimmed,
          ok: false,
          message: format(t.adminConsole.result.invalidArg, {
            arg: t.adminConsole.args.section,
            value: p.argTokens[0] ?? "",
            options: OPEN_TARGETS.map((x) => x.value).join(", "),
          }),
        });
        setInput("");
        return;
      }
      setInput("");
      setConfirmInput(null);
      onClose();
      router.push(target.href);
      return;
    }
    if (name === "help") {
      push(helpEntry(p.argTokens[0] ?? ""));
      setInput("");
      setConfirmInput(null);
      return;
    }
    if (p.command.danger && !confirmed) {
      setConfirmInput(trimmed);
      return;
    }

    setConfirmInput(null);
    setBusy(true);
    try {
      const result = await runAdminCommandAction(trimmed);
      push({ input: trimmed, ok: result.ok, message: result.message, rows: result.rows });
      if (result.ok && result.navigate) {
        onClose();
        router.push(result.navigate);
      }
      if (result.ok && result.refresh) router.refresh();
    } catch {
      push({ input: trimmed, ok: false, message: t.core.errors.formUnknown });
    } finally {
      setBusy(false);
      setInput("");
    }
  }

  function accept(suggestion: Suggestion) {
    setInput(applySuggestion(parsed, suggestion));
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      const suggestion = suggestions.find((x) => suggestionKey(x) === selected) ?? suggestions[0];
      if (suggestion) accept(suggestion);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (confirmInput) {
        void run(confirmInput, true);
        return;
      }
      const suggestion = suggestions.find((x) => suggestionKey(x) === selected) ?? null;
      if (suggestion?.kind === "command") {
        accept(suggestion);
        return;
      }
      if (suggestion?.kind === "arg" && suggestion.option.value !== parsed.argPartial) {
        accept(suggestion);
        return;
      }
      void run(input);
    }
  }

  function renderEntry(entry: ConsoleEntry) {
    return (
      <div key={entry.id} className="mb-3">
        <div className="flex gap-2 text-zinc-300">
          <span className="text-amber">$</span>
          <span className="break-all">{entry.input}</span>
        </div>
        {entry.message && (
          <div className={`mt-1 flex items-start gap-1.5 ${entry.ok ? "text-military" : "text-danger"}`}>
            {entry.ok ? (
              <CheckIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            ) : (
              <XMarkIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            )}
            <span className="break-words">{entry.message}</span>
          </div>
        )}
        {entry.rows && entry.rows.length > 0 && (
          <ul className="mt-1 border-l border-[#3d3d34] pl-3">
            {entry.rows.map((row, i) => (
              <li key={`${entry.id}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                {row.command ? (
                  <button
                    type="button"
                    onClick={() => {
                      setInput(`${row.command} `);
                      inputRef.current?.focus();
                    }}
                    className="text-left text-amber hover:underline"
                  >
                    {row.text}
                  </button>
                ) : row.href ? (
                  <Link href={row.href} onClick={onClose} className="text-amber hover:underline">
                    {row.text}
                  </Link>
                ) : (
                  <span>{row.text}</span>
                )}
                {row.hint && <span className="font-mono text-[10px] text-dim">{row.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function renderSuggestion(suggestion: Suggestion) {
    const key = suggestionKey(suggestion);
    if (suggestion.kind === "command") {
      const args = usage(suggestion.command);
      return (
        <Command.Item key={key} value={key} onSelect={() => accept(suggestion)} className={ITEM_CLASS}>
          <span className="text-amber">
            {suggestion.command.name}
            {args ? ` ${args}` : ""}
          </span>
          <span className="ml-auto truncate font-mono text-[10px] text-dim">
            {descriptions[commandKey(suggestion.command.name)] ?? ""}
          </span>
        </Command.Item>
      );
    }
    return (
      <Command.Item key={key} value={key} onSelect={() => accept(suggestion)} className={ITEM_CLASS}>
        <span>{suggestion.option.label}</span>
        {suggestion.option.hint && (
          <span className="ml-auto truncate font-mono text-[10px] text-dim">{suggestion.option.hint}</span>
        )}
      </Command.Item>
    );
  }

  const grouped = input.trim().length === 0;
  const showEmpty = suggestions.length === 0 && !busy && !loading;

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-3xl !p-0" labelledBy={t.adminConsole.title}>
      <Command
        label={t.adminConsole.title}
        shouldFilter={false}
        loop
        vimBindings={false}
        value={selected}
        onValueChange={setSelected}
        className="flex max-h-[80vh] flex-col"
      >
        <header className="flex items-center justify-between border-b border-[#3d3d34] px-4 py-2.5">
          <span className="font-display text-sm uppercase tracking-widest text-military">
            {t.adminConsole.title}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {t.adminConsole.kicker} · {t.adminConsole.openHint}
          </span>
        </header>

        <div className="min-h-[6rem] flex-1 overflow-y-auto px-4 py-3 font-mono text-xs">
          {history.length === 0 ? (
            <p className="text-dim">{t.adminConsole.sessionEmpty}</p>
          ) : (
            history.map(renderEntry)
          )}
        </div>

        <Command.List
          label={t.adminConsole.suggestions}
          className="max-h-56 overflow-y-auto border-t border-[#3d3d34] py-1"
        >
          {busy && <div className="px-3 py-2 font-mono text-xs text-amber">{t.adminConsole.busy}</div>}
          {loading && <div className="px-3 py-2 font-mono text-xs text-dim">{t.adminConsole.loading}</div>}
          {showEmpty && (
            <Command.Empty className="px-3 py-2 font-mono text-xs text-dim">
              {t.adminConsole.noResults}
            </Command.Empty>
          )}
          {grouped
            ? COMMAND_GROUPS.map((group) => {
                const items = suggestions.filter(
                  (s) => s.kind === "command" && s.command.group === group,
                );
                if (items.length === 0) return null;
                return (
                  <Command.Group key={group} heading={t.adminConsole.groups[group]} className={GROUP_HEADING_CLASS}>
                    {items.map(renderSuggestion)}
                  </Command.Group>
                );
              })
            : suggestions.map(renderSuggestion)}
        </Command.List>

        {confirmInput && (
          <div className="flex items-center gap-2 border-t border-danger/50 bg-danger/10 px-4 py-2 font-mono text-xs text-danger">
            <span className="font-display uppercase tracking-widest">{t.adminConsole.confirmTitle}</span>
            <span className="text-dim">{t.adminConsole.confirmHint}</span>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-[#3d3d34] px-4 py-2.5 font-mono text-sm">
          <span className="shrink-0 text-amber">ggrun://admin $</span>
          <Command.Input
            ref={inputRef}
            autoFocus
            value={input}
            onValueChange={(v) => {
              setInput(v);
              setConfirmInput(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t.adminConsole.placeholder}
            className="w-full bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          {busy && <span className="shrink-0 animate-pulse text-amber">█</span>}
        </div>

        <footer className="flex items-center gap-4 border-t border-[#3d3d34] px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-dim">
          <span>Tab · {t.adminConsole.hintComplete}</span>
          <span>Enter · {t.adminConsole.hintRun}</span>
          <span>Esc · {t.adminConsole.hintClose}</span>
          {canRun && <span className="ml-auto text-military">{t.adminConsole.run}</span>}
        </footer>
      </Command>
    </Modal>
  );
}
