/**
 * A small ZIP codec — enough for `.ggpack` files (docs/IEE_CONSTRUCTOR_SPEC.md
 * §11): DEFLATE or STORE entries, UTF-8 names, no encryption, no ZIP64.
 *
 * Written rather than imported because the format needs so little, and
 * because the output must be deterministic: the same files in, the same bytes
 * out (fixed timestamps, the given order), so a pack committed to the
 * repository only changes when its content does.
 *
 * Reading is defensive — a pack is uploaded by an admin, but it is still a
 * file from outside: entry count, sizes and the inflated total are capped, and
 * every entry's CRC is checked.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipFile {
  /** Path inside the archive, `/`-separated, no leading slash. */
  name: string;
  data: Uint8Array;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ReadLimits {
  maxEntries: number;
  /** Largest inflated size of one entry, in bytes. */
  maxEntryBytes: number;
  /** Largest inflated size of the whole archive, in bytes. */
  maxTotalBytes: number;
}

export const DEFAULT_READ_LIMITS: ReadLimits = {
  maxEntries: 2_000,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
};

// --- CRC-32 (IEEE 802.3) ----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// --- writing ----------------------------------------------------------------

/** 1980-01-01 00:00 — the earliest DOS date, so the output never depends on the clock. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

function checkName(name: string): void {
  if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => part === ".." || part === "")) {
    throw new ZipError(`bad entry name: ${JSON.stringify(name)}`);
  }
}

/**
 * Builds an archive. Each entry is deflated unless that would not make it
 * smaller (images are compressed already), in which case it is stored.
 */
export function writeZip(files: readonly ZipFile[]): Uint8Array {
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    checkName(file.name);
    if (seen.has(file.name)) throw new ZipError(`duplicate entry: ${file.name}`);
    seen.add(file.name);
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.data);
    const deflated = deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

// --- reading ----------------------------------------------------------------

function findEnd(buf: Buffer): number {
  // The end record is 22 bytes plus a comment of at most 65535.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new ZipError("not a zip archive");
}

/** Reads every file of an archive, in archive order. Directories are skipped. */
export function readZip(bytes: Uint8Array, limits: ReadLimits = DEFAULT_READ_LIMITS): ZipFile[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 22) throw new ZipError("not a zip archive");
  const endAt = findEnd(buf);
  const count = buf.readUInt16LE(endAt + 10);
  const centralSize = buf.readUInt32LE(endAt + 12);
  const centralAt = buf.readUInt32LE(endAt + 16);
  if (count > limits.maxEntries) throw new ZipError(`too many entries (${count})`);
  if (centralAt + centralSize > endAt) throw new ZipError("corrupt central directory");

  const files: ZipFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  let at = centralAt;
  for (let i = 0; i < count; i++) {
    if (at + 46 > endAt || buf.readUInt32LE(at) !== 0x02014b50) throw new ZipError("corrupt central directory");
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const compressed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x0001) throw new ZipError(`encrypted entry: ${name}`);
    if (name.endsWith("/")) continue;
    checkName(name);
    if (seen.has(name)) throw new ZipError(`duplicate entry: ${name}`);
    seen.add(name);
    if (size > limits.maxEntryBytes) throw new ZipError(`entry too large: ${name}`);
    total += size;
    if (total > limits.maxTotalBytes) throw new ZipError("archive too large");

    if (localAt + 30 > buf.length || buf.readUInt32LE(localAt) !== 0x04034b50) throw new ZipError(`corrupt entry: ${name}`);
    const dataAt = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    if (dataAt + compressed > buf.length) throw new ZipError(`truncated entry: ${name}`);
    const body = buf.subarray(dataAt, dataAt + compressed);

    let data: Buffer;
    if (method === METHOD_STORE) data = Buffer.from(body);
    else if (method === METHOD_DEFLATE) {
      try {
        data = inflateRawSync(body, { maxOutputLength: limits.maxEntryBytes });
      } catch {
        throw new ZipError(`cannot inflate entry: ${name}`);
      }
    } else throw new ZipError(`unsupported compression in ${name}`);
    if (data.length !== size || crc32(data) !== crc) throw new ZipError(`checksum mismatch: ${name}`);
    files.push({ name, data: new Uint8Array(data) });
  }
  return files;
}
