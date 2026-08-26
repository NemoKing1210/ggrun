export function PageHeader({
  kicker,
  title,
  right,
}: {
  kicker?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? (
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-dim">
            {"// "}
            {kicker}
          </p>
        ) : null}
        <h1 className="font-display text-4xl uppercase tracking-wide text-amber">
          {title}
        </h1>
      </div>
      {right ? <div className="font-mono text-sm text-dim">{right}</div> : null}
    </header>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="hud-card p-8 text-center text-dim">
      <p className="font-mono text-sm uppercase tracking-widest">{children}</p>
    </div>
  );
}
