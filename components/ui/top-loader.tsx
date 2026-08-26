"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Top loading bar for page navigation.
 * Shows a thin amber bar at the very top during route transitions.
 * Triggered on internal link clicks and on pathname changes (including
 * programmatic router.push and back/forward).
 */
export function TopLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(0);
  const timeoutRef = useRef<number | null>(null);
  const firstRender = useRef(true);

  // Start loader on click of internal links
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      if (!href.startsWith("/")) return;
      const url = new URL(href, window.location.origin);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      setLoading(true);
      setWidth(10);
      requestAnimationFrame(() => {
        window.setTimeout(() => setWidth(70), 30);
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // Complete loader when pathname changes (navigation finished)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (loading) {
      setWidth(100);
    } else {
      setLoading(true);
      setWidth(70);
      window.setTimeout(() => setWidth(100), 50);
    }

    clearTimeout(timeoutRef.current as unknown as number);
    timeoutRef.current = window.setTimeout(() => {
      setLoading(false);
      window.setTimeout(() => setWidth(0), 300);
    }, 400);

    return () => {
      clearTimeout(timeoutRef.current as unknown as number);
    };
  }, [pathname, loading]);

  // Handle back/forward that might not trigger click
  useEffect(() => {
    const handlePop = () => {
      if (!loading) {
        setLoading(true);
        setWidth(70);
      }
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [loading]);

  if (!loading && width === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-[3px] w-full"
      style={{ opacity: loading || width === 100 ? 1 : 0 }}
    >
      <div
        className="h-full bg-amber shadow-[0_0_10px_rgba(242,169,0,0.7)] transition-all ease-out"
        style={{
          width: `${width}%`,
          transitionDuration: width === 100 ? "300ms" : "400ms",
        }}
      />
      <div
        className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        style={{
          left: `${Math.max(0, width - 20)}%`,
          opacity: loading ? 1 : 0,
          transition: "left 0.4s ease-out, opacity 0.2s",
        }}
      />
    </div>
  );
}
