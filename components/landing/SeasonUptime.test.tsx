// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeasonUptime } from "./SeasonUptime";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const startedAtIso = "2026-01-01T00:00:00.000Z";

describe("SeasonUptime", () => {
  it("server-renders the provided elapsed seconds", () => {
    const html = renderToStaticMarkup(
      <SeasonUptime label="Live for" startedAtIso={startedAtIso} initialSeconds={90} />,
    );
    expect(html).toContain("Live for");
    expect(html).toContain("00:01:30");
  });

  it("recomputes from the start time on mount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
    render(<SeasonUptime label="Live for" startedAtIso={startedAtIso} initialSeconds={90} />);
    expect(screen.getByText("00:00:30")).toBeTruthy();
  });

  it("shows days once the run crosses a full day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T04:05:06.000Z"));
    render(<SeasonUptime label="Live" startedAtIso={startedAtIso} initialSeconds={0} />);
    expect(screen.getByText("2d 04:05:06")).toBeTruthy();
  });

  it("ticks once per second from the real clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    render(<SeasonUptime label="Live" startedAtIso={startedAtIso} initialSeconds={0} />);
    expect(screen.getByText("00:00:10")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("00:00:13")).toBeTruthy();
  });

  it("never goes negative when the start time is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    render(<SeasonUptime label="Live" startedAtIso="2026-06-01T00:00:00.000Z" initialSeconds={0} />);
    expect(screen.getByText("00:00:00")).toBeTruthy();
  });
});
