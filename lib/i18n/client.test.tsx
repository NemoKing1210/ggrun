import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { Dictionary } from "@/lib/i18n/dictionaries";

import { I18nProvider, useI18n } from "./client";

const ruDict = {
  core: { common: { save: "Сохранить" } },
} as unknown as Dictionary;

function Probe() {
  const { locale, t } = useI18n();
  return <span>{`${locale}:${t.core.common.save}`}</span>;
}

describe("I18nProvider", () => {
  it("exposes the active locale and dictionary to descendants", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ru" t={ruDict}>
        <Probe />
      </I18nProvider>,
    );
    expect(html).toContain("ru:Сохранить");
  });

  it("lets a nested provider override the outer one", () => {
    const ukDict = {
      core: { common: { save: "Зберегти" } },
    } as unknown as Dictionary;
    const html = renderToStaticMarkup(
      <I18nProvider locale="ru" t={ruDict}>
        <I18nProvider locale="uk" t={ukDict}>
          <Probe />
        </I18nProvider>
      </I18nProvider>,
    );
    expect(html).toContain("uk:Зберегти");
  });
});

describe("useI18n", () => {
  it("throws when used outside a provider", () => {
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "useI18n must be used within I18nProvider",
    );
  });
});
