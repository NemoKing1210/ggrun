// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  createBotRunAction,
  resumeBotRunAction,
  tickBotsAction,
} from "@/lib/modules/bots/actions";

import type { BotRunConfig } from "@/db/schema/bots";

import { BotsConsole } from "./BotsConsole";
import type { ConsoleBotLog, ConsoleBotRun } from "./BotsRunCard";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
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
const createRun = vi.mocked(createBotRunAction);
const resumeRun = vi.mocked(resumeBotRunAction);
const tickBots = vi.mocked(tickBotsAction);

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

function makeRun(id: string, status: string): ConsoleBotRun {
  return {
    id,
    status,
    config: { ...BASE_CONFIG },
    totalTicks: 5,
    totalActions: 12,
    totalErrors: 3,
    lastError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const RUN_A = makeRun("run-aaaa1111", "paused");
const RUN_B = makeRun("run-bbbb2222", "running");

const LOGS: ConsoleBotLog[] = [
  {
    id: "l1",
    runId: RUN_A.id,
    level: "info",
    action: "roll",
    botUsername: "alpha",
    message: "rolled a game",
    payload: { outcome: "pass" },
    createdAt: "2026-01-01T10:00:00.000Z",
  },
  {
    id: "l2",
    runId: RUN_A.id,
    level: "error",
    action: "resolve",
    botUsername: "alpha",
    message: "drop failed",
    payload: { errorCode: "E_DROP" },
    createdAt: "2026-01-01T10:00:01.000Z",
  },
  {
    id: "l3",
    runId: RUN_B.id,
    level: "info",
    action: "roll",
    botUsername: "beta",
    message: "rolled again",
    payload: {},
    createdAt: "2026-01-01T10:00:02.000Z",
  },
];

type ConsoleProps = Parameters<typeof BotsConsole>[0];

function setup(overrides: Partial<ConsoleProps> = {}) {
  const props: ConsoleProps = {
    seasonId: "season-1",
    seasonActive: true,
    ieeEnabled: true,
    runs: [RUN_A, RUN_B],
    logs: LOGS,
    rosters: {},
    playerStatusLabels: {},
    t,
    ...overrides,
  };
  const utils = render(
    <I18nProvider locale="en" t={getDictionary("en")}>
      <BotsConsole {...props} />
    </I18nProvider>,
  );
  return { ...utils, props };
}

function formWith(container: HTMLElement, fieldName: string): HTMLFormElement {
  const field = container.querySelector(`input[name="${fieldName}"]`);
  if (!field) throw new Error(`form with ${fieldName} not found`);
  return field.closest("form") as HTMLFormElement;
}

function cardFor(runId: string): HTMLElement {
  const header = screen.getByText(`#${runId.slice(0, 8)}`);
  const card = header.closest("article");
  if (!card) throw new Error(`card for ${runId} not found`);
  return card;
}

describe("BotsConsole", () => {
  beforeEach(() => {
    routerMock.push.mockReset();
    routerMock.refresh.mockReset();
    createRun.mockReset();
    createRun.mockResolvedValue({});
    resumeRun.mockReset();
    resumeRun.mockResolvedValue(undefined);
    tickBots.mockReset();
    tickBots.mockResolvedValue({ actions: 1, errors: 0 });
  });

  afterEach(cleanup);

  it("alerts when the season is not active", () => {
    setup({ seasonActive: false });
    expect(screen.getByRole("alert").textContent).toContain(t.seasonNotActive);
  });

  it("switches tabs and shows the logs badge count", () => {
    setup();
    // runs tab is the default view
    expect(screen.getByText(t.createHeading)).not.toBeNull();

    const logsTab = screen.getByRole("tab", { name: /Logs/ });
    expect(logsTab.textContent).toContain(String(LOGS.length));
    fireEvent.click(logsTab);
    expect(screen.getByText(t.logsHeading)).not.toBeNull();
    expect(logsTab.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: t.tabsStats }));
    expect(screen.getByText(t.statsHeading)).not.toBeNull();
  });

  it("computes per-action, per-error and per-bot stats from the logs", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: t.tabsStats }));

    // roll appears twice, resolve once — the counts are rendered next to each row
    const byAction = screen.getByText(t.statsByAction).closest("div") as HTMLElement;
    expect(byAction.textContent).toContain("roll");
    expect(byAction.textContent).toContain("resolve");
    const actionCounts = Array.from(byAction.querySelectorAll("li > span:first-child > span:last-child")).map(
      (n) => n.textContent,
    );
    expect(actionCounts).toContain("2");
    expect(actionCounts).toContain("1");

    const byError = screen.getByText(t.statsByError).closest("div") as HTMLElement;
    expect(byError.textContent).toContain("E_DROP");
    expect(byError.querySelector("li > span:first-child > span:last-child")?.textContent).toBe("1");

    const byBot = screen.getByText(t.statsByBot).closest("div") as HTMLElement;
    expect(byBot.textContent).toContain("alpha");
    expect(byBot.textContent).toContain("beta");
    // both bots logged exactly one info entry each
    expect(
      Array.from(byBot.querySelectorAll("li > span:first-child > span:last-child")).map((n) => n.textContent),
    ).toEqual(["1", "1"]);
  });

  it("narrows the visible log list with level, action, search and run filters", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: /Logs/ }));
    expect(screen.getByText("rolled a game")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.logsLevelError }));
    expect(screen.getByText("drop failed")).not.toBeNull();
    expect(screen.queryByText("rolled a game")).toBeNull();
    expect(screen.getByText("1 of 3")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.logsLevelAll }));
    fireEvent.click(screen.getByRole("button", { name: "resolve" }));
    expect(screen.getByText("drop failed")).not.toBeNull();
    expect(screen.queryByText("rolled again")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.logsActionAll }));
    fireEvent.change(screen.getByPlaceholderText(t.logsSearchPlaceholder), {
      target: { value: "again" },
    });
    expect(screen.getByText("rolled again")).not.toBeNull();
    expect(screen.queryByText("rolled a game")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(t.logsSearchPlaceholder), {
      target: { value: "no-such-entry" },
    });
    expect(screen.getByText(t.logsEmpty)).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText(t.logsSearchPlaceholder), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: `#${RUN_A.id.slice(0, 8)}` }));
    expect(screen.getByText("rolled a game")).not.toBeNull();
    expect(screen.queryByText("rolled again")).toBeNull();
  });

  it("opens the logs tab pre-filtered to the run whose Logs button was clicked", () => {
    setup();
    fireEvent.click(within(cardFor(RUN_A.id)).getByRole("button", { name: t.viewLogsButton }));
    expect(screen.getByText(t.logsHeading)).not.toBeNull();
    expect(screen.getByText("2 of 3")).not.toBeNull();
    expect(screen.getByText("rolled a game")).not.toBeNull();
    expect(screen.queryByText("rolled again")).toBeNull();
  });

  it("submits the create form with the season, config sliders and enable flags", () => {
    const { container } = setup();
    const form = formWith(container, "seasonId");

    fireEvent.change(form.querySelector('input[name="botCount"]') as HTMLInputElement, {
      target: { value: "5" },
    });
    fireEvent.change(form.querySelector('input[name="passWeight"]') as HTMLInputElement, {
      target: { value: "60" },
    });
    fireEvent.click(within(form).getByRole("switch", { name: t.stopOnErrorLabel }));

    fireEvent.submit(form);

    expect(createRun).toHaveBeenCalledTimes(1);
    const [, fd] = createRun.mock.calls[0];
    expect(fd.get("seasonId")).toBe("season-1");
    expect(fd.get("botCount")).toBe("5");
    expect(fd.get("actionsPerTick")).toBe("2");
    expect(fd.get("tickIntervalMs")).toBe("2000");
    expect(fd.get("passWeight")).toBe("60");
    expect(fd.get("dropWeight")).toBe("20");
    expect(fd.get("rerollWeight")).toBe("10");
    expect(fd.get("enableRoll")).toBe("on");
    expect(fd.get("enableResolve")).toBe("on");
    expect(fd.get("stopOnError")).toBe("on");
    expect(fd.get("enableItems")).toBe("on");
    expect(fd.get("autoCleanse")).toBe("on");
    expect(fd.get("itemChance")).toBe("60");
    expect(fd.get("targetStrategy")).toBe("leader");
  });

  it("warns when items and effects are off for the season", () => {
    setup({ ieeEnabled: false });
    expect(screen.getByText(t.ieeDisabled)).not.toBeNull();
  });

  it("resumes a paused run from its Start button and starts ticking it", async () => {
    setup();
    fireEvent.click(within(cardFor(RUN_A.id)).getByRole("button", { name: t.startButton }));

    await waitFor(() => expect(resumeRun).toHaveBeenCalledTimes(1));
    const [fd] = resumeRun.mock.calls[0];
    expect(fd.get("runId")).toBe(RUN_A.id);

    await waitFor(() => expect(tickBots).toHaveBeenCalledTimes(1));
    const [tickFd] = tickBots.mock.calls[0];
    expect(tickFd.get("runId")).toBe(RUN_A.id);

    // the card flips into its ticking state
    await waitFor(() => expect(screen.getByText(t.tickingLabel)).not.toBeNull());
  });
});
