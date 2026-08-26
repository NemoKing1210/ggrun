import type { ReactNode } from "react";

/** Инлайн-разметка: **жирный** и `код`. Без dangerouslySetInnerHTML. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((part) => part.length > 0)
    .map((part, i) => {
      const key = `${keyPrefix}-${i}`;
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={key} className="bg-raised px-1 font-mono text-amber">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
}

/**
 * Минимальный конвертер markdown: заголовки #–####, списки -/* и N.,
 * абзацы. Без внешних зависимостей.
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: { ordered: boolean; text: string }[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p-${blocks.length}`;
    blocks.push(
      <p key={key} className="mt-3 leading-relaxed text-dim">
        {inline(paragraph.join(" "), key)}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    const key = `l-${blocks.length}`;
    const ordered = listItems[0].ordered;
    const items = listItems.map((item, i) => (
      <li key={`${key}-${i}`}>{inline(item.text, `${key}-${i}`)}</li>
    ));
    blocks.push(
      ordered ? (
        <ol key={key} className="mt-3 list-decimal space-y-1 pl-6 marker:font-mono marker:text-dim">
          {items}
        </ol>
      ) : (
        <ul key={key} className="mt-3 list-disc space-y-1 pl-6 marker:text-amber">
          {items}
        </ul>
      ),
    );
    listItems = [];
  };

  for (const [i, raw] of lines.entries()) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const orderedItem = /^\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const cls =
        level <= 1
          ? "font-display mt-8 text-2xl uppercase tracking-wide text-amber first:mt-0"
          : level === 2
            ? "font-display mt-6 text-xl uppercase tracking-wide text-amber"
            : "mt-4 font-semibold uppercase tracking-wide";
      blocks.push(
        level <= 2 ? (
          <h2 key={`h-${i}`} className={cls}>
            {inline(text, `h-${i}`)}
          </h2>
        ) : (
          <h3 key={`h-${i}`} className={cls}>
            {inline(text, `h-${i}`)}
          </h3>
        ),
      );
      continue;
    }

    if (bullet || orderedItem) {
      flushParagraph();
      const ordered = Boolean(orderedItem);
      const text = (orderedItem ?? bullet)![1];
      if (listItems.length > 0 && listItems[0].ordered !== ordered) {
        flushList();
      }
      listItems.push({ ordered, text });
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return <div className="text-sm">{blocks}</div>;
}
