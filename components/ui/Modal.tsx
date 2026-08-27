"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";

const EXIT_MS = 160; // must match hud-backdrop-out / hud-panel-out durations

/**
 * HUD modal with entrance (backdrop fade + panel scale/slide) and exit
 * animations. Rendered through a portal to document.body: "position: fixed"
 * is relative to the nearest ancestor with a transform/filter (e.g. the
 * page-transition wrapper retains one via animation fill-mode), so the overlay
 * must escape the React tree to be sized against the real viewport. Locks body
 * scroll,
 * closes on Escape and backdrop click, traps focus in the panel.
 *
 * `open` is controlled from the parent; the exit animation plays before
 * `onClose` result unmounts the content (parent keeps it mounted while
 * `open` is true). While closing, the last non-null children are rendered
 * so the panel does not collapse mid-animation.
 */
export function Modal({
  open,
  onClose,
  children,
  panelClassName,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  labelledBy?: string;
}) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const lastChildrenRef = useRef(children);
  if (open) {
    lastChildrenRef.current = children;
  }

  // Mount / schedule exit
  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
      closeTimer.current = window.setTimeout(() => {
        setRendered(false);
        setClosing(false);
      }, EXIT_MS);
    }
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape
  useEffect(() => {
    if (!rendered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rendered, closing, onClose]);

  // Scroll lock
  useEffect(() => {
    if (!rendered) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [rendered]);

  // Initial focus
  useEffect(() => {
    if (rendered && !closing) panelRef.current?.focus();
  }, [rendered, closing]);

  if (!rendered) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy}
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm",
        closing ? "animate-hud-backdrop-out" : "animate-hud-backdrop-in",
      )}
      onClick={() => {
        if (!closing) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={panelRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "hud-card relative w-full max-w-lg p-5 outline-none sm:p-6",
            closing ? "animate-hud-panel-out" : "animate-hud-panel-in",
            panelClassName,
          )}
        >
          {lastChildrenRef.current}
        </div>
      </div>
    </div>,
    document.body,
  );
}
