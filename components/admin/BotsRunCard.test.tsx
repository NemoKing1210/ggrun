// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { updateBotConfigAction } from "@/lib/modules/bots/actions";

import type { BotRunConfig } from "@/db/schema/bots";
import type { BotActivityBroadcast } from "@/lib/realtime/protocol";

import { BotsRunCard, type ConsoleBotRun, type ConsoleRosterRow } from "./BotsRunCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/seasons/season-1/bots",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/modules/bots/actions", () => ({
  createBotRunAction: vi.fn(),
  pauseBotRunAction: vi.fn(),
  resumeBotRunAction: vi.fn(),
  restartBotRunAction: vi.fn(),
  stopBotRunAction: vi.fn(),
  tickBotsAction: vi.fn(),
  cleanupBotRunAction: vi.fn(),
  updateBotConfigAction: vi.fn(),
}));

const t = getDictionary("en").admin.bots;
const updateConfig = vi.mocked(updateBotConfigAction);

const BASE_CONFIG: BotRunConfig = {
  botCount: 3,
  actionsPerTick: 2,
  tickIntervalMs: 2000,
  passWeight: 70,
  dropWeight: 20,
  rerollWeight: 10,
  enableRoll: true,
  enableResolve: true,
  enableItems: true,
  itemChance: 60,
  autoCleanse: true,
  targetStrategy: "leader",
  stopOnError: false,
};

