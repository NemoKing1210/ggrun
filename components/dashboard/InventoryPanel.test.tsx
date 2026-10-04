// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { EffectDef, ItemDef } from "@/lib/engine";

import {
  InventoryPanel,
  type InventoryRow,
  type StatusRow,
  type TargetRow,
} from "./InventoryPanel";

const t = getDictionary("en");
const p = t.iee.panel;

const defs = vi.hoisted(() => ({
  items: {
    passive_item: {
      key: "passive_item",
      heroIcon: "GiftIcon",
      i18n: { name: "iee.items.lodestone.name", description: "iee.items.lodestone.description" },
      usage: { mode: "passive", window: "anytime", target: "self" },
    },
    self_item: {
      key: "self_item",
      heroIcon: "CubeIcon",
      i18n: { name: "iee.items.lodestone.name", description: "iee.items.lodestone.description" },
      usage: { mode: "active", window: "before_roll", target: "self" },
    },
    other_item: {
      key: "other_item",
      heroIcon: "ExclamationTriangleIcon",
      i18n: { name: "iee.items.jinx.name", description: "iee.items.jinx.description" },
      usage: { mode: "active", window: "anytime", target: "other" },
    },
  } as unknown as Record<string, ItemDef>,
  effects: {
    rolls_effect: {
      key: "rolls_effect",
      heroIcon: "BoltIcon",
      i18n: { name: "iee.effects.heavyBoots.name", description: "iee.effects.heavyBoots.description" },
      duration: { kind: "rolls", value: 3 },
    },
    charges_effect: {
      key: "charges_effect",
      heroIcon: "ShieldCheckIcon",
      i18n: { name: "iee.effects.shield.name", description: "iee.effects.shield.description" },
      duration: { kind: "charges", value: 5 },
    },
    perm_effect: {
      key: "perm_effect",
      heroIcon: "SparklesIcon",
      i18n: { name: "iee.effects.tailwind.name", description: "iee.effects.tailwind.description" },
      duration: { kind: "permanent" },
    },
  } as unknown as Record<string, EffectDef>,
}));

vi.mock("@/lib/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engine")>();
  return {
    ...actual,
    getItem: (key: string) => defs.items[key] ?? null,
    getEffect: (key: string) => defs.effects[key] ?? null,
  };
});

const actions = vi.hoisted(() => ({ useItem: vi.fn() }));

vi.mock("@/lib/modules/iee/actions", () => ({
  useItemAction: actions.useItem,
}));

const itemRow = (over: Partial<InventoryRow> = {}): InventoryRow => ({
  id: "i1",
  itemKey: "self_item",
  chargesLeft: 1,
  source: "cell",
  ...over,
});

const statusRow = (over: Partial<StatusRow> = {}): StatusRow => ({
  id: "s1",
  effectKey: "rolls_effect",
  polarity: "positive",
  chargesLeft: null,
  rollsLeft: 2,
  castByUsername: null,
  ...over,
});

const targetRow = (over: Partial<TargetRow> = {}): TargetRow => ({
  seasonPlayerId: "sp2",
  username: "bob",
  displayName: "Bob",
  avatarUrl: null,
  position: 3,
  targetable: true,
  ...over,
});

function renderPanel(over: {
  items?: InventoryRow[];
  statuses?: StatusRow[];
  targets?: TargetRow[];
  allowTargeting?: boolean;
} = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <InventoryPanel
        items={over.items ?? []}
        statuses={over.statuses ?? []}
        targets={over.targets ?? []}
        allowTargeting={over.allowTargeting ?? true}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  actions.useItem.mockReset();
  actions.useItem.mockResolvedValue({ ok: "self_item" });
});

afterEach(() => cleanup());

describe("InventoryPanel empty states", () => {
  it("draws empty slots for both halves", () => {
    renderPanel();
    expect(screen.getByText(p.empty)).toBeTruthy();
    expect(screen.getByText(p.statusesEmpty)).toBeTruthy();
  });
});

