import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/modules/catalog/repository/requests", () => ({
  listPendingRerollRequests: vi.fn(),
}));
vi.mock("@/lib/modules/game/moderation", () => ({
  approveRerollRequest: vi.fn(),
  rejectCompletionRequest: vi.fn(),
}));
vi.mock("./actions/moderation", () => ({
  approveAllRerollsAction: vi.fn(),
  rejectRerollAction: vi.fn(),
}));

import * as requests from "@/lib/modules/catalog/repository/requests";
import * as gameModeration from "@/lib/modules/game/moderation";
import * as actions from "./actions/moderation";
import * as barrel from "./index";

describe("moderation barrel", () => {
  it("re-exports the request repository, game verdicts and server actions", () => {
    expect(barrel.listPendingRerollRequests).toBe(requests.listPendingRerollRequests);
    expect(barrel.approveRerollRequest).toBe(gameModeration.approveRerollRequest);
    expect(barrel.rejectCompletionRequest).toBe(gameModeration.rejectCompletionRequest);
    expect(barrel.approveAllRerollsAction).toBe(actions.approveAllRerollsAction);
    expect(barrel.rejectRerollAction).toBe(actions.rejectRerollAction);
  });
});
