"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Wraps page content in a keyed container that replays the HUD page-in
 * animation on every client-side route change. First load is not animated
 * (avoids SSR/hydration flash).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div key={pathname} className={mounted ? "animate-hud-page-in" : undefined}>
      {children}
    </div>
  );
}
