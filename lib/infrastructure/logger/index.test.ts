import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function captureStreams(): { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(
    ((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    }) as unknown as typeof process.stdout.write,
  );
  vi.spyOn(process.stderr, "write").mockImplementation(
    ((chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    }) as unknown as typeof process.stderr.write,
  );
  return { stdout, stderr };
}

/**
 * The logger snapshots NODE_ENV/LOG_LEVEL when the module is first evaluated,
 * so each scenario loads a fresh copy against stubbed env.
 */
async function loadLogger(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("FORCE_COLOR", undefined);
  vi.stubEnv("NO_COLOR", undefined);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return await import("./index");
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("dev output", () => {
  it("writes a pretty line with level, app name, message and context", async () => {
    const { stdout, stderr } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "development", LOG_LEVEL: "debug" });

    log.info("server up", { port: 3000 });

    const text = stdout.join("");
    expect(stderr).toEqual([]);
    expect(text).toContain("INFO");
    expect(text).toContain("ggrun");
    expect(text).toContain("server up");
    expect(text).toContain("port=3000");
  });

  it("drops records below the configured level", async () => {
    const { stdout } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "development", LOG_LEVEL: "warn" });

    log.debug("debug-msg");
    log.info("info-msg");
    log.warn("warn-msg");

    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("warn-msg");
    expect(stdout[0]).not.toContain("info-msg");
  });

  it("falls back to debug in dev when LOG_LEVEL is not a known level", async () => {
    const { stdout } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "development", LOG_LEVEL: "verbose" });

    log.info("info-msg");

    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("info-msg");
  });

  it("prints the stack as a second line for error records", async () => {
    const { stderr } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "development", LOG_LEVEL: "debug" });

    log.error(new Error("kaboom"));

    expect(stderr).toHaveLength(2);
    expect(stderr[0]).toContain("kaboom");
    expect(stderr[1]).toContain("at ");
  });
});

describe("production output", () => {
  it("emits one JSON record per call on stdout with the documented shape", async () => {
    const { stdout, stderr } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "production", LOG_LEVEL: "info" });

    log.info("hello", { a: 1, ok: true });

    expect(stderr).toEqual([]);
    expect(stdout).toHaveLength(1);
    const record = JSON.parse(stdout[0]!) as Record<string, unknown>;
    expect(record.level).toBe("info");
    expect(record.msg).toBe("hello");
    expect(record.app).toBe("ggrun");
    expect(record.a).toBe(1);
    expect(record.ok).toBe(true);
    expect(String(record.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("defaults to info in production, so debug records are dropped", async () => {
    const { stdout } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "production", LOG_LEVEL: undefined });

    log.debug("debug-msg");
    log.info("info-msg");

    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("info-msg");
  });

  it("routes warn/info to stdout and error/fatal to stderr", async () => {
    const { stdout, stderr } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "production", LOG_LEVEL: "debug" });

    log.info("info-msg");
    log.fatal("fatal-msg");

    expect(stdout).toHaveLength(1);
    expect(stderr).toHaveLength(1);
    const fatalRecord = JSON.parse(stderr[0]!) as { level: string };
    expect(fatalRecord.level).toBe("fatal");
  });

  it("serializes an Error passed as the message into the err field", async () => {
    const { stderr } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "production", LOG_LEVEL: "info" });

    log.error(new Error("boom", { cause: "root-cause" }));

    expect(stderr).toHaveLength(1);
    const record = JSON.parse(stderr[0]!) as {
      msg: string;
      err: { name: string; message: string; stack: string; cause: string };
    };
    expect(record.msg).toBe("boom");
    expect(record.err.message).toBe("boom");
    expect(record.err.name).toBe("Error");
    expect(record.err.cause).toBe("root-cause");
    expect(typeof record.err.stack).toBe("string");
  });

  it("serializes an Error passed in the context so it survives JSON.stringify", async () => {
    const { stderr } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "production", LOG_LEVEL: "info" });

    log.error("request failed", { err: new Error("inner") });

    const record = JSON.parse(stderr[0]!) as { err: { message: string } };
    expect(record.err.message).toBe("inner");
  });
});

describe("child loggers", () => {
  it("merges bindings and lets call context win on collisions", async () => {
    const { stdout } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "production", LOG_LEVEL: "info" });

    const child = log.child({ requestId: "r1", scope: "auth" });
    child.info("x", { requestId: "r2" });

    const record = JSON.parse(stdout[0]!) as Record<string, unknown>;
    expect(record.requestId).toBe("r2");
    expect(record.scope).toBe("auth");
    expect(record.app).toBe("ggrun");
  });

  it("cascades setLevel from a child to its parent", async () => {
    const { stdout, stderr } = captureStreams();
    const { log } = await loadLogger({ NODE_ENV: "development", LOG_LEVEL: "debug" });

    const child = log.child({ scope: "x" });
    child.setLevel("error");

    log.info("info-msg");
    expect(stdout).toEqual([]);

    child.error("err-msg");
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("err-msg");
  });
});

describe("colors", () => {
  it("wraps text in ANSI codes when FORCE_COLOR wins", async () => {
    const { colors } = await loadLogger({ NODE_ENV: "development", FORCE_COLOR: "1", NO_COLOR: "1" });
    expect(colors.red("x")).toBe("\x1b[31mx\x1b[0m");
    expect(colors.link("u")).toBe("\x1b[36;4mu\x1b[0m");
  });

  it("leaves text untouched when NO_COLOR is set", async () => {
    const { colors } = await loadLogger({ NODE_ENV: "development", NO_COLOR: "1" });
    expect(colors.red("x")).toBe("x");
    expect(colors.bold("y")).toBe("y");
  });
});
