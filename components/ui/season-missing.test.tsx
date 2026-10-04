// @vitest-environment node
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/lib/i18n/dictionaries";

import { SeasonMissing } from "./season-missing";

vi.mock("@/lib/infrastructure/auth/session", () => ({
  getCurrentUser: async () => null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const t = getDictionary("en");

describe("SeasonMissing", () => {
  it("renders the title, copy and every fallback link", async () => {
    const element = await SeasonMissing();
    const html = renderToStaticMarkup(element);
    expect(html).toContain(t.board.missing.title);
    expect(html).toContain(t.board.missing.text);
    expect(html).toContain('href="/board"');
    expect(html).toContain('href="/leaderboard"');
    expect(html).toContain('href="/feed"');
    expect(html).toContain('href="/rules"');
    expect(html).toContain('href="/seasons"');
  });

  it("labels each link with its section copy", async () => {
    const element = await SeasonMissing();
    const html = renderToStaticMarkup(element);
    for (const key of ["board", "leaderboard", "feed", "rules", "seasons"] as const) {
      expect(html).toContain(t.board.missing.sections[key].label);
    }
  });
});
