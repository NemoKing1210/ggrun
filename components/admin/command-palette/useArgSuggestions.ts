"use client";

import { useEffect, useState } from "react";

import { suggestAdminArgsAction } from "@/lib/modules/admin-console/actions";
import { isDynamicArgKind, type ArgOption, type ParsedInput } from "@/lib/shared/admin-console";

import type { ConsoleSeason } from "./CommandPaletteProvider";

const MATCH_LIMIT = 8;
const DEBOUNCE_MS = 140;

/**
 * Completions for the argument under the caret. Seasons come from the host
 * (already loaded server-side); users and games are looked up on demand so the
 * palette never has to ship the whole user/game tables to the client.
 */
export function useArgSuggestions(
  parsed: ParsedInput,
  seasons: readonly ConsoleSeason[],
): { options: ArgOption[]; loading: boolean } {
  const [options, setOptions] = useState<ArgOption[]>([]);
  const [loading, setLoading] = useState(false);

  const spec = parsed.argSpec;
  const kind = spec && isDynamicArgKind(spec.kind) ? spec.kind : null;
  const partial = parsed.argPartial;

  useEffect(() => {
    if (!kind) {
      setOptions([]);
      setLoading(false);
      return;
    }

    if (kind === "season") {
      const q = partial.trim().toLowerCase();
      setOptions(
        seasons
          .filter((s) => !q || s.slug.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))
          .slice(0, MATCH_LIMIT)
          .map((s) => ({ value: s.slug, label: s.title, hint: `${s.slug} · ${s.status}` })),
      );
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void suggestAdminArgsAction(kind, partial).then((next) => {
        if (cancelled) return;
        setOptions(next);
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, partial, seasons]);

  return { options, loading };
}
