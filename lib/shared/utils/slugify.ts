/**
 * Slug utilities with Cyrillic (ru/uk) -> Latin transliteration.
 * Shared by the client (live auto-fill in the season form) and the server
 * use-case (drop-in fallback), so both stay in sync. Pure TS: no
 * next/react/drizzle imports.
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ґ: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  і: "i",
  ї: "yi",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  є: "ye",
};

/** Transcribes a single letter, keeping every non-Cyrillic char as-is. */
export function transliterate(input: string): string {
  const lower = input.toLowerCase();
  let out = "";
  for (const ch of lower) {
    out += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return out;
}

/**
 * Builds a URL-safe slug: lowercase latin letters, digits and hyphens only.
 * "Забег #1" -> "zabeg-1", "Сезон Київ" -> "sezon-kyiv".
 */
export function slugify(input: string, maxLength = 100): string {
  const transliterated = transliterate(input.trim());
  // Strip latin diacritics (é -> e) for pre-transliterated titles.
  const normalized = transliterated.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}