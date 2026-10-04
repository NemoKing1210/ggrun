"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { CommandPalette } from "./CommandPalette";

export interface ConsoleSeason {
  id: string;
  slug: string;
  title: string;
  status: string;
}

interface AdminConsoleApi {
  open: () => void;
}

const AdminConsoleContext = createContext<AdminConsoleApi | null>(null);

/** Trigger for the console; `null` when the signed-in user is not an admin. */
export function useAdminConsole(): AdminConsoleApi | null {
  return useContext(AdminConsoleContext);
}

/**
 * Hosts the Ctrl+K console for the admin shell. Mounting this only for admins
 * is what makes the palette admin-only on the client; the actions re-check the
 * role server-side, so hiding the UI is convenience, not the gate.
 */
export function AdminConsoleHost({
  enabled,
  seasons,
  children,
}: {
  /** Only admins get the console; judges get a header without the trigger. */
  enabled: boolean;
  seasons: ConsoleSeason[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const api = useMemo<AdminConsoleApi | null>(
    () => (enabled ? { open: () => setOpen(true) } : null),
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return (
    <AdminConsoleContext.Provider value={api}>
      {children}
      {enabled && <CommandPalette open={open} onClose={() => setOpen(false)} seasons={seasons} />}
    </AdminConsoleContext.Provider>
  );
}
