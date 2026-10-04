import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FadeSwitch,
  HudMotion,
  Reveal,
  Stagger,
  StaggerItem,
  hudRiseChild,
  hudStaggerParent,
  riseDelay,
} from "@/components/ui/motion";

describe("riseDelay", () => {
  it("steps delay linearly with the index", () => {
    expect(riseDelay(0).animationDelay).toBe("0ms");
    expect(riseDelay(2).animationDelay).toBe("60ms");
  });

  it("caps the delay so late items do not drift", () => {
    expect(riseDelay(10).animationDelay).toBe("300ms");
    expect(riseDelay(50).animationDelay).toBe("300ms");
  });

  it("honours a custom step and cap", () => {
    expect(riseDelay(3, 50).animationDelay).toBe("150ms");
    expect(riseDelay(100, 10, 250).animationDelay).toBe("250ms");
  });
});

describe("motion variants", () => {
  it("rises children from offset opacity in the hidden frame", () => {
    const hidden = hudRiseChild.hidden as unknown as { opacity: number; y: number };
    expect(hidden.opacity).toBe(0);
    expect(hidden.y).toBeGreaterThan(0);
  });

  it("settles children at rest", () => {
    const show = hudRiseChild.show as unknown as { opacity: number; y: number };
    expect(show.opacity).toBe(1);
    expect(show.y).toBe(0);
  });

  it("exposes a parameterised stagger parent", () => {
    expect(typeof hudStaggerParent.show).toBe("function");
  });
});

describe("motion wrappers", () => {
  it("renders Reveal children with the given className", () => {
    const html = renderToStaticMarkup(
      <Reveal className="section">hero content</Reveal>,
    );
    expect(html).toContain("hero content");
    expect(html).toContain("section");
  });

  it("renders Stagger and StaggerItem children", () => {
    const html = renderToStaticMarkup(
      <Stagger className="list">
        <StaggerItem>row one</StaggerItem>
      </Stagger>,
    );
    expect(html).toContain("list");
    expect(html).toContain("row one");
  });

  it("renders FadeSwitch children under the current view key", () => {
    const html = renderToStaticMarkup(
      <FadeSwitch viewKey="grid">grid view</FadeSwitch>,
    );
    expect(html).toContain("grid view");
  });

  it("renders HudMotion children", () => {
    const html = renderToStaticMarkup(<HudMotion>wrapped</HudMotion>);
    expect(html).toContain("wrapped");
  });
});
