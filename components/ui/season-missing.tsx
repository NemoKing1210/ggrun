import Link from "next/link";

import { getT } from "@/lib/i18n/server";

export async function SeasonMissing() {
  const { t } = await getT();
  const sections = [
    { href: "/board", ...t.board.missing.sections.board },
    { href: "/leaderboard", ...t.board.missing.sections.leaderboard },
    { href: "/feed", ...t.board.missing.sections.feed },
    { href: "/rules", ...t.board.missing.sections.rules },
  ];
  return (
    <div className="mx-auto max-w-xl">
      <div className="hud-card p-8 text-center">
        <div className="hazard-tape mb-6 h-2 w-full" />
        <h1 className="font-display text-3xl uppercase tracking-wide text-amber">
          {t.board.missing.title}
        </h1>
        <p className="mt-3 text-sm text-dim">{t.board.missing.text}</p>
        <nav className="mt-6 grid grid-cols-2 gap-2">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="hud-btn justify-center text-center"
            >
              <span>
                {s.label}
                <span className="ml-2 font-mono text-xs text-dim">{s.hint}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
