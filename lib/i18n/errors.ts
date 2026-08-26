import { format } from "@/lib/i18n/format";

type ErrorsDict = Record<string, string>;

/**
 * Перевод кода ошибки use-case в текст на языке сессии.
 * Словарь ошибок плоский: t.core.errors[code], при отсутствии кода — formUnknown.
 */
export function errorText(
  errors: ErrorsDict,
  code: string,
  params: Record<string, string> = {},
): string {
  const template = errors[code];
  if (!template) return errors.formUnknown ?? code;
  return format(template, params);
}
