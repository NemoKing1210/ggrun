"use client";

import { useTransition } from "react";

import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n/config";

/** Locale switcher: writes a cookie and re-renders server components. */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Language"
      className="!w-auto !py-1 !px-2 text-xs"
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => setLocaleAction(next).then(() => undefined));
      }}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
