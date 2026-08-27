/**
 * Server-side logger.
 *
 * - Pretty colored output in development (timestamp · LEVEL · app · msg key=value).
 * - Structured JSON in production (one line per record, written to stdout or
 *   stderr by level).
 * - Default level: `debug` in dev, `info` in prod. Override via the `LOG_LEVEL`
 *   environment variable (`debug` | `info` | `warn` | `error` | `fatal`).
 * - Honors `NO_COLOR` and `FORCE_COLOR` (Node conventions).
 * - `.child(bindings)` returns a derived logger with extra context merged into
 *   every record (e.g. `log.child({ requestId })`).
 * - Pass an `Error` in the context as `{ err: someError }` — it is serialized
 *   to `{ name, message, stack, cause }` in both dev and prod output.
 *
 * The engine (`game-engine/`) is pure and never imports this module.
 */
import process from "node:process";

/** Log levels in increasing severity. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type LogContext = Record<string, unknown>;

export type Logger = {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  /** Accepts either a string message or an `Error` instance. */
  error(msg: string | Error, ctx?: LogContext): void;
  /** Accepts either a string message or an `Error` instance. */
  fatal(msg: string | Error, ctx?: LogContext): void;
  /** Returns a derived logger that merges `bindings` into every record. */
  child(bindings: LogContext): Logger;
  /** Replaces the minimum severity for this logger (and its descendants). */
  setLevel(level: LogLevel): void;
};

const isProd = (): boolean => process.env.NODE_ENV === "production";

function envLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (
    raw === "debug" ||
    raw === "info" ||
    raw === "warn" ||
    raw === "error" ||
    raw === "fatal"
  ) {
    return raw;
  }
  return isProd() ? "info" : "debug";
}

const colorEnabled = (): boolean => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") return true;
  return Boolean(process.stdout.isTTY || process.stderr.isTTY);
};

const wrap = (s: string, code: string): string =>
  colorEnabled() ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = (s: string) => wrap(s, "2");
const cyan = (s: string) => wrap(s, "36");
const yellow = (s: string) => wrap(s, "33");
const red = (s: string) => wrap(s, "31");
const magenta = (s: string) => wrap(s, "35");
const bold = (s: string) => wrap(s, "1");
const gray = (s: string) => wrap(s, "90");

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const LEVEL_STYLE: Record<LogLevel, (s: string) => string> = {
  debug: gray,
  info: cyan,
  warn: yellow,
  error: red,
  fatal: magenta,
};

function formatError(err: Error): LogContext {
  return {
    err: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      // `cause` may be a non-serializable value; JSON.stringify drops it then,
      // which is fine — the dev formatter falls back to String().
      cause: err.cause,
    },
  };
}

/**
 * Walks a context and replaces every Error instance with its serialized
 * form so it survives `JSON.stringify` in production.
 */
function serializeCtx(ctx: LogContext | undefined): LogContext {
  if (!ctx) return {};
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = v instanceof Error ? formatError(v).err : v;
  }
  return out;
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "message" in v && "name" in v) {
    const e = v as { name?: string; message?: string };
    return `${e.name ?? "Error"}: ${e.message ?? ""}`;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatCtx(ctx: LogContext | undefined): string {
  if (!ctx) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    parts.push(`${k}=${formatValue(v)}`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function streamFor(level: LogLevel): NodeJS.WriteStream {
  return level === "error" || level === "fatal" ? process.stderr : process.stdout;
}

type Internal = {
  /** Shared by a logger and its children so setLevel() cascades. */
  level: { current: LogLevel };
  bindings: LogContext;
  name: string;
};

function emit(
  internal: Internal,
  level: LogLevel,
  msg: string | Error,
  ctx?: LogContext,
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[internal.level.current]) return;
  const errCtx = msg instanceof Error ? formatError(msg) : {};
  const merged: LogContext = {
    ...internal.bindings,
    ...serializeCtx(errCtx),
    ...serializeCtx(ctx),
  };
  const text = msg instanceof Error ? msg.message : msg;
  const time = new Date().toISOString();

  if (isProd()) {
    const payload = JSON.stringify({ time, level, msg: text, ...merged });
    streamFor(level).write(payload + "\n");
    return;
  }

  const tag = LEVEL_STYLE[level](level.toUpperCase().padEnd(5));
  const line =
    dim(time) +
    " " +
    tag +
    " " +
    bold(internal.name) +
    " " +
    text +
    formatCtx(merged);
  streamFor(level).write(line + "\n");
  const err = merged.err as { stack?: string } | undefined;
  if (err?.stack && (level === "error" || level === "fatal")) {
    streamFor(level).write(gray(err.stack) + "\n");
  }
}

function makeLogger(internal: Internal): Logger {
  return {
    debug(msg: string, ctx?: LogContext) {
      emit(internal, "debug", msg, ctx);
    },
    info(msg: string, ctx?: LogContext) {
      emit(internal, "info", msg, ctx);
    },
    warn(msg: string, ctx?: LogContext) {
      emit(internal, "warn", msg, ctx);
    },
    error(msgOrErr: string | Error, ctx?: LogContext) {
      emit(internal, "error", msgOrErr, ctx);
    },
    fatal(msgOrErr: string | Error, ctx?: LogContext) {
      emit(internal, "fatal", msgOrErr, ctx);
    },
    child(bindings: LogContext): Logger {
      return makeLogger({
        // Share the level reference so setLevel on the parent cascades.
        level: internal.level,
        bindings: { ...internal.bindings, ...bindings },
        name: internal.name,
      });
    },
    setLevel(level: LogLevel) {
      internal.level.current = level;
    },
  };
}

/** Process-wide logger. Default name is "ggrun"; bind context via `.child()`. */
export const log: Logger = makeLogger({
  level: { current: envLevel() },
  bindings: { app: "ggrun" },
  name: "ggrun",
});
