/**
 * Interpolates params into a dictionary template:
 * "Season {season}" + { season: "run-1" } → "Season run-1".
 * All dictionary values are strings so the dictionary can be passed
 * across the RSC boundary into client components.
 */
export function format(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
