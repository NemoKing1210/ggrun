/**
 * Byte-level image inspection.
 *
 * Two things happen here, both on the raw upload rather than on anything the
 * client says:
 *
 * 1. **MIME sniffing** — the declared `Content-Type` is attacker-controlled, so
 *    the category decides on magic bytes. A `.png` that is really a PDF is
 *    rejected.
 * 2. **Dimensions** — width/height are read from the header and stored on the
 *    row, so a category can refuse a 20000×20000 decompression bomb before it
 *    ever reaches an image decoder.
 *
 * Only the formats the categories accept are implemented (PNG, JPEG, GIF,
 * WebP, PDF); anything else sniffs to `null` and is refused by every category.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function matches(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function uint16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function uint16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function uint32be(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/** True when the bytes are a PDF (`%PDF-`), which is how PDFs are recognised. */
function isPdf(bytes: Uint8Array): boolean {
  return matches(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
}

/** Detects the MIME type from the bytes, or `null` when it is not a supported format. */
export function sniffMimeType(bytes: Uint8Array): string | null {
  if (matches(bytes, PNG_SIGNATURE)) return "image/png";
  if (matches(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // "GIF8"
  if (matches(bytes, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (isPdf(bytes)) return "application/pdf";
  return null;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  // A SOF segment needs bytes up to `i + 8` (height and width), so the loop
  // must still run when exactly nine bytes remain.
  while (i + 9 <= bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1] ?? 0;
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      i += 2;
      continue;
    }
    const length = uint16be(bytes, i + 2);
    if (length < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: uint16be(bytes, i + 5), width: uint16be(bytes, i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const fourcc = ascii(bytes, 12, 4);

  if (fourcc === "VP8 ") {
    // Lossy: start code 0x9d 0x01 0x2a, then 14-bit dimensions.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { width: uint16le(bytes, 26) & 0x3fff, height: uint16le(bytes, 28) & 0x3fff };
  }

  if (fourcc === "VP8L") {
    // Lossless: 0x2f signature, then 14-bit width and height packed little-endian.
    if (bytes[20] !== 0x2f) return null;
    const bits =
      ((bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24)) >>> 0;
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }

  if (fourcc === "VP8X") {
    // Extended (animation, alpha): 24-bit canvas size minus one.
    const width = 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
    const height = 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
    return { width, height };
  }

  return null;
}

/** Reads pixel dimensions for the supported raster formats; `null` for PDFs and unknown data. */
export function readImageDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24) return null;
    return { width: uint32be(bytes, 16), height: uint32be(bytes, 20) };
  }
  if (mime === "image/jpeg") return jpegDimensions(bytes);
  if (mime === "image/gif") {
    if (bytes.length < 10) return null;
    return { width: uint16le(bytes, 6), height: uint16le(bytes, 8) };
  }
  if (mime === "image/webp") return webpDimensions(bytes);
  return null;
}
