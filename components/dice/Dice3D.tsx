"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

const SPIN_MS = 1100;
const TICK_MS = 90;

type Dice3DProps = {
  values: number[] | null;
  sides?: number;
  size?: number;
};

function pipPositions(value: number): Array<{ x: string; y: string }> {
  // positions as percentages for absolute placement
  switch (value) {
    case 1:
      return [{ x: "50%", y: "50%" }];
    case 2:
      return [
        { x: "25%", y: "25%" },
        { x: "75%", y: "75%" },
      ];
    case 3:
      return [
        { x: "25%", y: "25%" },
        { x: "50%", y: "50%" },
        { x: "75%", y: "75%" },
      ];
    case 4:
      return [
        { x: "25%", y: "25%" },
        { x: "75%", y: "25%" },
        { x: "25%", y: "75%" },
        { x: "75%", y: "75%" },
      ];
    case 5:
      return [
        { x: "25%", y: "25%" },
        { x: "75%", y: "25%" },
        { x: "50%", y: "50%" },
        { x: "25%", y: "75%" },
        { x: "75%", y: "75%" },
      ];
    case 6:
      return [
        { x: "25%", y: "25%" },
        { x: "25%", y: "50%" },
        { x: "25%", y: "75%" },
        { x: "75%", y: "25%" },
        { x: "75%", y: "50%" },
        { x: "75%", y: "75%" },
      ];
    default:
      return [{ x: "50%", y: "50%" }];
  }
}

function DiceFace({ value, pos }: { value: number; pos: string }) {
  const pips = pipPositions(value);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center border border-amber/40 bg-[#1d1d1b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
      style={{ transform: pos }}
    >
      {/* subtle inner bevel */}
      <div className="absolute inset-[3px] border border-white/[0.04] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" aria-hidden />
      {pips.map((p, i) => (
        <span
          key={i}
          className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber shadow-[0_0_6px_rgba(242,169,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)]"
          style={{ left: p.x, top: p.y }}
        />
      ))}
      {/* face number faint corner for quick read */}
      <span className="absolute bottom-1 right-1.5 font-mono text-[7px] leading-none tracking-widest text-amber/40">{value}</span>
    </div>
  );
}

export function DiceCube({ value, size = 56, spinning, index }: { value: number; size?: number; spinning: boolean; index: number }) {
  const half = size / 2;
  // target orientation to show value on front
  const target: Record<number, { x: number; y: number }> = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 },
  };
  const t = target[value] ?? target[1]!;

  // extra spins for drama
  const spins = 720 + index * 180;

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: size, height: size, perspective: 700 }}
      initial={{ y: -90, opacity: 0, rotateX: 0, rotateY: 0 }}
      animate={
        spinning
          ? {
              y: [ -90, 10, -90 ],
              rotateX: [0, 360, 720],
              rotateY: [0, 360, -360],
              opacity: 1,
            }
          : {
              y: 0,
              opacity: 1,
              rotateX: t.x + spins,
              rotateY: t.y + spins,
            }
      }
      transition={
        spinning
          ? {
              duration: 0.85,
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.08,
            }
          : {
              type: "spring",
              stiffness: 420,
              damping: 22,
              mass: 0.9,
              delay: index * 0.08,
            }
      }
    >
      {/* shadow */}
      <motion.div
        className="absolute -bottom-3 left-1/2 h-2 w-[70%] -translate-x-1/2 rounded-full bg-black/50 blur-[4px]"
        animate={spinning ? { scale: [0.6, 1, 0.7], opacity: [0.2, 0.45, 0.25] } : { scale: 1, opacity: 0.35 }}
        transition={spinning ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
        aria-hidden
      />

      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" as const }}
        animate={
          spinning
            ? { rotateX: [0, 360], rotateY: [0, 360] }
            : { rotateX: t.x, rotateY: t.y }
        }
        transition={
          spinning
            ? { duration: 0.45, repeat: Infinity, ease: "linear", delay: index * 0.05 }
            : {
                type: "spring",
                stiffness: 260,
                damping: 18,
                delay: index * 0.08,
              }
        }
      >
        <DiceFace value={1} pos={`translateZ(${half}px)`} />
        <DiceFace value={2} pos={`rotateY(90deg) translateZ(${half}px)`} />
        <DiceFace value={3} pos={`rotateX(90deg) translateZ(${half}px)`} />
        <DiceFace value={4} pos={`rotateX(-90deg) translateZ(${half}px)`} />
        <DiceFace value={5} pos={`rotateY(-90deg) translateZ(${half}px)`} />
        <DiceFace value={6} pos={`rotateY(180deg) translateZ(${half}px)`} />
      </motion.div>
    </motion.div>
  );
}

export default function Dice3D({ values, sides = 6, size = 56 }: Dice3DProps) {
  const { t } = useI18n();
  const [display, setDisplay] = useState<number[]>(() => values ?? []);
  const [spinning, setSpinning] = useState(false);
  const prevValuesRef = useRef<number[] | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // Skip initial mount when values already present to avoid flash; parent can force via key if needed
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
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(values);
      setSpinning(false);
      return;
    }

    setSpinning(true);
    const startedAt = Date.now();
    const tick = () => {
      if (Date.now() - startedAt >= SPIN_MS) {
        setDisplay(values);
        setSpinning(false);
        return;
      }
      setDisplay(values.map(() => 1 + Math.floor(Math.random() * sides)));
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [values, sides]);


  const sum = display.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-5">
        {display.map((face, i) => (
          <DiceCube key={`${i}-${face}-${spinning ? "spin" : "settled"}`} value={face} size={size} spinning={spinning} index={i} />
        ))}

        {/* sum badge */}
        <AnimatePresence mode="wait">
          {!spinning ? (
            <motion.div
              key={`sum-${sum}`}
              initial={{ scale: 0.85, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.35 }}
              className="ml-1 flex items-center gap-2 border border-amber/40 bg-amber/10 px-2.5 py-1.5 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest text-dim">total</span>
              <span className="ammo-counter text-lg leading-none text-amber">{sum}</span>
              <span className="font-mono text-xs text-dim">({display.join(" + ")})</span>
            </motion.div>
          ) : (
            <motion.div
              key="rolling"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-dim"
            >
              <span className="size-1.5 animate-pulse bg-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" aria-hidden />
              {t.core.dashboard.diceRolling}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {spinning
          ? t.core.dashboard.diceRolling
          : format(t.core.dashboard.diceResult, { values: display.join(" + ") })}
      </span>
    </div>
  );
}
