// @vitest-environment jsdom
/**
 * Completions for the argument under the caret: seasons are filtered from the
 * host-supplied list with no network hop, while user/game (dynamic) args
 * debounce and hit the server action. Timers are faked so the 140ms debounce
 * is asserted rather than raced.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseInput } from "@/lib/shared/admin-console";

const { suggestAction } = vi.hoisted(() => ({ suggestAction: vi.fn() }));

vi.mock("@/lib/modules/admin-console/actions", () => ({
  suggestAdminArgsAction: suggestAction,
}));

import type { ConsoleSeason } from "./CommandPaletteProvider";
import { useArgSuggestions } from "./useArgSuggestions";

const SEASONS: ConsoleSeason[] = [
  { id: "s1", slug: "crimson-horizon", title: "Crimson Horizon", status: "active" },
  { id: "s2", slug: "neon-protocol", title: "Neon Protocol", status: "draft" },
];

beforeEach(() => {
  suggestAction.mockReset();
  suggestAction.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useArgSuggestions", () => {
  it("filters seasons from the prop by slug/title without a server call", () => {
    const { result } = renderHook(() => useArgSuggestions(parseInput("season cr"), SEASONS));

    expect(result.current.options).toEqual([
      { value: "crimson-horizon", label: "Crimson Horizon", hint: "crimson-horizon · active" },
    ]);
    expect(result.current.loading).toBe(false);
    expect(suggestAction).not.toHaveBeenCalled();
  });

  it("lists every season for an empty partial, capped at eight", () => {
    const many: ConsoleSeason[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      slug: `season-${i}`,
      title: `Season ${i}`,
      status: "active",
    }));

    const { result } = renderHook(() => useArgSuggestions(parseInput("season "), many));

    expect(result.current.options).toHaveLength(8);
    expect(result.current.options[0]).toEqual({ value: "season-0", label: "Season 0", hint: "season-0 · active" });
    expect(suggestAction).not.toHaveBeenCalled();
  });

  it("debounces a dynamic user arg, shows loading, then applies the action result", async () => {
    vi.useFakeTimers();
    suggestAction.mockResolvedValueOnce([{ value: "alice", label: "Alice", hint: "alice@example.com" }]);

    const { result } = renderHook(() => useArgSuggestions(parseInput("user al"), SEASONS));

    expect(result.current.loading).toBe(true);
    expect(result.current.options).toEqual([]);
    expect(suggestAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(139);
    });
    expect(suggestAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(suggestAction).toHaveBeenCalledWith("user", "al");
    expect(suggestAction).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.options).toEqual([{ value: "alice", label: "Alice", hint: "alice@example.com" }]);
  });
});
