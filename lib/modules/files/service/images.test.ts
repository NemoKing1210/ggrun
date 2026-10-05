import { describe, expect, it } from "vitest";

import { readImageDimensions, sniffMimeType } from "./images";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  new DataView(bytes.buffer).setUint16(6, width, true);
  new DataView(bytes.buffer).setUint16(8, height, true);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  new DataView(bytes.buffer).setUint16(7, height);
  new DataView(bytes.buffer).setUint16(9, width);
  return bytes;
}

function webpLossless(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
  bytes[20] = 0x2f;
  const bits = ((height - 1) << 14) | (width - 1);
  bytes[21] = bits & 0xff;
  bytes[22] = (bits >> 8) & 0xff;
  bytes[23] = (bits >> 16) & 0xff;
  bytes[24] = (bits >> 24) & 0xff;
  return bytes;
}

describe("sniffMimeType", () => {
  it("recognises every supported format from its magic bytes", () => {
    expect(sniffMimeType(png(4, 4))).toBe("image/png");
    expect(sniffMimeType(jpeg(4, 4))).toBe("image/jpeg");
    expect(sniffMimeType(gif(4, 4))).toBe("image/gif");
    expect(sniffMimeType(webpLossless(4, 4))).toBe("image/webp");
    expect(sniffMimeType(new TextEncoder().encode("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("returns null for anything else", () => {
    expect(sniffMimeType(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(sniffMimeType(new Uint8Array())).toBeNull();
    // A PNG-adjacent prefix that is not the full signature.
    expect(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe("readImageDimensions", () => {
  it("reads PNG dimensions from the IHDR header", () => {
    expect(readImageDimensions(png(1920, 1080), "image/png")).toEqual({ width: 1920, height: 1080 });
  });

  it("reads JPEG dimensions from SOF0 even after a filler segment", () => {
    const withApp0 = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, // SOF0: h=600 w=800
    ]);
    expect(readImageDimensions(withApp0, "image/jpeg")).toEqual({ width: 800, height: 600 });
  });

  it("reads GIF dimensions", () => {
    expect(readImageDimensions(gif(320, 200), "image/gif")).toEqual({ width: 320, height: 200 });
  });

  it("reads lossless WebP dimensions", () => {
    expect(readImageDimensions(webpLossless(200, 100), "image/webp")).toEqual({ width: 200, height: 100 });
  });

  it("reads extended (VP8X) WebP dimensions", () => {
    const bytes = new Uint8Array(40);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
    bytes[24] = 0xff;
    bytes[25] = 0x01;
    bytes[26] = 0x00; // width = 512
    bytes[27] = 0x2b;
    bytes[28] = 0x01;
    bytes[29] = 0x00; // height = 300
    expect(readImageDimensions(bytes, "image/webp")).toEqual({ width: 512, height: 300 });
  });

  it("returns null for PDFs, unknown types and truncated headers", () => {
    expect(readImageDimensions(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).toBeNull();
    expect(readImageDimensions(png(10, 10), "image/tiff")).toBeNull();
    expect(readImageDimensions(png(10, 10).slice(0, 20), "image/png")).toBeNull();
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).toBeNull();
  });
});