/** A roster row with every field filled, so tests only state what they vary. */
function rosterRow(overrides: Partial<ConsoleRosterRow> = {}): ConsoleRosterRow {
  return {
    username: "alpha",
    seasonPlayerId: "p1",
    status: "active",
    position: 3,
    balancePoints: 10,
    items: [],
    effects: [],
    counts: { roll: 0, resolve: 0, item: 0, errors: 0 },
    lastAction: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<ConsoleBotRun> = {}): ConsoleBotRun {
  return {
    id: "run-aaaa1111",
    status: "paused",
    config: { ...BASE_CONFIG },
    totalTicks: 5,
    totalActions: 12,
    totalErrors: 3,
    lastError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type CardProps = Parameters<typeof BotsRunCard>[0];

function setup(overrides: Partial<CardProps> = {}) {
  const props: CardProps = {
    run: makeRun(),
    roster: [],
    activity: [],
    isTicking: false,
    busy: false,
    tickIntervalMs: null,
    tickCycle: 0,
    tickingActive: false,
    lastTick: null,
    playerStatusLabels: {},
    t,
    onStart: vi.fn(),
    onRestart: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onStep: vi.fn(),
    onViewLogs: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nProvider locale="en" t={getDictionary("en")}>
      <BotsRunCard {...props} />
    </I18nProvider>,
  );
  return { ...utils, props };
}

/** The settings form is the only form holding an `actionsPerTick` field. */
function settingsForm(container: HTMLElement): HTMLFormElement {
  const field = container.querySelector('input[name="actionsPerTick"]');
  if (!field) throw new Error("settings form not found");
  return field.closest("form") as HTMLFormElement;
}

describe("BotsRunCard", () => {
  beforeEach(() => {
    updateConfig.mockReset();
    updateConfig.mockResolvedValue({});
  });

  afterEach(cleanup);

  it("renders the status badge, stats line and run config line", () => {
    setup({ run: makeRun({ status: "running" }) });
    expect(screen.getByText(t.statusRunning).textContent).toBe(t.statusRunning);
    expect(screen.getByText("12 actions · 3 errors · 5 ticks")).not.toBeNull();
    const config = screen.getByText(/pass 70 \/ drop 20 \/ reroll 10/);
    expect(config.textContent).toContain("3 bots · 2/tick · 2000ms");
    // no last error is surfaced while the run has none
    expect(screen.queryByText(new RegExp(t.lastErrorLabel))).toBeNull();
  });

  it("adds config flags and the last error when they are set", () => {
    setup({
      run: makeRun({
        status: "stopped",
        lastError: "boom",
        config: { ...BASE_CONFIG, enableRoll: false, enableResolve: false, stopOnError: true },
      }),
    });
    expect(screen.getByText(/no-roll/).textContent).toContain("no-resolve");
    expect(screen.getByText(/no-roll/).textContent).toContain("stop-on-error");
    expect(screen.getByText(/Last error: boom/)).not.toBeNull();
  });

  it("calls onStart from Resume on a running run and Start on a paused run", () => {
    const running = setup({ run: makeRun({ status: "running" }) });
    fireEvent.click(screen.getByRole("button", { name: t.resumeButton }));
    expect(running.props.onStart).toHaveBeenCalledWith(running.props.run);
    cleanup();

    const paused = setup({ run: makeRun({ status: "paused" }) });
    fireEvent.click(screen.getByRole("button", { name: t.startButton }));
    expect(paused.props.onStart).toHaveBeenCalledWith(paused.props.run);
  });

  it("switches a stopped run to Restart, disabled without a season member", () => {
    const { props, rerender } = setup({ run: makeRun({ status: "stopped" }) });
    const restart = screen.getByRole("button", { name: t.restartButton }) as HTMLButtonElement;
    expect(restart.disabled).toBe(true);
    fireEvent.click(restart);
    expect(props.onRestart).not.toHaveBeenCalled();

    rerender(
      <I18nProvider locale="en" t={getDictionary("en")}>
        <BotsRunCard
          {...props}
          roster={[rosterRow({ position: 1, balancePoints: 0 })]}
        />
      </I18nProvider>,
    );
    const enabled = screen.getByRole("button", { name: t.restartButton }) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    fireEvent.click(enabled);
    expect(props.onRestart).toHaveBeenCalledWith(props.run);
  });

  it("shows Pause and calls onPause(run.id) while ticking", () => {
    const { props } = setup({ run: makeRun({ status: "running" }), isTicking: true });
    fireEvent.click(screen.getByRole("button", { name: t.pauseButton }));
    expect(props.onPause).toHaveBeenCalledWith(props.run.id);
    expect(screen.getByText(t.tickingLabel)).not.toBeNull();
  });

  it("hides step and stop while ticking or stopped but always shows view logs", () => {
    const paused = setup({ run: makeRun({ status: "paused" }) });
    fireEvent.click(screen.getByRole("button", { name: t.stepButton }));
    expect(paused.props.onStep).toHaveBeenCalledWith(paused.props.run.id);
    fireEvent.click(screen.getByRole("button", { name: t.stopButton }));
    expect(paused.props.onStop).toHaveBeenCalledWith(paused.props.run.id);
    cleanup();

    setup({ run: makeRun({ status: "paused" }), isTicking: true });
    expect(screen.queryByRole("button", { name: t.stepButton })).toBeNull();
    expect(screen.queryByRole("button", { name: t.stopButton })).toBeNull();
    cleanup();

    const stopped = setup({ run: makeRun({ status: "stopped" }) });
    expect(screen.queryByRole("button", { name: t.stepButton })).toBeNull();
    expect(screen.queryByRole("button", { name: t.stopButton })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.viewLogsButton }));
    expect(stopped.props.onViewLogs).toHaveBeenCalledWith(stopped.props.run.id);
  });

  it("maps roster status labels and falls back to em-dashes for missing values", () => {
    const roster: ConsoleRosterRow[] = [
      rosterRow(),
      rosterRow({ username: "beta", seasonPlayerId: null, status: null, position: null, balancePoints: null }),
    ];
    setup({ roster, playerStatusLabels: { active: "Playing" } });
    const alpha = screen.getByText("alpha").closest("li") as HTMLElement;
    expect(alpha.textContent).toContain("Playing");
    expect(alpha.textContent).toContain("3");
    expect(alpha.textContent).toContain("10");
    const beta = screen.getByText("beta").closest("li") as HTMLElement;
    expect(beta.textContent).toContain(t.rosterNoMember);
    // position and balance each fall back to an em dash
    expect(beta.textContent).toContain(`${t.rosterPosition} —`);
    expect(beta.textContent).toContain(`${t.rosterPoints} —`);
  });

  it("shows the idle label when no bot has acted yet", () => {
    setup({ roster: [rosterRow()] });
    expect(screen.getByText(t.rosterIdle)).not.toBeNull();
  });

  it("renders the live activity line for the bot's newest step", () => {
    const step = (fields: Partial<BotActivityBroadcast>): BotActivityBroadcast => ({
      runId: "run-aaaa1111",
      seasonId: "season-1",
      seasonPlayerId: "p1",
      username: "alpha",
      kind: "roll",
      outcome: null,
      itemKey: null,
      targetUsername: null,
      position: null,
      balancePoints: null,
      detail: "…",
      at: new Date().toISOString(),
      ...fields,
    });

    const cases: Array<[Partial<BotActivityBroadcast>, string]> = [
      [{ kind: "roll" }, t.actRolled],
      [{ kind: "resolve", outcome: "passed", position: 12 }, t.actPassed.replace("{position}", "12")],
      [{ kind: "resolve", outcome: "dropped" }, t.actDropped],
      [{ kind: "resolve", outcome: "rerolled" }, t.actRerolled],
      [{ kind: "item", itemKey: "hex_scroll" }, t.actUsedItem.replace("{item}", "Hex Scroll")],
      [
        { kind: "item", itemKey: "hex_scroll", targetUsername: "rival" },
        t.actUsedItemOn.replace("{item}", "Hex Scroll").replace("{target}", "rival"),
      ],
      [{ kind: "skip" }, t.actSkipped],
      [{ kind: "error" }, t.actError],
    ];

    for (const [fields, expected] of cases) {
      cleanup();
      setup({ roster: [rosterRow()], activity: [step(fields)] });
      expect(screen.getByText(expected)).not.toBeNull();
    }
  });

  it("shows the empty label when the run has no roster", () => {
    setup({ roster: [] });
    expect(screen.getByText(t.rosterEmpty)).not.toBeNull();
  });

  it("submits the edited settings as FormData through updateBotConfigAction", () => {
    const { container, props } = setup({ run: makeRun({ id: "run-bbbb2222" }) });
    const form = settingsForm(container);

    const perTick = form.querySelector('input[name="actionsPerTick"]') as HTMLInputElement;
    fireEvent.change(perTick, { target: { value: "4" } });
    // flipping a switch must flow into the hidden enable* field
    fireEvent.click(screen.getByRole("switch", { name: t.enableRollLabel }));

    fireEvent.submit(form);

    expect(updateConfig).toHaveBeenCalledTimes(1);
    const [, fd] = updateConfig.mock.calls[0];
    expect(fd.get("runId")).toBe("run-bbbb2222");
    expect(fd.get("botCount")).toBe("3");
    expect(fd.get("actionsPerTick")).toBe("4");
    expect(fd.get("tickIntervalMs")).toBe("2000");
    expect(fd.get("passWeight")).toBe("70");
    expect(fd.get("dropWeight")).toBe("20");
    expect(fd.get("rerollWeight")).toBe("10");
    expect(fd.get("enableRoll")).toBe("");
    expect(fd.get("enableResolve")).toBe("on");
    expect(fd.get("stopOnError")).toBe("");
    expect(fd.get("enableItems")).toBe("on");
    expect(fd.get("autoCleanse")).toBe("on");
    expect(fd.get("itemChance")).toBe("60");
    expect(fd.get("targetStrategy")).toBe("leader");
    expect(props.onStart).not.toHaveBeenCalled();
  });
});
