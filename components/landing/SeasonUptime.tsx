"use client";

import { useEffect, useState } from "react";

/**
 * Live "season in run for" timer. The server passes the elapsed seconds at
 * render time as the initial state, so SSR output and the first client render
 * match; the interval only starts after mount and ticks once per second.
 */
export function SeasonUptime({
  label,
  startedAtIso,
  initialSeconds,
}: {
  label: string;
  startedAtIso: string;
  initialSeconds: number;
}) {
  const [elapsed, setElapsed] = useState(initialSeconds);

  useEffect(() => {
    const startedAt = new Date(startedAtIso).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);

  const days = Math.floor(elapsed / 86_400);
  const hours = Math.floor((elapsed % 86_400) / 3_600);
  const minutes = Math.floor((elapsed % 3_600) / 60);
  const seconds = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  const value = days > 0 ? `${days}d ${clock}` : clock;

  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span>{label}</span>
      <span className="ammo-counter text-amber">{value}</span>
    </span>
  );
}