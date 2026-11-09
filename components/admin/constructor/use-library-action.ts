"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/toast";
import type { LibraryResult } from "@/lib/modules/iee/actions/library";

/**
 * Runs a library action the way every constructor screen does: in a
 * transition, a toast for the outcome, the server components re-read after a
 * success. `after` gets the action's result, e.g. to open what was created.
 */
export function useLibraryAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const run = useCallback(
    <T,>(
      action: () => Promise<LibraryResult<T>>,
      after?: (data: T | undefined) => void,
      options: { quiet?: boolean; refresh?: boolean } = {},
    ) => {
      start(async () => {
        const result = await action();
        if (result.error) {
          toast({ title: result.error, variant: "error", debug: result.debug, duration: 6500 });
          return;
        }
        if (result.ok && !options.quiet) toast({ title: result.ok, variant: "success", duration: 3500 });
        after?.(result.data);
        // A step that navigates away re-reads the new page anyway.
        if (options.refresh !== false) router.refresh();
      });
    },
    [router, toast],
  );

  return { run, pending };
}

/** Saves a base64 payload from an action as a file the browser downloads. */
export function downloadBase64(fileName: string, base64: string, mimeType = "application/zip"): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
