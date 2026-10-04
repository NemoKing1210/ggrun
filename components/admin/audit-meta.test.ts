import {
  CalendarDaysIcon,
  Cog6ToothIcon,
  FingerPrintIcon,
  KeyIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
  UserGroupIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { describe, expect, it } from "vitest";

import {
  actionMeta,
  auditActionLabel,
  auditFieldLabel,
  auditTargetLabel,
  describeAudit,
  formatAuditValue,
  isPlainObject,
  payloadSummary,
  prettifyCode,
  type AuditLabels,
} from "./audit-meta";

describe("actionMeta", () => {
  it("maps the destructive verbs to the trash", () => {
    expect(actionMeta("user_delete")).toEqual({ variant: "danger", icon: TrashIcon });
    expect(actionMeta("item_remove")).toEqual({ variant: "danger", icon: TrashIcon });
  });

  it("maps blocking to the no-entry sign", () => {
    expect(actionMeta("user_block")).toEqual({ variant: "danger", icon: NoSymbolIcon });
  });

  it("maps creation and approval to the plus", () => {
    expect(actionMeta("create_user")).toEqual({ variant: "military", icon: PlusIcon });
    expect(actionMeta("approve_verification")).toEqual({ variant: "military", icon: PlusIcon });
  });

  it("maps edits, revocations and adjustments to the pencil", () => {
    expect(actionMeta("update_season")).toEqual({ variant: "amber", icon: PencilSquareIcon });
    expect(actionMeta("revoke_item")).toEqual({ variant: "amber", icon: PencilSquareIcon });
    expect(actionMeta("adjust_points")).toEqual({ variant: "amber", icon: PencilSquareIcon });
  });

  // The word list is a precedence chain, not a lookup: the first matching
  // pattern wins, so a compound name lands on the earlier group.
  it("resolves compound names by the first pattern that matches", () => {
    expect(actionMeta("season_create").icon).toBe(PlusIcon); // create before season
    expect(actionMeta("board_update").icon).toBe(PencilSquareIcon); // update before board
    expect(actionMeta("settings_update").icon).toBe(PencilSquareIcon); // update before settings
    expect(actionMeta("blocklist_add").icon).toBe(NoSymbolIcon); // block before add
  });

  it("falls through the remaining groups in order", () => {
    expect(actionMeta("season_rolled_over")).toEqual({ variant: "violet", icon: CalendarDaysIcon });
    expect(actionMeta("reject_invite")).toEqual({ variant: "sky", icon: KeyIcon });
    expect(actionMeta("board_reset")).toEqual({ variant: "emerald", icon: Squares2X2Icon });
    expect(actionMeta("player_kick")).toEqual({ variant: "sky", icon: UserGroupIcon });
    expect(actionMeta("keys_rotate")).toEqual({ variant: "dim", icon: Cog6ToothIcon });
    expect(actionMeta("user_profile")).toEqual({ variant: "dim", icon: UserIcon });
  });

  it("falls back to the fingerprint for anything unrecognised", () => {
    expect(actionMeta("mystery")).toEqual({ variant: "neutral", icon: FingerPrintIcon });
  });

  it("is case-sensitive, as the persisted action names are lowercase", () => {
    expect(actionMeta("DELETE_ITEM")).toEqual({ variant: "neutral", icon: FingerPrintIcon });
  });
});

describe("isPlainObject", () => {
  it("accepts objects but rejects arrays and null", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(3)).toBe(false);
  });
});

describe("prettifyCode", () => {
  it("capitalises the first word and spaces the rest", () => {
    expect(prettifyCode("season_status_active")).toBe("Season status active");
    expect(prettifyCode("foo-bar_baz")).toBe("Foo bar baz");
  });

  it("keeps the already-capitalised letters of later words", () => {
    expect(prettifyCode("season_STATUS_active")).toBe("Season STATUS active");
  });

  it("returns a code with no words unchanged", () => {
    expect(prettifyCode("")).toBe("");
    expect(prettifyCode("___")).toBe("___");
  });
});

