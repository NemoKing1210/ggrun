// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameRollReveal, InlineGameCarousel } from "./GameRollCarousel";

type Preview = { title: string; coverUrl: string | null; platform: string | null };

const game = (over: Partial<Preview> = {}): Preview => ({
  title: "Doom",
  coverUrl: "/doom.png",
  platform: "PC",
  ...over,
});

const media = { reduced: false };

beforeEach(() => {
  media.reduced = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: media.reduced && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderCarousel(over: {
  games?: Preview[];
  phase?: "idle" | "spinning" | "decelerating" | "revealed";
  targetIndex?: number | null;
  onDecelerateEnd?: () => void;
}) {
  return render(
    <InlineGameCarousel
      games={over.games ?? [game()]}
      phase={over.phase ?? "idle"}
      targetIndex={over.targetIndex ?? null}
      onDecelerateEnd={over.onDecelerateEnd}
    />,
  );
}

describe("InlineGameCarousel", () => {
  it("announces an empty catalog instead of an empty rail", () => {
    renderCarousel({ games: [] });
    expect(screen.getByText(/Catalog empty/)).toBeTruthy();
  });

  it("maps the phase onto the header and footer readouts", () => {
    const { unmount } = renderCarousel({ phase: "spinning" });
    expect(screen.getByText("ROLLING")).toBeTruthy();
    expect(screen.getByText("spinning fast…")).toBeTruthy();
    expect(screen.getByText("RND · SYSTEM")).toBeTruthy();
    unmount();

    renderCarousel({ phase: "idle" });
    expect(screen.getByText("READY")).toBeTruthy();
    expect(screen.getByText("awaiting roll")).toBeTruthy();
    expect(screen.getByText("IDLE")).toBeTruthy();
  });

  it("reports the pool size, tripling small catalogs", () => {
    renderCarousel({ games: [game(), game({ title: "Quake" }), game({ title: "Hexen" })] });
    expect(screen.getByText("9 titles")).toBeTruthy();
  });

  it("keeps large catalogs at their own size", () => {
    renderCarousel({
      games: Array.from({ length: 8 }, (_, i) => game({ title: `G${i}` })),
    });
    expect(screen.getByText("8 titles")).toBeTruthy();
  });

  it("renders a cover image per card and repeats the pool for the long scroll", () => {
    const { container } = renderCarousel({ games: [game(), game({ title: "Quake" })] });
    // 2 titles < 6 -> a pool of 6, repeated 6 times for the smooth scroll.
    expect(container.querySelectorAll("img").length).toBe(36);
    expect(container.querySelectorAll('img[alt="Doom"]').length).toBe(18);
  });

  it("falls back to an abbreviated title when there is no cover", () => {
    renderCarousel({ games: [game({ coverUrl: null, title: "A Very Long Game Title Indeed" })] });
    expect(screen.getAllByText("A Very Long Game Title").length).toBeGreaterThan(0);
  });

  it("shows the platform chip", () => {
    renderCarousel({ games: [game({ platform: "Switch" })] });
    expect(screen.getAllByText("Switch").length).toBeGreaterThan(0);
  });

  it("signals deceleration completion after the reveal animation", () => {
    const onDecelerateEnd = vi.fn();
    vi.useFakeTimers();
    renderCarousel({
      games: [game(), game({ title: "Quake" }), game({ title: "Hexen" })],
      phase: "decelerating",
      targetIndex: 1,
      onDecelerateEnd,
    });
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(onDecelerateEnd).toHaveBeenCalledTimes(1);
  });

  it("fires the reveal callback immediately under reduced motion", () => {
    media.reduced = true;
    const onDecelerateEnd = vi.fn();
    vi.useFakeTimers();
    renderCarousel({
      games: [game()],
      phase: "revealed",
      targetIndex: 0,
      onDecelerateEnd,
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(onDecelerateEnd).toHaveBeenCalledTimes(1);
  });
});

describe("GameRollReveal", () => {
  it("presents the picked game as locked in", () => {
    render(<GameRollReveal game={game({ title: "Quake" })} />);
    expect(screen.getByText("SELECTED")).toBeTruthy();
    expect(screen.getByText("Quake")).toBeTruthy();
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByText(/locked in run/)).toBeTruthy();
  });

  it("falls back to a title swatch without a cover", () => {
    const { container } = render(
      <GameRollReveal game={game({ title: "Long Title Without Art", coverUrl: null, platform: null })} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Long Title Without A")).toBeTruthy();
  });
});
