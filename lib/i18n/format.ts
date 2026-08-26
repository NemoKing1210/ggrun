/**
 * Подстановка параметров в шаблон словаря: "сезон «{season}»" +
 * { season: "run-1" } → "сезон «run-1»". Все значения словарей — строки,
 * чтобы словарь можно было передавать через RSC-границу в клиентские компоненты.
 */
export function format(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
