import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { NotificationCard, type NotificationView } from "./NotificationCard";

const t = {
  notifications: {
    title: { game_rolled: "Rolled {game}" },
    body: { game_rolled: "Body text" },
    actions: { view: "View" },
  },
} as unknown as Dictionary;

const item = (over: Partial<NotificationView> = {}): NotificationView => ({
  id: "n1",
  kind: "game",
  titleKey: "game_rolled",
  bodyKey: "game_rolled",
  params: { game: "Doom" },
  severity: "info",
  icon: null,
  imageUrl: null,
  href: "/notifications",
  actions: [{ id: "view", labelKey: "view", href: "/notifications" }],
  data: {},
  readAt: null,
  createdAt: "2026-10-04T00:00:00.000Z",
  ...over,
});

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="en" t={t}>{node}</I18nProvider>);

const maxAnchorDepth = (html: string) => {
  let depth = 0;
  let max = 0;
  for (const m of html.matchAll(/<(\/?)a[\s>]/g)) {
    depth += m[1] ? -1 : 1;
    max = Math.max(max, depth);
  }
  return max;
};

describe("NotificationCard", () => {
  it("keeps the card anchor and action links as siblings", () => {
    const html = render(
      <NotificationCard item={item()} unread>
        <span>child</span>
      </NotificationCard>,
    );
    expect(maxAnchorDepth(html)).toBe(1);
    expect(html.match(/<a\s/g)?.length).toBe(2);
    expect(html).toContain('aria-label="Rolled Doom"');
  });

  it("renders no card anchor without a href", () => {
    const html = render(<NotificationCard item={item({ href: null })} unread={false} />);
    expect(maxAnchorDepth(html)).toBe(1);
    expect(html.match(/<a\s/g)?.length).toBe(1);
  });
});
