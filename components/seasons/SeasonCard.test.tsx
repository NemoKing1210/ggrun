import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BoardCell, Season } from "@/db/schema";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { SeasonCard, type SeasonCardStats } from "./SeasonCard";

const t = getDictionary("en");

const season = (over: Partial<Season> = {}): Season => ({
  id: "s1",
  slug: "run-1",
  title: "Run One",
  status: "active",
  config: {},
  rulesMd: null,
  startedAt: null,
  finishedAt: null,
  createdBy: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  ...over,
});

const cell = (cellType: BoardCell["cellType"]): BoardCell => ({
  id: `c-${cellType}`,
  boardId: "b1",
  position: 0,
  cellType,
  label: null,
  config: {},
});

const render = (s: Season, stats?: SeasonCardStats, isCurrent?: boolean) =>
  renderToStaticMarkup(
    <I18nProvider locale="en" t={t}>
      <SeasonCard season={s} t={t} locale="en" stats={stats} isCurrent={isCurrent} />
    </I18nProvider>,
  );

describe("SeasonCard", () => {
  it("links to the season and shows its title and slug", () => {
    const html = render(season());
    expect(html).toContain('href="/seasons/run-1"');
    expect(html).toContain("Run One");
    expect(html).toContain("/run-1");
  });

  it("marks the current season with a badge and a top bar", () => {
    const current = render(season(), undefined, true);
    expect(current).toContain("Current");
    const other = render(season(), undefined, false);
    expect(other).not.toContain("Current");
  });

  it("labels the status from the dictionary", () => {
    expect(render(season({ status: "active" }))).toContain("Running");
    expect(render(season({ status: "paused" }))).toContain("Paused");
  });

  it("formats the dates in the requested locale", () => {
    const startedAt = new Date("2026-01-05T00:00:00.000Z");
    const expected = new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(startedAt);
    expect(render(season({ startedAt }))).toContain(expected);
  });

  it("computes the duration across days, hours and minutes", () => {
    expect(render(season({ startedAt: new Date("2026-01-01T00:00:00Z"), finishedAt: new Date("2026-01-03T12:00:00Z") }))).toContain(
      "2d 12h",
    );
    expect(render(season({ startedAt: new Date("2026-01-01T00:00:00Z"), finishedAt: new Date("2026-01-01T05:00:00Z") }))).toContain(
      "5h",
    );
    expect(render(season({ startedAt: new Date("2026-01-01T00:00:00Z"), finishedAt: new Date("2026-01-01T00:30:00Z") }))).toContain(
      "30m",
    );
  });

  it("shows an em dash when there is no start or finish date", () => {
    expect(render(season({ startedAt: null, status: "draft" }))).toContain("—");
  });

  it("shows the empty-participants note when stats exist but nobody leads", () => {
    expect(render(season(), { participants: 0, cells: 0 })).toContain("No participants in this season.");
  });

  it("falls back to a top-player name when the full object is absent", () => {
    expect(render(season(), { participants: 1, cells: 0, topPlayerName: "Ada" })).toContain("Ada");
  });

  it("renders the top player's fallback avatar and display name", () => {
    const html = render(season(), {
      participants: 1,
      cells: 0,
      topPlayer: { username: "ada", displayName: null, avatarUrl: null, lastSeenAt: null },
    });
    expect(html).toContain("ada");
    expect(html).toContain('aria-label="ada"');
  });

  it("counts participants beyond the shown avatars", () => {
    const html = render(season(), {
      participants: 5,
      cells: 0,
      participantsAvatars: [
        { username: "a", displayName: "A", avatarUrl: null, lastSeenAt: null },
        { username: "b", displayName: "B", avatarUrl: null, lastSeenAt: null },
      ],
    });
    expect(html).toContain("+3");
    expect(html).toContain("5 players");
  });

  it("draws the board distribution bar from the cell mix", () => {
    const html = render(season({ startedAt: new Date("2026-01-05T00:00:00.000Z") }), {
      participants: 1,
      cells: 3,
      boardCells: [cell("normal"), cell("normal"), cell("bonus")],
    });
    expect(html).toContain('title="normal: 2"');
    expect(html).toContain('title="bonus: 1"');
    expect(html).toContain("3 cells");
  });

  it("defaults the move count to zero", () => {
    expect(render(season(), { participants: 1, cells: 0 })).toContain(">0<");
  });
});
