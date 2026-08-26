"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

const SPIN_MS = 1000;
const TICK_MS = 80;

/**
 * Кубик-«счётчик патронов»: пока крутится — мелькают случайные значения
 * (~1 c), финальное приходит пропсом с сервера.
 * При prefers-reduced-motion анимация отключается.
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
  // Ключ по значениям: референс массива меняется при каждом ререндере сервера.
  const valuesKey = values?.join(",") ?? "";
  const prevKey = useRef(valuesKey);

  useEffect(() => {
    if (prevKey.current === valuesKey) return;
    prevKey.current = valuesKey;

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
  }, [valuesKey, values, sides]);

  if (display.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {display.map((face, index) => (
        <span
          key={index}
          aria-hidden
          className={`ammo-counter flex h-10 w-10 items-center justify-center border text-xl ${
            spinning
              ? "animate-pulse border-[#55554a] text-dim"
              : "border-amber text-amber"
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
