"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

const SPIN_MS = 1000;
const TICK_MS = 80;

/**
 * Ammo-counter die: while spinning it flashes random values
 * (~1 s); the final value arrives as props from the server.
 * Animation is disabled under prefers-reduced-motion.
 */
export default function DiceRoller({
  values,
  sides = 6,
}: {
  values: number[] | null;
  sides?: number;
}) {
  const { t } = useI18n();
  const [display, setDisplay] = useState<number[]>(() => values ?? []);
  const [spinning, setSpinning] = useState(false);
  const prevValuesRef = useRef<number[] | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevValuesRef.current = values;
      if (!values || values.length === 0) {
        setDisplay([]);
        setSpinning(false);
      } else {
        setDisplay(values);
        setSpinning(false);
      }
      return;
    }
    if (prevValuesRef.current === values) return;
    prevValuesRef.current = values;

    if (!values || values.length === 0) {
      setDisplay([]);
      setSpinning(false);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(values);
      setSpinning(false);
      return;
    }

    setSpinning(true);
    const startedAt = Date.now();
    setDisplay(values.map(() => 1 + Math.floor(Math.random() * sides)));
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= SPIN_MS) {
        window.clearInterval(timer);
        setDisplay(values);
        setSpinning(false);
        return;
      }
      setDisplay(values.map(() => 1 + Math.floor(Math.random() * sides)));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [values, sides]);


  if (display.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {display.map((face, index) => (
        <span
          key={index}
          aria-hidden
          className={`ammo-counter flex h-10 w-10 items-center justify-center border text-xl [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
            spinning
              ? "animate-pulse border-[#55554a] bg-raised text-dim"
              : "border-amber bg-amber/10 text-amber shadow-[0_0_8px_rgba(242,169,0,0.25)]"
          }`}
        >
          {face}
        </span>
      ))}
      <span role="status" className="sr-only">
        {spinning
          ? t.core.dashboard.diceRolling
          : format(t.core.dashboard.diceResult, {
              values: display.join(" + "),
            })}
      </span>
    </div>
  );
}
