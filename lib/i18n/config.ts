/**
 * Конфиг i18n. Добавление языка:
 * 1. создать lib/i18n/dictionaries/<locale>/ с файлами всех неймспейсов
 *    (типы — из en-версий);
 * 2. зарегистрировать в LOCALES и в dictionaries (lib/i18n/dictionaries/index.ts).
 */
export const LOCALES = ["en", "ru", "uk"] as const;

export type Locale = (typeof LOCALES)[number];

/** Язык по умолчанию и fallback для неполных словарей. */
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "ggrun_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  uk: "Українська",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

/**
 * Парсинг заголовка Accept-Language с учётом q-весов.
 * Возвращает лучшую поддерживаемую локаль или DEFAULT_LOCALE.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const candidates = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1] ?? "") : 1;
      return { tag: (tag ?? "").trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of candidates) {
    if (isLocale(tag)) return tag;
    // "en-US" → "en", "uk-UA" → "uk", "ru-RU" → "ru"
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
