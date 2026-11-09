/**
 * Regenerates the engine's fixture of the system pack from its source:
 *
 *   seed/iee/core.ggpack  →  lib/engine/iee/core-docs/core.generated.ts
 *
 * Run after the pack changes (spec §10.2). `pnpm iee:core`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { CORE_FIXTURE_FILE, CORE_PACK_FILE, renderCoreFixture } from "@/lib/modules/iee/library/core-fixture";
import { decodeGgpack } from "@/lib/modules/iee/library/ggpack";

const root = process.cwd();
const { manifest } = decodeGgpack(new Uint8Array(readFileSync(resolve(root, CORE_PACK_FILE))));
writeFileSync(resolve(root, CORE_FIXTURE_FILE), renderCoreFixture(manifest), "utf8");
console.log(`wrote ${CORE_FIXTURE_FILE} — ${manifest.entries.length} entries from ${CORE_PACK_FILE}`);
