import type { Dictionary } from "@/lib/i18n/dictionaries";

import { RetryButton } from "./retry-button";

type SiteUnavailableDict = Dictionary["core"]["siteUnavailable"];

/**
 * Full-screen "site temporarily unavailable" state rendered by the root
 * layout when the database cannot be reached.
 */
export function SiteUnavailableScreen({ t }: { t: SiteUnavailableDict }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="hazard-tape mb-6 h-[10px] w-full max-w-lg" aria-hidden />
      <div className="hud-card w-full max-w-lg p-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-dim">
          {"// "}
          {t.kicker}
        </p>
        <h1 className="font-display mt-4 text-4xl uppercase tracking-wide text-amber">{t.title}</h1>
        <p className="mx-auto mt-4 max-w-sm font-mono text-sm leading-relaxed text-dim">
          {t.text}
        </p>
        <div className="mt-8 flex justify-center">
          <RetryButton label={t.retry} />
        </div>
      </div>
      <div className="hazard-tape mt-6 h-[10px] w-full max-w-lg" aria-hidden />
    </div>
  );
}