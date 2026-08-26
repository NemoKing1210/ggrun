/**
 * HUD loading screen: bracket-framed card, pulsing board cells, an animated
 * hazard-stripe progress bar and a blinking label. CSS animations only;
 * respects prefers-reduced-motion.
 */
export function HudLoader({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-[50vh] items-center justify-center px-4 ${className ?? ""}`}
    >
      <div className="hud-card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-6 flex w-fit gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="hud-loader-cell size-4 border border-amber bg-amber/30"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
        <p className="hud-loader-blink font-display text-xl uppercase tracking-[0.3em] text-amber">
          {label}
        </p>
        <div className="hud-loader-progress mt-6 w-full" aria-hidden />
      </div>
    </div>
  );
}
