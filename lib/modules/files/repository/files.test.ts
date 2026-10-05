import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

import { db } from "@/lib/infrastructure/db";

import {
  DEFAULT_FILE_PAGE_SIZE,
  MAX_FILE_PAGE_SIZE,
  findFileById,
  findFileByKey,
  insertFile,
  listFiles,
  listFilesWithOwner,
  softDeleteFile,
} from "./files";

const selectRows: unknown[][] = [];
const returningRows: unknown[][] = [];
const limitSpy = vi.fn();
const orderBySpy = vi.fn();
const whereSpy = vi.fn();
const fromSpy = vi.fn();
const leftJoinSpy = vi.fn();

function selectChain(rows: unknown[]) {
  const chain = {
    from: fromSpy,
    where: whereSpy,
    orderBy: orderBySpy,
    leftJoin: leftJoinSpy,
    limit: limitSpy,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  fromSpy.mockReturnValue(chain);
  whereSpy.mockReturnValue(chain);
  orderBySpy.mockReturnValue(chain);
  leftJoinSpy.mockReturnValue(chain);
  limitSpy.mockReturnValue(Promise.resolve(rows));
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  selectRows.length = 0;
  returningRows.length = 0;
  vi.mocked(db.select).mockImplementation(() => selectChain(selectRows.shift() ?? []) as never);
  vi.mocked(db.insert).mockImplementation(
    () =>
      ({
        values: () => ({ returning: () => Promise.resolve(returningRows.shift() ?? []) }),
      }) as never,
  );
  vi.mocked(db.update).mockImplementation(
    () =>
      ({
        set: () => ({ where: () => ({ returning: () => Promise.resolve(returningRows.shift() ?? []) }) }),
      }) as never,
  );
});

const row = { id: "f1", key: "avatar/2026/10/x.jpg" };

describe("files repository", () => {
  it("inserts and returns the created row", async () => {
    returningRows.push([row]);
    await expect(insertFile({ key: "k", category: "avatar", mimeType: "image/jpeg", sizeBytes: 1, checksum: "c" })).resolves.toEqual(row);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("reads a live row by key and by id", async () => {
    selectRows.push([row], []);
    await expect(findFileByKey("avatar/2026/10/x.jpg")).resolves.toEqual(row);
    await expect(findFileById("missing")).resolves.toBeNull();
    expect(selectRows.length).toBe(0);
  });

  it("lists newest-first with a clamped page size", async () => {
    selectRows.push([row]);
    await expect(listFiles({ category: "avatar", limit: 5 })).resolves.toEqual([row]);
    expect(limitSpy).toHaveBeenCalledWith(5);

    selectRows.push([row]);
    await listFiles({ limit: MAX_FILE_PAGE_SIZE * 10 });
    expect(limitSpy).toHaveBeenLastCalledWith(MAX_FILE_PAGE_SIZE);

    selectRows.push([row]);
    await listFiles();
    expect(limitSpy).toHaveBeenLastCalledWith(DEFAULT_FILE_PAGE_SIZE);
  });

  it("reports whether the soft delete was the one that removed the row", async () => {
    returningRows.push([{ id: "f1" }], []);
    await expect(softDeleteFile("f1")).resolves.toBe(true);
    await expect(softDeleteFile("f1")).resolves.toBe(false);
  });

  it("attaches the uploader's username to the admin listing", async () => {
    selectRows.push([
      { file: row, ownerUsername: "alice" },
      { file: { ...row, id: "f2" }, ownerUsername: null },
    ]);
    await expect(listFilesWithOwner({ category: "avatar" })).resolves.toEqual([
      { ...row, ownerUsername: "alice" },
      { ...row, id: "f2", ownerUsername: null },
    ]);
  });
});
