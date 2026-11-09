import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CORE_PACK_ID } from "@/lib/engine/iee/core-docs";

import { CORE_FIXTURE_FILE, CORE_PACK_FILE, renderCoreFixture } from "./core-fixture";
import { decodeGgpack } from "./ggpack";

/**
 * `seed/iee/core.ggpack` is the source of the system pack; the engine's
 * fixture is generated from it (spec §10.2). Same convention as
 * `components/iee/art-manifest.ts`: the whole generated file is compared, so a
 * hand edit or a forgotten `pnpm iee:core` fails here.
 */
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file));
const pack = decodeGgpack(new Uint8Array(read(CORE_PACK_FILE)));

describe("the core pack file", () => {
  it("is the system pack `core`, with no dependencies and no icons", () => {
    expect(pack.manifest.pack).toMatchObject({ id: CORE_PACK_ID, slug: "core", defaultLocale: "ru", dependencies: [] });
    expect(pack.icons.size).toBe(0);
  });

  it("carries one revision per entry — the history lives in the installations that played it", () => {
    for (const entry of pack.manifest.entries) expect(`${entry.slug}:${entry.revisions.length}`).toBe(`${entry.slug}:1`);
  });

  it("has a fixture that is not stale", () => {
    // Line endings are the checkout's business, not the generator's.
    const actual = read(CORE_FIXTURE_FILE).toString("utf8").replace(/\r\n/g, "\n");
    expect(actual, `${CORE_FIXTURE_FILE} is out of date — run \`pnpm iee:core\``).toBe(renderCoreFixture(pack.manifest));
  });
});
