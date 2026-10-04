import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn(), isStaff: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => ({ logAdminAction: vi.fn(), logEvent: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/modules/notifications/service", () => ({
  notifySeasonParticipants: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import * as barrel from "./index";
import * as actions from "./actions/seasons";
import * as repository from "./repository/seasons";
import * as service from "./service/seasons";

/**
 * The season module's public entry point is a thin re-export of its three
 * layers. This locks that the barrel keeps forwarding the repository, service
 * and action surface instead of accidentally shadowing one of the layers.
 */
describe("season module barrel", () => {
  it("re-exports the repository layer", () => {
    expect(barrel.getActiveSeason).toBe(repository.getActiveSeason);
    expect(barrel.getSeasonById).toBe(repository.getSeasonById);
    expect(barrel.setSeasonStatus).toBe(repository.setSeasonStatus);
  });

  it("re-exports the service layer", () => {
    expect(barrel.createSeason).toBe(service.createSeason);
    expect(barrel.changeSeasonStatus).toBe(service.changeSeasonStatus);
    expect(barrel.createSeasonSchema).toBe(service.createSeasonSchema);
  });

  it("re-exports the action layer", () => {
    expect(barrel.createSeasonAction).toBe(actions.createSeasonAction);
    expect(barrel.changeStatusAction).toBe(actions.changeStatusAction);
  });
});
