// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { generateSeasonTitle } from "@/lib/shared/utils/season-names";

import { SeasonSlugFields } from "./SeasonSlugFields";

vi.mock("@/lib/shared/utils/season-names", () => ({ generateSeasonTitle: vi.fn() }));

const t = getDictionary("en");
const cs = t.admin.createSeason;
const gen = vi.mocked(generateSeasonTitle);

function setup() {
  const utils = render(
    <I18nProvider locale="en" t={t}>
      <SeasonSlugFields />
    </I18nProvider>,
  );
  return {
    title: utils.container.querySelector('input[name="title"]') as HTMLInputElement,
    slug: utils.container.querySelector('input[name="slug"]') as HTMLInputElement,
  };
}

describe("SeasonSlugFields", () => {
  beforeEach(() => {
    gen.mockReset();
    gen.mockReturnValueOnce("Crimson Horizon").mockReturnValue("Neon Protocol");
  });

  afterEach(cleanup);

  it("previews the auto-generated title and its slug while the title is empty", () => {
    const { title, slug } = setup();
    expect(title.value).toBe("");
    expect(screen.getByText("Crimson Horizon").textContent).toBe("Crimson Horizon");
    expect(screen.getByText("crimson-horizon").textContent).toBe("crimson-horizon");
    expect(screen.getByText(`${cs.autoPreviewLabel}:`).textContent).toBe("Auto:");
    expect(screen.getByText(cs.autoTitleHint).textContent).toBe(cs.autoTitleHint);
    // no manual slug yet — the field is empty and shows the derived preview
    expect(slug.value).toBe("");
  });

  it("derives the slug from the title as the admin types", () => {
    const { title, slug } = setup();
    fireEvent.change(title, { target: { value: "My Run" } });
    expect(slug.value).toBe("my-run");
    // the preview stops being "auto"
    expect(screen.getByText(cs.liveSlugLabel).textContent).toBe(cs.liveSlugLabel);
    expect(screen.queryByText(`${cs.autoPreviewLabel}:`)).toBeNull();
    expect(screen.getByText("My Run").textContent).toBe("My Run");
    expect(screen.getByText("my-run").textContent).toBe("my-run");
  });

  it("keeps a manually edited slug when the title changes afterwards", () => {
    const { title, slug } = setup();
    fireEvent.change(slug, { target: { value: "custom-path" } });
    fireEvent.change(title, { target: { value: "Changed Title" } });
    expect(slug.value).toBe("custom-path");
    expect(screen.getByText("custom-path").textContent).toBe("custom-path");
  });

  it("shuffle fills both fields from a new generated title and re-arms auto-slugging", () => {
    const { title, slug } = setup();
    fireEvent.change(slug, { target: { value: "manual" } });
    fireEvent.click(screen.getByRole("button", { name: cs.shuffleTitle }));
    expect(title.value).toBe("Neon Protocol");
    expect(slug.value).toBe("neon-protocol");
    // dirty flag was cleared, so a later title edit re-derives the slug
    fireEvent.change(title, { target: { value: "Third One" } });
    expect(slug.value).toBe("third-one");
  });
});
