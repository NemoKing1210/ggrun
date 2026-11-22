/**
 * `.ggpack` files from the command line (docs/IEE_CONSTRUCTOR_SPEC.md §10.2, §11).
 *
 *   pnpm iee:import                            load seed/iee/core.ggpack as the system pack
 *   pnpm iee:import <file>                     load another pack from a .ggpack file
 *   pnpm iee:export <slug> [file] [--history]  write a pack's published entries and their
 *                                              icons to a file (default ./<slug>.ggpack)
 *
 * The import is idempotent; `pnpm dev`, the container entrypoint and the demo
 * seed run it on every start. After editing `core` on a development install
 * (IEE_CORE_EDITABLE=1), write it back and regenerate the engine's fixture:
 *
 *   pnpm iee:export core seed/iee/core.ggpack && pnpm iee:core
 *
 * An export whose content matches the file already there leaves the file
 * alone, so the committed pack only changes when its entries do. Shell access
 * stands in for the admin here: nothing is audited, the terminal is the record.
 */
import "./lib/load-env";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { pool } from "@/lib/infrastructure/db";
import {
  buildPackFile,
  decodeGgpack,
  encodeGgpack,
  importPackFromShell,
  manifestContent,
  storageIconFiles,
  withLibrary,
} from "@/lib/modules/iee/library";

import { describeImport, importCorePack } from "./lib/iee-core-pack";

const USAGE = "Usage: pnpm iee:import [file] | pnpm iee:export <slug> [file] [--history]";

const sameIcons = (a: ReadonlyMap<string, Uint8Array>, b: ReadonlyMap<string, Uint8Array>) =>
  a.size === b.size && [...a].every(([path, data]) => isDeepStrictEqual(b.get(path), data));

async function exportPackBySlug(slug: string, file: string | undefined, history: boolean): Promise<void> {
  const { manifest, icons } = await withLibrary(async (store) => {
    const pack = await store.packBySlug(slug);
    if (!pack) throw new Error(`no pack with the slug ${slug}`);
    return buildPackFile(store, pack.id, storageIconFiles(), { history });
  });
  const out = resolve(process.cwd(), file ?? `${slug}.ggpack`);
  if (existsSync(out)) {
    try {
      const current = decodeGgpack(new Uint8Array(readFileSync(out)));
      if (isDeepStrictEqual(manifestContent(current.manifest), manifestContent(manifest)) && sameIcons(current.icons, icons)) {
        console.log(`${out} already holds this content — left as is`);
        return;
      }
    } catch {
      // Not a pack we can read: overwrite it.
    }
  }
  writeFileSync(out, encodeGgpack(manifest, icons));
  const extras = [history ? "every revision" : null, icons.size > 0 ? `${icons.size} icons` : null].filter(Boolean);
  console.log(`wrote ${out} — ${manifest.entries.length} entries${extras.length > 0 ? `, ${extras.join(", ")}` : ""}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const history = rest.includes("--history");
  const args = rest.filter((a) => !a.startsWith("--"));
  if (command === "import" && args.length === 0) {
    console.log(describeImport(await importCorePack()));
  } else if (command === "import" && args.length === 1) {
    console.log(describeImport(await importPackFromShell(new Uint8Array(readFileSync(resolve(process.cwd(), args[0]!))))));
  } else if (command === "export" && args.length >= 1 && args.length <= 2) {
    await exportPackBySlug(args[0]!, args[1], history);
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    // An AdminError carries its code and params; say both.
    const params = e && typeof e === "object" && "params" in e ? ` ${JSON.stringify(e.params)}` : "";
    console.error(`${e instanceof Error ? e.message : String(e)}${params}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