describe("InventoryPanel items", () => {
  it("renders the catalog name and window vocabulary from the dictionary", () => {
    renderPanel({ items: [itemRow()] });
    expect(screen.getByText("Lodestone")).toBeTruthy();
    expect(screen.getByText(t.iee.admin.window.before_roll)).toBeTruthy();
  });

  it("falls back to the raw key for an unknown catalog entry", () => {
    renderPanel({ items: [itemRow({ itemKey: "ghost_item" })] });
    expect(screen.getByText("ghost_item")).toBeTruthy();
  });

  it("badges a passive item instead of offering use", () => {
    renderPanel({ items: [itemRow({ itemKey: "passive_item" })] });
    expect(screen.getByText(p.passive)).toBeTruthy();
    expect(screen.queryByRole("button", { name: p.use })).toBeNull();
  });

  it("shows a charges badge only above one charge", () => {
    const { unmount } = renderPanel({ items: [itemRow({ chargesLeft: 1 })] });
    expect(screen.queryByText(p.charges.replace("{count}", "1"))).toBeNull();
    unmount();
    renderPanel({ items: [itemRow({ chargesLeft: 3 })] });
    expect(screen.getByText(p.charges.replace("{count}", "3"))).toBeTruthy();
  });

  it("submits a self-targeted item through the action with its id", async () => {
    renderPanel({ items: [itemRow({ id: "inv-7" })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect(formData.get("inventoryId")).toBe("inv-7");
  });

  it("opens the target picker for an other-targeted item", () => {
    renderPanel({ items: [itemRow({ id: "inv-9", itemKey: "other_item" })], targets: [targetRow()] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.targetTitle)).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("blocks other-targeted items when targeting is disabled", () => {
    renderPanel({
      items: [itemRow({ itemKey: "other_item" })],
      allowTargeting: false,
      targets: [targetRow()],
    });
    const button = screen.getByRole("button", { name: p.use });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("title")).toBe(p.targetingDisabled);
  });

  it("surfaces an action error", async () => {
    actions.useItem.mockResolvedValue({ error: "already used" });
    renderPanel({ items: [itemRow()] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("already used"));
  });
});

describe("InventoryPanel target picker", () => {
  it("submits the chosen target with both ids", async () => {
    renderPanel({
      items: [itemRow({ id: "inv-9", itemKey: "other_item" })],
      targets: [targetRow({ seasonPlayerId: "sp2" })],
    });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect(formData.get("inventoryId")).toBe("inv-9");
    expect(formData.get("targetSeasonPlayerId")).toBe("sp2");
  });

  it("disables a protected target and explains why", () => {
    renderPanel({
      items: [itemRow({ itemKey: "other_item" })],
      targets: [targetRow({ targetable: false })],
    });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    const target = screen.getByRole("button", { name: /Bob/ }) as HTMLButtonElement;
    expect(target.disabled).toBe(true);
    expect(screen.getByText(p.targetProtected)).toBeTruthy();
  });

  it("shows an empty hint when there is nobody to target", () => {
    renderPanel({ items: [itemRow({ itemKey: "other_item" })], targets: [] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.targetNone)).toBeTruthy();
  });
});

describe("InventoryPanel statuses", () => {
  it("renders a rolls-left meter with one pip per catalog roll", () => {
    renderPanel({ statuses: [statusRow({ rollsLeft: 2, effectKey: "rolls_effect" })] });
    const meter = screen.getByTitle(p.expiresIn.replace("{count}", "2"));
    expect(meter.querySelectorAll("span.w-1\\.5").length).toBe(3);
  });

  it("renders a charges-left meter", () => {
    renderPanel({
      statuses: [statusRow({ rollsLeft: null, chargesLeft: 4, effectKey: "charges_effect" })],
    });
    expect(screen.getByTitle(p.expiresCharges.replace("{count}", "4"))).toBeTruthy();
  });

  it("labels a status with no counter as permanent", () => {
    renderPanel({
      statuses: [statusRow({ rollsLeft: null, chargesLeft: null, effectKey: "perm_effect" })],
    });
    expect(screen.getByText(p.permanent)).toBeTruthy();
  });

  it("shows the polarity badge", () => {
    renderPanel({ statuses: [statusRow({ polarity: "negative" })] });
    expect(screen.getByText(t.iee.polarity.negative)).toBeTruthy();
  });

  it("credits the caster or the source cell", () => {
    const { unmount } = renderPanel({ statuses: [statusRow({ castByUsername: "bob" })] });
    expect(screen.getByText(p.castBy.replace("{name}", "bob"))).toBeTruthy();
    unmount();
    renderPanel({ statuses: [statusRow()] });
    expect(screen.getByText(p.fromCell)).toBeTruthy();
  });
});
