import { describe, expect, it } from "vitest";

import { buildNotification } from "./build";
import { NOTIFICATION_KINDS, NOTIFICATION_TEMPLATES } from "./registry";

describe("notification templates", () => {
  it("covers every kind with title, body, severity and icon", () => {
    expect(NOTIFICATION_KINDS.length).toBeGreaterThan(0);
    for (const kind of NOTIFICATION_KINDS) {
      const template = NOTIFICATION_TEMPLATES[kind];
      expect(template.titleKey.length).toBeGreaterThan(0);
      expect(template.bodyKey.length).toBeGreaterThan(0);
      expect(["info", "success", "warning", "danger"]).toContain(template.severity);
      expect(template.icon.endsWith("Icon")).toBe(true);
    }
  });

  it("builds player_added with dashboard link and dedupe key", () => {
    const built = buildNotification("player_added", {
      seasonId: "season-1",
      seasonTitle: "Run 1",
    });
    expect(built.titleKey).toBe("playerAdded");
    expect(built.severity).toBe("success");
    expect(built.href).toBe("/dashboard");
    expect(built.params).toMatchObject({ season: "Run 1" });
    expect(built.dedupeKey).toBe("player:added:season-1");
    expect(built.actions.map((a) => a.id)).toContain("open_dashboard");
  });

  it("resolves season hrefs from the slug and falls back without one", () => {
    const withSlug = buildNotification("season_started", {
      seasonId: "s1",
      seasonSlug: "run-1",
      seasonTitle: "Run 1",
    });
    expect(withSlug.href).toBe("/seasons/run-1");
    expect(withSlug.actions[0]?.href).toBe("/seasons/run-1");

    const withoutSlug = buildNotification("season_started", { seasonId: "s1" });
    expect(withoutSlug.href).toBe("/seasons");
    expect(withoutSlug.actions[0]?.href).toBe("/seasons");
  });

  it("dedupes verdicts by request id", () => {
    expect(buildNotification("reroll_approved", { requestId: "r1" }).dedupeKey).toBe(
      "reroll:approved:r1",
    );
    expect(buildNotification("completion_rejected", { requestId: "c1" }).dedupeKey).toBe(
      "completion:rejected:c1",
    );
    expect(buildNotification("player_adjusted", {}).dedupeKey).toBeNull();
  });

  it("carries game and moderation context into params and data", () => {
    const built = buildNotification("reroll_rejected", {
      gameTitle: "Doom",
      reason: "low score run",
      adminNote: "need full run",
      requestId: "req-1",
    });
    expect(built.params).toMatchObject({ game: "Doom", adminNote: "need full run" });
    expect(built.data).toMatchObject({
      gameTitle: "Doom",
      requestId: "req-1",
      adminNote: "need full run",
    });
    expect(built.severity).toBe("danger");
  });

  it("lets publishers override image and link", () => {
    const built = buildNotification("completion_approved", {
      imageUrl: "/covers/doom.webp",
      href: "/board",
    });
    expect(built.imageUrl).toBe("/covers/doom.webp");
    expect(built.href).toBe("/board");
  });
});
