"use client";

import { AnimatePresence, MotionConfig, motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Shared HUD motion primitives (see DESIGN.md §8).
 *
 * Spare by design: 160–200ms ease-out, opacity + translateY(8px) only.
 * Every helper renders inside `MotionConfig reducedMotion="user"`, so
 * `prefers-reduced-motion` kills the animation even when the helper is
 * used outside the board view (which has its own MotionConfig).
 */

const EASE = "easeOut" as const;
const RISE = 8;

export const hudStaggerParent: Variants = {
  hidden: {},
  show: (step: number = 0.04) => ({
    transition: { staggerChildren: step },
  }),
};

export const hudRiseChild: Variants = {
  hidden: { opacity: 0, y: RISE },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.12, ease: EASE },
  },
};

/** Capped stagger delay for CSS `animation-delay` lists (30ms steps, ~300ms max). */
export function riseDelay(index: number, step = 30, cap = 300): { animationDelay: string } {
  return { animationDelay: `${Math.min(index * step, cap)}ms` };
}

export function HudMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fade-up-on-scroll entrance for sections and hero blocks. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: RISE }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.18, ease: EASE, delay }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/** Staggered fade-up list. Children must be `StaggerItem` (or motion nodes with the child variants). */
export function Stagger({
  children,
  className,
  step = 0.04,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        variants={hudStaggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        custom={step}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={hudRiseChild}>
      {children}
    </motion.div>
  );
}

/**
 * Keyed crossfade for view-mode switches (board grid/linear, archive filters).
 * `viewKey` must change when the content switches.
 */
export function FadeSwitch({
  viewKey,
  children,
  className,
}: {
  viewKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewKey}
          className={className}
          initial={{ opacity: 0, y: RISE }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
