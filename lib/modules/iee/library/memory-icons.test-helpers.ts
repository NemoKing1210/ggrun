/**
 * Icon files in memory, shared by content like the real ones (`icons.ts`).
 * Bytes starting with 0 are refused the way the files module refuses a type it
 * does not allow; bytes starting with 0x89 are PNG, the rest WebP. Test-only.
 */
import { FileError } from "@/lib/modules/files/service/errors";

import type { IconFiles } from "./icons";

export function memoryIcons() {
  const stored = new Map<string, { data: Uint8Array; mimeType: string; gone: boolean }>();
  let seq = 0;
  const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
  const files: IconFiles = {
    async put(data) {
      if (data[0] === 0) throw new FileError("fileTypeNotAllowed", { types: "PNG, WEBP" });
      const hit = [...stored].find(([, f]) => !f.gone && same(f.data, data));
      if (hit) return { id: hit[0], created: false };
      const id = `icon-${++seq}`;
      stored.set(id, { data, mimeType: data[0] === 0x89 ? "image/png" : "image/webp", gone: false });
      return { id, created: true };
    },
    async read(id) {
      const f = stored.get(id);
      return f && !f.gone ? { data: f.data, mimeType: f.mimeType } : null;
    },
    async discard(id) {
      stored.get(id)!.gone = true;
    },
  };
  const live = () => [...stored].filter(([, f]) => !f.gone).map(([id]) => id);
  return { files, stored, live };
}
