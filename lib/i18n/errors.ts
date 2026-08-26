import { format } from "@/lib/i18n/format";

type ErrorsDict = Record<string, string>;

/**
 * Maps a use-case error code to text in the session language.
 * The error dictionary is flat: t.core.errors[code]; unknown codes fall back to formUnknown.
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
