import { describe, expect, it } from "vitest";

import * as admin from "./admin";
import * as service from "./index";
import * as settings from "./settings";

/**
 * The player service barrel is the module's public entry point — callers
 * import from "@/lib/modules/player/service". Lock the re-exported surface so
 * a dropped export breaks here instead of at a distant callsite.
 */
describe("player service barrel", () => {
  it("re-exports the admin service surface", () => {
    expect(service.adminCreateUser).toBe(admin.adminCreateUser);
    expect(service.adminUpdateUser).toBe(admin.adminUpdateUser);
    expect(service.adminSetUserBlocked).toBe(admin.adminSetUserBlocked);
    expect(service.adminRevokeSessions).toBe(admin.adminRevokeSessions);
    expect(service.requireAdmin).toBe(admin.requireAdmin);
    expect(service.listUsers).toBe(admin.listUsers);
  });

  it("re-exports the settings service surface", () => {
    expect(service.updateUserSettings).toBe(settings.updateUserSettings);
    expect(service.setUserLocale).toBe(settings.setUserLocale);
    expect(service.updateUserSettingsSchema).toBe(settings.updateUserSettingsSchema);
  });
});
