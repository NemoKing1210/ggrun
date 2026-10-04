import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "./markdown";

const render = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("Markdown headings", () => {
  it("renders # and ## as an h2, with the larger size for #", () => {
    const h1 = render("# Title");
    expect(h1).toMatch(/<h2[^>]*class="[^"]*text-2xl[^"]*"[^>]*>Title<\/h2>/);
    const h2 = render("## Sub");
    expect(h2).toMatch(/<h2[^>]*class="[^"]*text-xl[^"]*"[^>]*>Sub<\/h2>/);
  });

  it("renders ### and #### as an h3", () => {
    expect(render("### Small")).toMatch(/<h3[^>]*>Small<\/h3>/);
    expect(render("#### Tiny")).toMatch(/<h3[^>]*>Tiny<\/h3>/);
  });

  it("does not treat a hash without a space as a heading", () => {
    expect(render("#notaheading")).toContain("#notaheading");
    expect(render("#notaheading")).not.toContain("<h2");
  });
});

describe("Markdown inline markup", () => {
  it("renders **bold** as a strong element", () => {
    expect(render("a **strong** word")).toContain("<strong>strong</strong>");
  });

  it("renders `code` in the amber mono style", () => {
    expect(render("use `roll()` now")).toContain(
      '<code class="bg-raised px-1 font-mono text-amber">roll()</code>',
    );
  });

  it("leaves markup inside inline spans unparsed, matching the non-greedy rules", () => {
    const html = render("`a **b** c`");
    expect(html).toContain("a **b** c");
    expect(html).not.toContain("<strong>");
  });
});

describe("Markdown lists", () => {
  it("renders - and * bullets as an unordered list", () => {
    const html = render("- one\n- two");
    expect(html).toContain('<ul class="mt-3 list-disc space-y-1 pl-6 marker:text-amber">');
    expect(html.match(/<li>/g)?.length).toBe(2);
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    const star = render("* only");
    expect(star).toContain("<li>only</li>");
  });

  it("renders numbered items as an ordered list regardless of the marker used", () => {
    const html = render("1. first\n2) second");
    expect(html).toContain('<ol class="mt-3 list-decimal space-y-1 pl-6 marker:font-mono marker:text-dim">');
    expect(html.match(/<li>/g)?.length).toBe(2);
  });

  it("splits a list when the bullet style switches mid-run", () => {
    const html = render("- a\n1. b");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
  });

  it("starts a new list after a paragraph", () => {
    const html = render("text\n- item");
    expect(html.indexOf("<p")).toBeLessThan(html.indexOf("<ul"));
  });
});

describe("Markdown paragraphs", () => {
  it("joins consecutive source lines with a single space", () => {
    expect(render("first line\nsecond line")).toContain("first line second line");
  });

  it("splits paragraphs on a blank line", () => {
    const html = render("one\n\ntwo");
    expect(html.match(/<p /g)?.length).toBe(2);
  });

  it("flushes a trailing paragraph at end of input", () => {
    expect(render("tail")).toContain("<p ");
  });

  it("wraps everything in the text-sm container", () => {
    expect(render("x")).toContain('<div class="text-sm">');
  });

  it("handles CRLF line endings", () => {
    expect(render("# A\r\n\r\nbody")).toContain("<h2");
    expect(render("# A\r\n\r\nbody")).toContain("body");
  });
});
