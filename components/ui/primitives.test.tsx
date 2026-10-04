import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { AvatarFallback } from "@/components/ui/AvatarFallback";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { BotBadge } from "@/components/ui/BotBadge";
import { Chip } from "@/components/ui/Chip";
import { DebugError } from "@/components/ui/DebugError";
import { PageContainer } from "@/components/ui/PageContainer";
import { Range } from "@/components/ui/Range";
import { Switch } from "@/components/ui/Switch";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { avatarEmojiFor, avatarTintFor } from "@/lib/shared/avatar";

describe("Badge", () => {
  const VARIANT_CLASS = {
    amber: "bg-amber",
    military: "bg-military",
    danger: "bg-danger",
    dim: "bg-[#2a2a22]",
    sky: "bg-sky-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
    neutral: "bg-[#2a2a22]",
  } as const;

  for (const [variant, cls] of Object.entries(VARIANT_CLASS)) {
    it(`paints the ${variant} variant`, () => {
      const html = renderToStaticMarkup(
        <Badge variant={variant as keyof typeof VARIANT_CLASS}>x</Badge>,
      );
      expect(html).toContain(cls);
    });
  }

  it("defaults to the neutral variant and small size", () => {
    const html = renderToStaticMarkup(<Badge>x</Badge>);
    expect(html).toContain("bg-[#2a2a22]");
    expect(html).toContain("text-[11px]");
  });

  it("applies the md size scale", () => {
    const html = renderToStaticMarkup(<Badge size="md">x</Badge>);
    expect(html).toContain("text-xs");
  });

  it("renders children and forwards caller attributes", () => {
    const html = renderToStaticMarkup(
      <Badge title="tip" className="extra">
        LIVE
      </Badge>,
    );
    expect(html).toContain("LIVE");
    expect(html).toContain('title="tip"');
    expect(html).toContain("extra");
  });
});

describe("Chip", () => {
  it("renders a button with the given label", () => {
    const html = renderToStaticMarkup(<Chip>Filter</Chip>);
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("Filter");
  });

  it("uses the amber fill for an active default chip", () => {
    const html = renderToStaticMarkup(<Chip active>On</Chip>);
    expect(html).toContain("bg-amber");
  });

  it("uses the danger fill for an active danger chip", () => {
    const html = renderToStaticMarkup(
      <Chip active variant="danger">
        Danger
      </Chip>,
    );
    expect(html).toContain("bg-danger");
  });

  it("keeps the neutral surface for an inactive chip", () => {
    const html = renderToStaticMarkup(<Chip>Off</Chip>);
    expect(html).toContain("bg-[#1a1a1a]");
    expect(html).not.toContain("bg-amber");
  });

  it("drops the press affordance and dims when disabled", () => {
    const html = renderToStaticMarkup(<Chip disabled>Off</Chip>);
    expect(html).toContain(" disabled");
    expect(html).toContain("cursor-not-allowed");
    expect(html).not.toContain("active:translate-y-px");
  });
});

describe("BackLink", () => {
  it("renders a labelled link to the target href", () => {
    const html = renderToStaticMarkup(<BackLink href="/board" label="Back to board" />);
    expect(html).toContain("<a");
    expect(html).toContain('href="/board"');
    expect(html).toContain("Back to board");
  });
});

describe("PageContainer", () => {
  it("renders children with no class when none is given", () => {
    expect(renderToStaticMarkup(<PageContainer>body</PageContainer>)).toBe("<div>body</div>");
  });

  it("forwards a caller className", () => {
    const html = renderToStaticMarkup(<PageContainer className="wide">body</PageContainer>);
    expect(html).toContain('class="wide"');
    expect(html).toContain("body");
  });
});

describe("PageHeader", () => {
  it("renders a kicker prefixed with // and the title", () => {
    const html = renderToStaticMarkup(<PageHeader kicker="season 3" title="Board" />);
    expect(html).toContain("// ");
    expect(html).toContain("season 3");
    expect(html).toContain("Board");
    expect(html).toContain("<h1");
  });

  it("omits the kicker paragraph when no kicker is given", () => {
    const html = renderToStaticMarkup(<PageHeader title="Board" />);
    expect(html).not.toContain("// ");
  });

  it("renders the right slot only when provided", () => {
    const withRight = renderToStaticMarkup(
      <PageHeader title="Board" right={<span>12 runs</span>} />,
    );
    expect(withRight).toContain("12 runs");
    const without = renderToStaticMarkup(<PageHeader title="Board" />);
    expect(without).not.toContain("12 runs");
  });
});

describe("EmptyState", () => {
  it("renders its message", () => {
    const html = renderToStaticMarkup(<EmptyState>No seasons yet</EmptyState>);
    expect(html).toContain("No seasons yet");
    expect(html).toContain("hud-card");
  });
});

describe("BotBadge", () => {
  it("defaults to the BOT marker", () => {
    const html = renderToStaticMarkup(<BotBadge />);
    expect(html).toContain("BOT");
    expect(html).toContain('title="BOT"');
  });

  it("carries a custom label into both text and title", () => {
    const html = renderToStaticMarkup(<BotBadge label="AI" />);
    expect(html).toContain(">AI<");
    expect(html).toContain('title="AI"');
  });
});

