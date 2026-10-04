import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  AvatarWithPresence,
  PresenceAvatar,
  PresenceBadge,
  PresenceDot,
} from "@/components/ui/Presence";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const t = getDictionary("en");
const pr = t.profile.presence;

const ONLINE = new Date(NOW.getTime() - 60_000).toISOString();
const OFFLINE = new Date(NOW.getTime() - 10 * 60_000).toISOString();

function render(node: ReactNode): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en" t={t}>{node}</I18nProvider>,
  );
}

describe("Presence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("PresenceDot", () => {
    it("paints online dots with the military colour", () => {
      const html = render(<PresenceDot lastSeenAt={ONLINE} />);
      expect(html).toContain("bg-military");
      expect(html).not.toContain("bg-zinc-500");
    });

    it("paints offline dots neutral", () => {
      const html = render(<PresenceDot lastSeenAt={OFFLINE} />);
      expect(html).toContain("bg-zinc-500");
    });

    it("uses the larger size scale for lg", () => {
      expect(render(<PresenceDot lastSeenAt={OFFLINE} size="lg" />)).toContain("size-3");
      expect(render(<PresenceDot lastSeenAt={OFFLINE} size="sm" />)).toContain("size-2");
    });

    it("adds a raised border to offline bordered dots", () => {
      const html = render(<PresenceDot lastSeenAt={OFFLINE} bordered />);
      expect(html).toContain("border-2 border-raised");
    });
  });

  describe("PresenceBadge", () => {
    it("shows the online label while the user is online", () => {
      const html = render(<PresenceBadge lastSeenAt={ONLINE} />);
      expect(html).toContain(pr.online);
      expect(html).toContain("border-military");
    });

    it("reports the bucketed last-seen time when offline", () => {
      const html = render(<PresenceBadge lastSeenAt={OFFLINE} />);
      const expected = pr.lastSeen.replace("{time}", pr.minutesAgo.replace("{count}", "10"));
      expect(html).toContain(expected);
    });

    it("reports never when there is no timestamp", () => {
      const html = render(<PresenceBadge lastSeenAt={null} />);
      expect(html).toContain(pr.never);
    });

    it("hides the status dot when showDot is false", () => {
      expect(render(<PresenceBadge lastSeenAt={OFFLINE} showDot />)).toContain("size-1.5");
      expect(render(<PresenceBadge lastSeenAt={OFFLINE} showDot={false} />)).not.toContain("size-1.5");
    });

    it("drops the HUD framing for the plain variant", () => {
      const html = render(<PresenceBadge lastSeenAt={OFFLINE} variant="plain" />);
      expect(html).not.toContain("border-dim/20");
    });
  });

  describe("AvatarWithPresence", () => {
    it("wraps children in a link when href is set", () => {
      const html = render(
        <AvatarWithPresence lastSeenAt={ONLINE} href="/players/ada">
          <span>avatar</span>
        </AvatarWithPresence>,
      );
      expect(html).toContain('href="/players/ada"');
      expect(html).toContain("avatar");
    });

    it("colours the frame by online state", () => {
      expect(render(<AvatarWithPresence lastSeenAt={ONLINE}><span>x</span></AvatarWithPresence>)).toContain("border-military");
      expect(render(<AvatarWithPresence lastSeenAt={OFFLINE}><span>x</span></AvatarWithPresence>)).toContain("border-[#3d3d34]");
    });
  });

  describe("PresenceAvatar", () => {
    it("links public avatars to the player profile", () => {
      const html = render(<PresenceAvatar username="ada" />);
      expect(html).toContain('href="/players/ada"');
    });

    it("links admin avatars to the user record by id", () => {
      const html = render(
        <PresenceAvatar username="ada" userId="u-7" variant="admin" />,
      );
      expect(html).toContain('href="/admin/users/u-7"');
    });

    it("honours an explicit href over the derived one", () => {
      const html = render(
        <PresenceAvatar username="ada" href="/custom" />,
      );
      expect(html).toContain('href="/custom"');
    });

    it("announces the display name on the fallback glyph", () => {
      const html = render(
        <PresenceAvatar username="ada" displayName="Ada Lovelace" />,
      );
      expect(html).toContain('aria-label="Ada Lovelace"');
    });

    it("uses the uploaded image with the resolved label as alt text", () => {
      const html = render(
        <PresenceAvatar username="ada" avatarUrl="/a.png" />,
      );
      expect(html).toContain('src="/a.png"');
      expect(html).toContain('alt="ada"');
    });
  });
});