describe("auditActionLabel", () => {
  const dict: AuditLabels = { actions: { user_delete: "Deleted a user" } };

  it("prefers the dictionary", () => {
    expect(auditActionLabel("user_delete", dict)).toBe("Deleted a user");
  });

  it("labels IEE event actions from their event key", () => {
    expect(auditActionLabel("iee_event_hex_scroll")).toBe("Event: Hex scroll");
  });

  it("labels season status changes from their status", () => {
    expect(auditActionLabel("season_status_active")).toBe("Season active");
  });

  it("prettifies anything else", () => {
    expect(auditActionLabel("player_adjusted", null)).toBe("Player adjusted");
    expect(auditActionLabel("player_adjusted", undefined)).toBe("Player adjusted");
  });
});

describe("auditTargetLabel / auditFieldLabel", () => {
  const dict: AuditLabels = { targets: { season: "Season" }, fields: { itemKey: "Item" } };

  it("uses the dictionary when present and the raw code otherwise", () => {
    expect(auditTargetLabel("season", dict)).toBe("Season");
    expect(auditTargetLabel("board_cell", dict)).toBe("Board cell");
    expect(auditFieldLabel("itemKey", dict)).toBe("Item");
    expect(auditFieldLabel("effectKey", dict)).toBe("effectKey");
  });
});

describe("formatAuditValue", () => {
  it("shows an em dash for nullish and empty arrays", () => {
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue(undefined)).toBe("—");
    expect(formatAuditValue([])).toBe("—");
  });

  it("renders booleans as yes/no and numbers as-is", () => {
    expect(formatAuditValue(true)).toBe("yes");
    expect(formatAuditValue(false)).toBe("no");
    expect(formatAuditValue(42)).toBe("42");
  });

  it("truncates strings past 48 characters", () => {
    expect(formatAuditValue("x".repeat(48))).toBe("x".repeat(48));
    const long = "y".repeat(60);
    expect(formatAuditValue(long)).toBe(`${"y".repeat(47)}…`);
  });

  it("previews up to four scalar array items and counts the rest", () => {
    expect(formatAuditValue(["a", "b"])).toBe("a, b");
    expect(formatAuditValue([1, 2, 3, 4, 5, 6])).toBe("1, 2, 3, 4 +2");
  });

  it("collapses an array of non-scalars to its length", () => {
    expect(formatAuditValue([{ a: 1 }, { b: 2 }])).toBe("×2");
  });

  it("collapses a plain object", () => {
    expect(formatAuditValue({ a: 1 })).toBe("{…}");
  });
});

describe("describeAudit", () => {
  it("uses the dictionary's empty string, or an em dash by default", () => {
    expect(describeAudit({ actionType: "x", payload: {} })).toBe("—");
    expect(describeAudit({ actionType: "x" })).toBe("—");
    expect(describeAudit({ actionType: "x", payload: null }, { summaryEmpty: "nothing" })).toBe("nothing");
  });

  it("orders informative keys first and keeps payload order for the rest", () => {
    expect(describeAudit({ actionType: "x", payload: { zz: 1, title: "A", reason: "B" } })).toBe(
      "title: A · reason: B · zz: 1",
    );
  });

  it("shows at most four keys", () => {
    const out = describeAudit({
      actionType: "x",
      payload: { title: "A", reason: "B", email: "c@d.e", username: "u", extra: "5" },
    });
    expect(out).toBe("title: A · reason: B · email: c@d.e · username: u");
  });

  it("translates field names through the dictionary", () => {
    expect(
      describeAudit({ actionType: "x", payload: { itemKey: "spare_die" } }, { fields: { itemKey: "Item" } }),
    ).toBe("Item: spare_die");
  });

  it("shortens id-like values but leaves short ones alone", () => {
    expect(
      describeAudit({
        actionType: "x",
        payload: { runId: "0123456789abcdef", triggeredBy: "short" },
      }),
    ).toBe("triggeredBy: short · runId: 01234567…");
  });

  it("formats array values through formatAuditValue", () => {
    expect(describeAudit({ actionType: "x", payload: { genres: ["a", "b", "c", "d", "e"] } })).toBe(
      "genres: a, b, c, d +1",
    );
  });
});

describe("payloadSummary", () => {
  it("renders nullish values as null, objects as a placeholder, primitives quoted", () => {
    expect(payloadSummary({ a: null, b: undefined, c: { n: 1 }, d: "text", e: 7 })).toBe(
      'a=null · b=null · c={…} · d="text" · e="7"',
    );
  });

  it("returns an empty string for an empty payload", () => {
    expect(payloadSummary({})).toBe("");
  });
});
