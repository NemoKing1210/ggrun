import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { playerStatusEnum, seasonStatusEnum } from "@/db/schema/enums";
import { StatusBadge } from "@/components/ui/status";
import {
  PLAYER_STATUS_VARIANT,
  SEASON_STATUS_VARIANT,
  type PlayerStatus,
  type SeasonStatus,
} from "@/lib/shared/ui/status-variants";

/**
 * Scenarios are generated from the Postgres enums, not listed by hand, so a
 * value added to `season_status` or `player_status` is covered the moment it
 * exists rather than whenever someone remembers to extend a literal array.
 *
 * These assert what is *rendered*. The maps' totality is already a compile
 * error (`Record<SeasonStatus, StatusVariant>`), and a test that re-asserted
 * it would be the decorative kind sessions 12 and 14 threw out. What `tsc`
 * cannot see is the colour that actually reaches the page — which is the
 * whole of the original report.
 */

const SEASONS = seasonStatusEnum.enumValues as readonly SeasonStatus[];
const PLAYERS = playerStatusEnum.enumValues as readonly PlayerStatus[];

/** Class fragment each variant is required to paint, from Badge.tsx. */
const VARIANT_CLASS = {
  military: "bg-military",
  amber: "bg-amber",
  danger: "bg-danger",
  dim: "bg-[#2a2a22]",
  neutral: "bg-[#2a2a22]",
} as const;

const season = (s: SeasonStatus) =>
  renderToStaticMarkup(<StatusBadge kind="season" status={s} label={`L-${s}`} />);
const player = (s: PlayerStatus) =>
  renderToStaticMarkup(<StatusBadge kind="player" status={s} label={`L-${s}`} />);

/** Every `d` on every path of the rendered glyph, as one comparable string. */
function glyph(html: string): string | null {
  const svg = html.match(/<svg[\s\S]*?<\/svg>/);
  if (!svg) return null;
  const ds = [...svg[0].matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  return ds.length ? ds.join("|") : svg[0];
}

describe("StatusBadge — season", () => {
  it.each(SEASONS)("%s renders its label and its mapped variant", (status) => {
    const html = season(status);
    expect(html).toContain(`L-${status}`);
    expect(html).toContain(VARIANT_CLASS[SEASON_STATUS_VARIANT[status]]);
  });

  // The report: a finished season was flagged in danger red.
  it.each(SEASONS)("%s never paints danger red", (status) => {
    expect(season(status)).not.toContain("bg-danger");
  });

  it.each(SEASONS)("%s carries a glyph", (status) => {
    expect(glyph(season(status))).not.toBeNull();
  });

  // Without this the three idle statuses are three identical grey plaques,
  // which is exactly why `finished` is not simply `dim`.
  it("gives every season status a distinct glyph", () => {
    const glyphs = SEASONS.map((s) => glyph(season(s)));
    expect(new Set(glyphs).size).toBe(SEASONS.length);
  });

  it("keeps finished visually apart from the other two idle statuses", () => {
    const idle = SEASONS.filter((s) => SEASON_STATUS_VARIANT[s] === "dim");
    expect(idle.length).toBeGreaterThan(0);
    for (const other of idle) {
      expect(glyph(season("finished"))).not.toBe(glyph(season(other)));
    }
  });
});

describe("StatusBadge — player", () => {
  it.each(PLAYERS)("%s renders its label and its mapped variant", (status) => {
    const html = player(status);
    expect(html).toContain(`L-${status}`);
    expect(html).toContain(VARIANT_CLASS[PLAYER_STATUS_VARIANT[status]]);
  });

  // Thirty of these appear down one leaderboard; a repeated glyph is noise.
  it.each(PLAYERS)("%s carries no glyph", (status) => {
    expect(glyph(player(status))).toBeNull();
  });

  it("paints danger for eliminated and for nothing else", () => {
    for (const status of PLAYERS) {
      const red = player(status).includes("bg-danger");
      expect(red).toBe(status === "eliminated");
    }
  });
});

describe("StatusBadge — the two maps are not interchangeable", () => {
  // `finished` is in both enums and means opposite things. If the two maps ever
  // agree on it again, the split has been undone.
  it("disagrees on the status both enums share", () => {
    expect(SEASONS).toContain("finished");
    expect(PLAYERS).toContain("finished");
    expect(season("finished")).not.toBe(player("finished"));
    expect(SEASON_STATUS_VARIANT.finished).not.toBe(PLAYER_STATUS_VARIANT.finished);
  });
});
