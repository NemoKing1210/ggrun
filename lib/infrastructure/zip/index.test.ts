import { describe, expect, it } from "vitest";

import { crc32, readZip, writeZip, ZipError, DEFAULT_READ_LIMITS, type ZipFile } from "./index";

const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

/** Written by Python's `zipfile` (deflate, a directory entry, a stored binary). */
const PYTHON_ZIP =
  "UEsDBBQAAAAIAMCFR12DqawTJQAAACQAAAANAAAAbWFuaWZlc3QuanNvbqtWSssvyk0sUbJSSk8vSEzOVtJRykjNyckHClzYc2HHxQalWgBQSwMEFAAAAAgAwIVHXQAAAAACAAAAAAAAAAYAAABpY29ucy8DAFBLAwQUAAAAAAAAACEAhoLw8xAAAAAQAAAADAAAAGljb25zL2Eud2VicAABAgMAAQIDAAECAwABAgNQSwECFAMUAAAACADAhUddg6msEyUAAAAkAAAADQAAAAAAAAAAAAAAgAEAAAAAbWFuaWZlc3QuanNvblBLAQIUAxQAAAAIAMCFR10AAAAAAgAAAAAAAAAGAAAAAAAAAAAAEAD9QVAAAABpY29ucy9QSwECFAMUAAAAAAAAACEAhoLw8xAAAAAQAAAADAAAAAAAAAAAAAAAgAF2AAAAaWNvbnMvYS53ZWJwUEsFBgAAAAADAAMAqQAAALAAAAAAAA==";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("writeZip / readZip", () => {
  const files: ZipFile[] = [
    { name: "manifest.json", data: text(JSON.stringify({ hello: "мир", padding: "x".repeat(500) })) },
    { name: "icons/ward.webp", data: new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]) },
    { name: "icons/_pack.webp", data: new Uint8Array() },
  ];

  it("round-trips names, bytes and order", () => {
    const back = readZip(writeZip(files));
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    expect(str(back[0]!.data)).toBe(str(files[0]!.data));
    expect([...back[1]!.data]).toEqual([...files[1]!.data]);
    expect(back[2]!.data.length).toBe(0);
  });

  it("is deterministic: the same files give the same bytes", () => {
    expect(Buffer.from(writeZip(files)).equals(Buffer.from(writeZip(files)))).toBe(true);
  });

  it("deflates what compresses and stores what does not", () => {
    const zip = Buffer.from(writeZip(files));
    // Method field of the first two local headers.
    expect(zip.readUInt16LE(8)).toBe(8);
    const secondAt = zip.indexOf(Buffer.from("icons/ward.webp")) - 30;
    expect(zip.readUInt16LE(secondAt + 8)).toBe(0);
  });

  it("reads an archive another tool wrote, skipping directory entries", () => {
    const back = readZip(Buffer.from(PYTHON_ZIP, "base64"));
    expect(back.map((f) => f.name)).toEqual(["manifest.json", "icons/a.webp"]);
    expect(JSON.parse(str(back[0]!.data))).toEqual({ format: "ggpack", hello: "мир" });
    expect(back[1]!.data.length).toBe(16);
  });

  it("refuses names that escape, repeat or are empty", () => {
    for (const name of ["", "/abs", "../up", "a/../b", "a\\b", "a//b"]) {
      expect(() => writeZip([{ name, data: new Uint8Array() }])).toThrow(ZipError);
    }
    expect(() => writeZip([files[0]!, files[0]!])).toThrow(/duplicate/);
  });
});

describe("readZip — what it refuses", () => {
  const good = () => Buffer.from(writeZip([{ name: "a.txt", data: text("hello hello hello hello") }]));

  it("refuses what is not an archive", () => {
    expect(() => readZip(text("nope"))).toThrow(/not a zip/);
    expect(() => readZip(new Uint8Array(64))).toThrow(/not a zip/);
  });

  it("refuses a corrupted entry by its checksum", () => {
    const zip = good();
    const bad = Buffer.from(writeZip([{ name: "a.txt", data: new Uint8Array([1, 2, 3]) }]));
    bad[30 + "a.txt".length] ^= 0xff; // flip the first stored byte
    expect(() => readZip(bad)).toThrow(/checksum/);
    expect(readZip(zip)).toHaveLength(1);
  });

  it("refuses an entry it cannot inflate", () => {
    const zip = good();
    zip[30 + "a.txt".length] = 0xff;
    zip[31 + "a.txt".length] = 0xff;
    expect(() => readZip(zip)).toThrow(ZipError);
  });

  it("caps entries, sizes and the total", () => {
    const zip = writeZip([
      { name: "a.txt", data: text("x".repeat(1000)) },
      { name: "b.txt", data: text("y".repeat(1000)) },
    ]);
    expect(() => readZip(zip, { ...DEFAULT_READ_LIMITS, maxEntries: 1 })).toThrow(/too many/);
    expect(() => readZip(zip, { ...DEFAULT_READ_LIMITS, maxEntryBytes: 999 })).toThrow(/too large/);
    expect(() => readZip(zip, { ...DEFAULT_READ_LIMITS, maxTotalBytes: 1500 })).toThrow(/archive too large/);
  });

  it("refuses encrypted entries and unknown compression", () => {
    const zip = good();
    const centralAt = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const encrypted = Buffer.from(zip);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(centralAt + 8) | 1, centralAt + 8);
    expect(() => readZip(encrypted)).toThrow(/encrypted/);
    const odd = Buffer.from(zip);
    odd.writeUInt16LE(12, centralAt + 10);
    expect(() => readZip(odd)).toThrow(/unsupported/);
  });

  it("refuses a truncated archive", () => {
    const zip = good();
    expect(() => readZip(zip.subarray(0, zip.length - 30))).toThrow(ZipError);
  });
});