describe("AvatarFallback", () => {
  it("announces the display name to assistive tech", () => {
    const html = renderToStaticMarkup(<AvatarFallback seed="u1" name="Ada Lovelace" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Ada Lovelace"');
    expect(html).toContain('title="Ada Lovelace"');
  });

  it("picks the deterministic glyph and tint for its seed", () => {
    const html = renderToStaticMarkup(<AvatarFallback seed="user-42" name="x" />);
    expect(html).toContain(avatarEmojiFor("user-42"));
    expect(html).toContain(avatarTintFor("user-42"));
  });

  it("produces identical markup for the same seed", () => {
    const a = renderToStaticMarkup(<AvatarFallback seed="same" name="x" />);
    const b = renderToStaticMarkup(<AvatarFallback seed="same" name="x" />);
    expect(a).toBe(b);
  });
});

describe("AvatarBadge", () => {
  it("wraps the avatar in a link when href is set", () => {
    const html = renderToStaticMarkup(<AvatarBadge name="Ada" href="/players/ada" />);
    expect(html).toContain("<a");
    expect(html).toContain('href="/players/ada"');
  });

  it("renders without a link when no href is given", () => {
    const html = renderToStaticMarkup(<AvatarBadge name="Ada" />);
    expect(html).not.toContain("<a");
    expect(html).toContain('role="img"');
  });

  it("renders the uploaded image when src is present", () => {
    const html = renderToStaticMarkup(
      <AvatarBadge name="Ada" src="/avatars/ada.png" />,
    );
    expect(html).toContain('src="/avatars/ada.png"');
    expect(html).not.toContain('role="img"');
  });

  it("falls back to the deterministic glyph when src is missing", () => {
    const html = renderToStaticMarkup(<AvatarBadge name="Ada" seed="u1" />);
    expect(html).toContain(avatarEmojiFor("u1"));
  });

  it("sizes lg avatars larger than md", () => {
    const md = renderToStaticMarkup(<AvatarBadge name="Ada" />);
    const lg = renderToStaticMarkup(<AvatarBadge name="Ada" size="lg" />);
    expect(md).toContain("size-8");
    expect(lg).toContain("size-14");
  });

  it("drops the clipped corner when square", () => {
    const round = renderToStaticMarkup(<AvatarBadge name="Ada" />);
    const square = renderToStaticMarkup(<AvatarBadge name="Ada" square />);
    expect(round).toContain("clip-path:polygon(3px");
    expect(square).not.toContain("clip-path:polygon(3px");
  });
});

describe("Range", () => {
  it("renders an input of type range and forwards bounds", () => {
    const html = renderToStaticMarkup(<Range min={0} max={10} value={4} />);
    expect(html).toContain("<input");
    expect(html).toContain('type="range"');
    expect(html).toContain('max="10"');
    expect(html).toContain('value="4"');
  });
});

describe("Switch", () => {
  it("exposes a switch role bound to the checked state", () => {
    const on = renderToStaticMarkup(
      <Switch checked label="Sound" onChange={() => {}} />,
    );
    const off = renderToStaticMarkup(
      <Switch checked={false} label="Sound" onChange={() => {}} />,
    );
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(off).toContain('aria-checked="false"');
  });

  it("names the switch with its label and links the label element to it", () => {
    const html = renderToStaticMarkup(
      <Switch id="sound" checked label="Sound" onChange={() => {}} />,
    );
    expect(html).toContain('aria-label="Sound"');
    expect(html).toContain('for="sound"');
    expect(html).toContain('id="sound"');
    expect(html).toContain("Sound");
  });

  it("renders the description when supplied", () => {
    const html = renderToStaticMarkup(
      <Switch checked label="Sound" description="Play effects" onChange={() => {}} />,
    );
    expect(html).toContain("Play effects");
  });

  it("marks the control disabled and dims the row", () => {
    const html = renderToStaticMarkup(
      <Switch checked label="Sound" disabled onChange={() => {}} />,
    );
    expect(html).toContain(" disabled");
    expect(html).toContain("opacity-50");
    expect(html).toContain("cursor-not-allowed");
  });
});

describe("DebugError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders nothing without a debug payload", () => {
    expect(renderToStaticMarkup(<DebugError />)).toBe("");
  });

  it("renders the payload under the default title in development", () => {
    const html = renderToStaticMarkup(<DebugError debug="stack trace" />);
    expect(html).toContain('data-testid="debug-error"');
    expect(html).toContain('role="note"');
    expect(html).toContain("dev debug");
    expect(html).toContain("stack trace");
  });

  it("uses an explicit title when given", () => {
    const html = renderToStaticMarkup(<DebugError debug="boom" title="zod issues" />);
    expect(html).toContain("zod issues");
    expect(html).not.toContain("dev debug");
  });

  it("renders nothing in production even with a payload", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(renderToStaticMarkup(<DebugError debug="stack trace" />)).toBe("");
  });
});
