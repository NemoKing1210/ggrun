/**
 * User-selectable accent colors.
 * The `key` is stored on `users.accent`; `primary` is injected into the
 * `--hud-amber` CSS variable at runtime so every `*-amber` Tailwind class
 * (and any var()-based border/glow) follows the selection site-wide.
 */
export const ACCENTS = {
  amber: {
    label: "Amber",
    primary: "#f2a900",
    border: "#c98f00",
    glow: "242, 169, 0",
    swatch: "#f2a900",
  },
  military: {
    label: "Military",
    primary: "#7c8f4a",
    border: "#5a6b32",
    glow: "124, 143, 74",
    swatch: "#7c8f4a",
  },
  rust: {
    label: "Rust",
    primary: "#c05b3c",
    border: "#8f4028",
    glow: "192, 91, 60",
    swatch: "#c05b3c",
  },
  cyan: {
    label: "Cyan",
    primary: "#37b6c9",
    border: "#1e7f8e",
    glow: "55, 182, 201",
    swatch: "#37b6c9",
  },
  violet: {
    label: "Violet",
    primary: "#8b6fd6",
    border: "#644aab",
    glow: "139, 111, 214",
    swatch: "#8b6fd6",
  },
  lime: {
    label: "Lime",
    primary: "#a3c93e",
    border: "#749426",
    glow: "163, 201, 62",
    swatch: "#a3c93e",
  },
  orange: {
    label: "Orange",
    primary: "#e07b2e",
    border: "#a85417",
    glow: "224, 123, 46",
    swatch: "#e07b2e",
  },
  steel: {
    label: "Steel",
    primary: "#5aa7c2",
    border: "#34718a",
    glow: "90, 167, 194",
    swatch: "#5aa7c2",
  },
} as const;

export type AccentKey = keyof typeof ACCENTS;

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

export const DEFAULT_ACCENT: AccentKey = "amber";

export function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === "string" && value in ACCENTS;
}

export function getAccent(key: unknown): (typeof ACCENTS)[AccentKey] {
  return isAccentKey(key) ? ACCENTS[key] : ACCENTS[DEFAULT_ACCENT];
}
