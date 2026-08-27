type Props = {
  /** Raw debug payload (stack, JSON dump, etc.) produced by action handlers. */
  debug?: string;
  /** Optional heading shown above the payload. Defaults to "dev debug". */
  title?: string;
};

/**
 * Dev-only error detail panel. Renders nothing in production; in development
 * it surfaces the raw error stack / Zod issues / JSON dump so engineers can
 * diagnose UI failures without attaching a debugger. Pair with `state.debug`
 * returned by "use server" actions (`lib/use-cases/action-error.ts`).
 */
export function DebugError({ debug, title }: Props) {
  if (process.env.NODE_ENV === "production") return null;
  if (!debug) return null;
  return (
    <pre
      role="note"
      data-testid="debug-error"
      className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words border border-amber/40 bg-amber/5 p-2 font-mono text-[11px] leading-snug text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
    >
      <strong className="mb-1 block uppercase tracking-widest">
        {title ?? "dev debug"}
      </strong>
      {debug}
    </pre>
  );
}
