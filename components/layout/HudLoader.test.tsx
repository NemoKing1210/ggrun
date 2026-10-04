import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HudLoader } from "./HudLoader";

describe("HudLoader", () => {
  it("announces itself as a polite status region", () => {
    const html = renderToStaticMarkup(<HudLoader label="Loading board" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("renders the label and the three pulsing cells", () => {
    const html = renderToStaticMarkup(<HudLoader label="Deploying" />);
    expect(html).toContain("Deploying");
    expect(html.match(/hud-loader-cell/g)).toHaveLength(3);
  });

  it("staggered the cell animation delays", () => {
    const html = renderToStaticMarkup(<HudLoader label="…" />);
    expect(html).toContain("animation-delay:0s");
    expect(html).toContain("animation-delay:0.18s");
    expect(html).toContain("animation-delay:0.36s");
  });

  it("appends the caller className to the shell", () => {
    expect(renderToStaticMarkup(<HudLoader label="x" className="min-h-screen" />)).toContain(
      "min-h-screen",
    );
  });
});
