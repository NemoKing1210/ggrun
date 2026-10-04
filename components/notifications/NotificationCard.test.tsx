import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import type { NotificationBroadcast } from "@/lib/realtime/protocol";

import { NotificationCard, toView, type NotificationView } from "./NotificationCard";

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

describe("NotificationCard severity and framing", () => {
  it("colours the accent bar by severity", () => {
    expect(render(<NotificationCard item={item({ severity: "danger" })} unread={false} />)).toContain(
      "w-1 bg-danger",
    );
    expect(render(<NotificationCard item={item({ severity: "warning" })} unread={false} />)).toContain(
      "w-1 bg-amber",
    );
    expect(render(<NotificationCard item={item({ severity: "success" })} unread={false} />)).toContain(
      "w-1 bg-military",
    );
  });

  it("falls back to the info accent for an unknown severity", () => {
    expect(render(<NotificationCard item={item({ severity: "weird" })} unread={false} />)).toContain(
      "w-1 bg-sky-500",
    );
  });

  it("drops the card frame in the bare variant", () => {
    expect(render(<NotificationCard item={item()} unread={false} variant="bare" />)).not.toContain("hud-card");
    expect(render(<NotificationCard item={item()} unread={false} />)).toContain("hud-card");
  });

  it("shows the unread dot only when unread", () => {
    expect(render(<NotificationCard item={item()} unread />)).toContain("h-1.5 w-1.5 shrink-0 bg-amber");
    expect(render(<NotificationCard item={item()} unread={false} />)).not.toContain("h-1.5 w-1.5 shrink-0 bg-amber");
  });
});

describe("NotificationCard text fallbacks", () => {
  it("falls back to the kind when the title key is missing from the dictionary", () => {
    expect(render(<NotificationCard item={item({ titleKey: "missing" })} unread={false} />)).toContain(">game</h3>");
  });

  it("omits the body when the body key is missing", () => {
    expect(render(<NotificationCard item={item({ bodyKey: "missing" })} unread={false} />)).not.toContain(
      "<p class=",
    );
  });

  it("renders an action without a href as a button, not a link", () => {
    const html = render(
      <NotificationCard item={item({ actions: [{ id: "x", labelKey: "view" }] })} unread={false} />,
    );
    expect(html).toContain('<span class="hud-btn !px-2 !py-1 text-[11px]">View</span>');
    expect(html.match(/<a\s/g)?.length).toBe(1); // only the card anchor
  });

  it("falls back to the action key when the dictionary lacks it", () => {
    const html = render(
      <NotificationCard item={item({ actions: [{ id: "x", labelKey: "unknownAction" }] })} unread={false} />,
    );
    expect(html).toContain(">unknownAction</span>");
  });

  it("omits the timestamp for an unparseable createdAt", () => {
    expect(render(<NotificationCard item={item({ createdAt: "not-a-date" })} unread={false} />)).not.toContain("<time");
    expect(render(<NotificationCard item={item()} unread={false} />)).toContain("<time");
  });

  it("renders children without a divider when there are no actions", () => {
    const html = render(
      <NotificationCard item={item({ actions: [] })} unread={false}>
        <span>child</span>
      </NotificationCard>,
    );
    expect(html).toContain("<span>child</span>");
    expect(html).not.toContain("h-4 w-px");
  });

  it("separates children from actions with a divider", () => {
    const html = render(
      <NotificationCard item={item()} unread={false}>
        <span>child</span>
      </NotificationCard>,
    );
    expect(html).toContain("h-4 w-px shrink-0 bg-line");
  });

  it("renders the image when one is set", () => {
    expect(render(<NotificationCard item={item({ imageUrl: "/img/cover.png" })} unread={false} />)).toContain(
      'src="/img/cover.png"',
    );
  });
});

describe("toView", () => {
  it("copies the broadcast fields into the card view, dropping delivery-only ones", () => {
    const broadcast: NotificationBroadcast = {
      id: "b1",
      userId: "u1",
      kind: "game",
      titleKey: "game_rolled",
      bodyKey: "game_rolled",
      params: { game: "Doom" },
      severity: "info",
      icon: "PlayIcon",
      imageUrl: null,
      href: "/x",
      actions: [{ id: "view", labelKey: "view", href: "/x" }],
      data: { k: 1 },
      readAt: null,
      createdAt: "2026-10-04T00:00:00.000Z",
      unread: 3,
    };
    expect(toView(broadcast)).toEqual({
      id: "b1",
      kind: "game",
      titleKey: "game_rolled",
      bodyKey: "game_rolled",
      params: { game: "Doom" },
      severity: "info",
      icon: "PlayIcon",
      imageUrl: null,
      href: "/x",
      actions: [{ id: "view", labelKey: "view", href: "/x" }],
      data: { k: 1 },
      readAt: null,
      createdAt: "2026-10-04T00:00:00.000Z",
    });
  });
});
