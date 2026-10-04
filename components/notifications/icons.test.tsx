import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  MegaphoneIcon,
  PlayIcon,
  TrophyIcon,
  UserMinusIcon,
  UserPlusIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_TEMPLATES } from "@/lib/engine/notifications/registry";

import { NotificationIcon } from "./icons";

/** The glyph each engine icon key must resolve to, rendered the same way the wrapper renders it. */
const EXPECTED: Record<string, string> = {
  UserPlusIcon: renderToStaticMarkup(<UserPlusIcon className="h-5 w-5" aria-hidden />),
  UserMinusIcon: renderToStaticMarkup(<UserMinusIcon className="h-5 w-5" aria-hidden />),
  AdjustmentsHorizontalIcon: renderToStaticMarkup(<AdjustmentsHorizontalIcon className="h-5 w-5" aria-hidden />),
  PlayIcon: renderToStaticMarkup(<PlayIcon className="h-5 w-5" aria-hidden />),
  ArrowPathIcon: renderToStaticMarkup(<ArrowPathIcon className="h-5 w-5" aria-hidden />),
  CheckCircleIcon: renderToStaticMarkup(<CheckCircleIcon className="h-5 w-5" aria-hidden />),
  XCircleIcon: renderToStaticMarkup(<XCircleIcon className="h-5 w-5" aria-hidden />),
  ClockIcon: renderToStaticMarkup(<ClockIcon className="h-5 w-5" aria-hidden />),
  MegaphoneIcon: renderToStaticMarkup(<MegaphoneIcon className="h-5 w-5" aria-hidden />),
  TrophyIcon: renderToStaticMarkup(<TrophyIcon className="h-5 w-5" aria-hidden />),
};

const BELL = renderToStaticMarkup(<BellIcon className="h-5 w-5" aria-hidden />);

describe("NotificationIcon", () => {
  it("renders the Heroicon a key names", () => {
    for (const [key, expected] of Object.entries(EXPECTED)) {
      expect(renderToStaticMarkup(<NotificationIcon icon={key} />), key).toBe(expected);
    }
  });

  it("falls back to the bell for null, empty and unknown keys", () => {
    expect(renderToStaticMarkup(<NotificationIcon icon={null} />)).toBe(BELL);
    expect(renderToStaticMarkup(<NotificationIcon icon="" />)).toBe(BELL);
    expect(renderToStaticMarkup(<NotificationIcon icon="NopeIcon" />)).toBe(BELL);
  });

  it("defaults the size to h-5 w-5 and forwards an explicit class", () => {
    expect(renderToStaticMarkup(<NotificationIcon icon="PlayIcon" />)).toContain('class="h-5 w-5"');
    expect(renderToStaticMarkup(<NotificationIcon icon="PlayIcon" className="size-4 text-red-500" />)).toContain(
      'class="size-4 text-red-500"',
    );
  });

  it("hides every glyph from assistive tech", () => {
    expect(renderToStaticMarkup(<NotificationIcon icon="TrophyIcon" />)).toContain('aria-hidden="true"');
  });

  // The silent failure this guards: the engine adds a notification kind with a
  // new icon key and the card quietly renders a bell instead.
  it("has a real glyph for every icon the notification registry declares", () => {
    const declared = new Set(Object.values(NOTIFICATION_TEMPLATES).map((tpl) => tpl.icon));
    expect(declared.size).toBeGreaterThan(0);
    for (const key of declared) {
      expect(renderToStaticMarkup(<NotificationIcon icon={key} />), `registry icon ${key}`).not.toBe(BELL);
    }
  });
});
