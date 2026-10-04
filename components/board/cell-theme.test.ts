import { describe, expect, it } from "vitest";

import { CELL_THEME } from "./cell-theme";

/**
 * The theme is the only thing standing between a cell type and a rendered look,
 * so a missing or duplicated entry is a silent visual bug: the board just shows
 * the wrong colour for a cell nobody notices is wrong until a player does.
 */

const CELL_TYPES = [
  "start",
  "finish",
  "normal",
  "penalty",
  "bonus",
  "teleport",
  "event",
  "custom",
] as const;

describe("CELL_THEME", () => {
  it("covers exactly the board cell types", () => {
    expect(Object.keys(CELL_THEME).sort()).toEqual([...CELL_TYPES].sort());
  });

  it("gives every cell type a box and a dot", () => {
    for (const type of CELL_TYPES) {
      expect(CELL_THEME[type].box.length, `${type} box`).toBeGreaterThan(0);
      expect(CELL_THEME[type].dot.length, `${type} dot`).toBeGreaterThan(0);
    }
  });

  it("never reuses a (box, dot) pair between cell types", () => {
    const pairs = CELL_TYPES.map((type) => `${CELL_THEME[type].box}|${CELL_THEME[type].dot}`);
    expect(new Set(pairs).size).toBe(CELL_TYPES.length);
  });

  it("marks both ends of the board in amber", () => {
    expect(CELL_THEME.start.box).toContain("border-amber");
    expect(CELL_THEME.finish.box).toContain("border-amber");
    expect(CELL_THEME.start.dot).toContain("bg-amber");
    expect(CELL_THEME.finish.dot).toContain("bg-amber");
    // The finish is the louder of the two.
    expect(CELL_THEME.finish.box).toContain("bg-amber/20");
    expect(CELL_THEME.start.box).toContain("bg-amber/15");
  });

  it("sends penalty and bonus down opposite colour channels", () => {
    expect(CELL_THEME.penalty.box).toContain("border-danger");
    expect(CELL_THEME.penalty.dot).toContain("bg-danger");
    expect(CELL_THEME.bonus.box).toContain("border-emerald-600");
    expect(CELL_THEME.bonus.dot).toContain("bg-emerald-500");
  });

  it("keeps teleport and event on their own hues", () => {
    expect(CELL_THEME.teleport.box).toContain("border-violet-500");
    expect(CELL_THEME.event.box).toContain("border-sky-500");
  });

  it("renders normal as the quiet default and custom as a dashed placeholder", () => {
    expect(CELL_THEME.normal.box).toBe("border-[#3d3d34] bg-raised");
    expect(CELL_THEME.custom.box).toContain("border-dashed");
  });

  it("gives only the special cells an inset glow", () => {
    const specials = ["start", "finish", "penalty", "bonus", "teleport", "event"] as const;
    for (const type of specials) {
      expect(CELL_THEME[type].box, `${type} glow`).toContain("shadow-[inset_0_0_");
    }
    expect(CELL_THEME.normal.box).not.toContain("shadow-[inset");
    expect(CELL_THEME.custom.box).not.toContain("shadow-[inset");
  });

  it("dashes only the custom cell", () => {
    expect(CELL_THEME.custom.box).toContain("border-dashed");
    for (const type of ["start", "finish", "normal", "penalty", "bonus", "teleport", "event"] as const) {
      expect(CELL_THEME[type].box, `${type} dashed`).not.toContain("border-dashed");
    }
  });
});
