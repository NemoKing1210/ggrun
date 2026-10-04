import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

import { db } from "@/lib/infrastructure/db";

import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
  getSeasonById,
  getSeasonBySlug,
  listArchivedSeasons,
  listPublicSeasons,
  listSeasons,
  setSeasonStatus,
  updateSeasonConfig,
} from "./seasons";

const selectQueue: unknown[][] = [];
const updates: { values: unknown }[] = [];
const limits: unknown[] = [];

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = (n: unknown) => {
    limits.push(n);
    return chain;
  };
  chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  selectQueue.length = 0;
  updates.length = 0;
  limits.length = 0;
  vi.mocked(db.select).mockImplementation(() => selectChain(selectQueue.shift() ?? []) as never);
  vi.mocked(db.update).mockImplementation(
    () =>
      ({
        set: (values: unknown) => {
          updates.push({ values });
          return { where: () => Promise.resolve(undefined) };
        },
      }) as never,
  );
});

describe("season reads", () => {
  it("returns the first row for single-row lookups and null when empty", async () => {
    const season = { id: "s1", slug: "run-1" };
    selectQueue.push([season]);
    await expect(getSeasonBySlug("run-1")).resolves.toBe(season);
    selectQueue.push([]);
    await expect(getSeasonById("missing")).resolves.toBeNull();

    const board = { id: "b1" };
    selectQueue.push([board]);
    await expect(getMainBoard("s1")).resolves.toBe(board);
    selectQueue.push([]);
    await expect(getMainBoard("none")).resolves.toBeNull();
  });

  it("returns the active season or null", async () => {
    const season = { id: "s1", slug: "run-1" };
    selectQueue.push([season]);
    await expect(getActiveSeason()).resolves.toBe(season);
    selectQueue.push([]);
    await expect(getActiveSeason()).resolves.toBeNull();
  });

  it("returns the ordered list rows verbatim", async () => {
    const rows = [{ id: "s2" }, { id: "s1" }];
    selectQueue.push(rows);
    await expect(listSeasons()).resolves.toBe(rows);
    selectQueue.push(rows);
    await expect(listPublicSeasons()).resolves.toBe(rows);
    selectQueue.push(rows);
    await expect(listArchivedSeasons()).resolves.toBe(rows);
  });

  it("returns board cells in stored order", async () => {
    const cells = [{ position: 0 }, { position: 1 }];
    selectQueue.push(cells);
    await expect(getBoardCells("b1")).resolves.toBe(cells);
  });
});

describe("setSeasonStatus", () => {
  it("stamps startedAt when the season starts", async () => {
    await setSeasonStatus("s1", "active");
    expect(updates).toHaveLength(1);
    const patch = updates[0]!.values as Record<string, unknown>;
    expect(patch.status).toBe("active");
    expect(patch.startedAt).toBeInstanceOf(Date);
  });

  it("stamps finishedAt when the season finishes", async () => {
    await setSeasonStatus("s1", "finished");
    const patch = updates[0]!.values as Record<string, unknown>;
    expect(patch.status).toBe("finished");
    expect(patch.finishedAt).toBeInstanceOf(Date);
  });

  it("writes only the status for intermediate states", async () => {
    await setSeasonStatus("s1", "paused");
    expect(updates[0]!.values).toEqual({ status: "paused" });
  });
});

describe("updateSeasonConfig", () => {
  it("replaces the config and includes rules only when provided", async () => {
    await updateSeasonConfig("s1", { board: { size: 20 } });
    expect(updates[0]!.values).toEqual({ config: { board: { size: 20 } } });

    await updateSeasonConfig("s1", { board: { size: 20 } }, "");
    expect(updates[1]!.values).toEqual({ config: { board: { size: 20 } }, rulesMd: "" });

    await updateSeasonConfig("s1", {}, "# Rules");
    expect(updates[2]!.values).toEqual({ config: {}, rulesMd: "# Rules" });
  });
});
