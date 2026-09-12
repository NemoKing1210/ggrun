import { cn } from "@/lib/shared/utils/cn";

/**
 * The sentence that says what an item, status or challenge actually does.
 *
 * It exists because that sentence was written six times at `text-[11px]
 * text-dim` -- smaller than the name above it, which carries no information at
 * all. The hierarchy was inverted: the label was prominent and the meaning was
 * a footnote. DESIGN.md 2 does not have an 11px step.
 *
 * Contrast was never the problem (#9a958a on #1a1a1a measures 5.83:1, AA
 * clear) -- size and rank were.
 *
 * One size wherever the description is the content of its card -- player
 * surfaces and admin cards alike, at `base`. `dense` (`sm`) is only for rows
 * in a scannable list: the season wizard's pools and the event-template table,
 * where a dozen entries are read at once to compare them.
 *
 * The size was raised twice and was still called too small both times, which
 * is fair: the body face is Barlow Condensed. A condensed face at 14px carries
 * a visibly smaller x-height than a normal face at the same nominal size, so
 * the number flatters it. These are one or two short sentences carrying the
 * whole meaning of an entry -- they are the content, not an annotation on it.
 *
 * Not a `<p>` at each call site with its own classes: that is exactly how the
 * six copies drifted apart, and the same lesson lib/i18n/dict-text.ts already
 * recorded.
 */
export function EntryDescription({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "dense";
  className?: string;
}) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <p
      className={cn(
        "mt-1 leading-relaxed",
        tone === "dense" ? "text-sm text-zinc-300" : "text-base text-zinc-200",
        className,
      )}
    >
      {children}
    </p>
  );
}
