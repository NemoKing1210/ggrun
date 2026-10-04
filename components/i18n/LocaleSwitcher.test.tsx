import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { I18nProvider } from "@/lib/i18n/client";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

vi.mock("@/lib/i18n/actions", () => ({
  setLocaleAction: vi.fn(async () => {}),
}));

const t = getDictionary("en");

describe("LocaleSwitcher", () => {
  it("labels the select with the dictionary language name", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en" t={t}>
        <LocaleSwitcher current="en" />
      </I18nProvider>,
    );
    expect(html).toContain("<select");
    expect(html).toContain(`aria-label="${t.core.nav.language}"`);
  });

  it("marks the current locale as selected", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en" t={t}>
        <LocaleSwitcher current="ru" />
      </I18nProvider>,
    );
    expect(html).toContain('value="ru"');
  });

  it("offers every supported locale with its native label", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en" t={t}>
        <LocaleSwitcher current="en" />
      </I18nProvider>,
    );
    for (const locale of LOCALES) {
      expect(html).toContain(`value="${locale}"`);
      expect(html).toContain(LOCALE_LABELS[locale]);
    }
  });

  it("is enabled while no transition is pending", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en" t={t}>
        <LocaleSwitcher current="en" />
      </I18nProvider>,
    );
    expect(html).not.toContain(" disabled");
  });
});
