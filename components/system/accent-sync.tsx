"use client";

import { useEffect } from "react";

import { getAccent, isAccentKey, type AccentKey } from "@/lib/shared/ui/accent";

/**
 * Keeps the document accent vars in sync with the saved accent on every
 * render. The server `<style>` in the root layout covers first paint; this
 * covers SPA navigations where `documentElement` inline styles set by the
 * settings preview would otherwise persist (unsaved preview leaking out,
 * or reset-to-default not clearing).
 */
export function AccentSync({ accentKey }: { accentKey: AccentKey }) {
  useEffect(() => {
    const a = getAccent(accentKey);
    const root = document.documentElement;
    root.style.setProperty("--hud-amber", a.primary);
    root.style.setProperty("--hud-amber-border", a.border);
    root.style.setProperty("--hud-amber-glow", a.glow);
  }, [accentKey]);
  return null;
}

export function toAccentKey(value: unknown): AccentKey {
  return isAccentKey(value) ? value : "amber";
}
