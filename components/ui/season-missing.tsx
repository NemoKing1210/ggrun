import Link from "next/link";

const SECTIONS = [
  { href: "/board", label: "Поле", hint: "карта забега" },
  { href: "/leaderboard", label: "Лидерборд", hint: "кто где стоит" },
  { href: "/feed", label: "Лента", hint: "что произошло" },
  { href: "/rules", label: "Правила", hint: "как играть" },
];

export function SeasonMissing() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="hud-card p-8 text-center">
        <div className="hazard-tape mb-6 h-2 w-full" />
        <h1 className="font-display text-3xl uppercase tracking-wide text-amber">
          Сезон не объявлен
        </h1>
        <p className="mt-3 text-sm text-dim">
          Ведущие ещё не запустили новый сезон. Заглядывай позже или изучи
          прошлые разделы платформы.
        </p>
        <nav className="mt-6 grid grid-cols-2 gap-2">
          {SECTIONS.map((s) => (
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
