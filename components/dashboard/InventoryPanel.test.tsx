// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { EntryView } from "@/lib/engine";
import { coreRegistry } from "@/lib/modules/iee/registry";

import {
  InventoryPanel,
  type InventoryRow,
  type StatusRow,
  type TargetRow,
} from "./InventoryPanel";

const t = getDictionary("en");
const p = t.iee.panel;

/** The entries as the dashboard hands them over — views, never the catalog. */
const VIEWS = coreRegistry().viewsByKey();
const view = (key: string, over: Partial<EntryView> = {}): EntryView => ({ ...VIEWS[key]!, ...over });

const actions = vi.hoisted(() => ({ useItem: vi.fn(), pickGames: vi.fn(async (_id: string, _q: string) => [] as { id: string; title: string }[]) }));

vi.mock("@/lib/modules/iee/actions", () => ({
  useItemAction: actions.useItem,
  pickGamesAction: actions.pickGames,
}));

/** `speed_boots`: used on yourself, before a roll. */
const itemRow = (over: Partial<InventoryRow> = {}): InventoryRow => ({
  id: "i1",
  chargesLeft: 1,
  source: "cell",
  view: view("speed_boots"),
  ...over,
});
/** `hex_scroll`: used on another player, any time. */
const otherItem = (over: Partial<InventoryRow> = {}): InventoryRow => itemRow({ view: view("hex_scroll"), ...over });

/** `unlucky`: three rolls long. */
const statusRow = (over: Partial<StatusRow> = {}): StatusRow => ({
  id: "s1",
  remaining: 2,
  castByUsername: null,
  view: view("unlucky"),
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
  forbidden?: boolean;
  deciding?: boolean;
} = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <InventoryPanel
        items={over.items ?? []}
        statuses={over.statuses ?? []}
        targets={over.targets ?? []}
        allowTargeting={over.allowTargeting ?? true}
        {...(over.forbidden !== undefined ? { forbidden: over.forbidden } : {})}
        {...(over.deciding !== undefined ? { deciding: over.deciding } : {})}
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
  it("renders the entry's name, its rule text and the window vocabulary", () => {
    renderPanel({ items: [itemRow()] });
    expect(screen.getByText("Boots of Speed")).toBeTruthy();
    expect(screen.getByText(VIEWS.speed_boots!.ruleText.en)).toBeTruthy();
    expect(screen.getByText(t.iee.admin.window.before_roll)).toBeTruthy();
  });

  it("speaks the reader's language", () => {
    render(
      <I18nProvider locale="ru" t={getDictionary("ru")}>
        <InventoryPanel items={[itemRow()]} statuses={[]} targets={[]} allowTargeting />
      </I18nProvider>,
    );
    expect(screen.getByText(VIEWS.speed_boots!.name.ru)).toBeTruthy();
    expect(screen.getByText(VIEWS.speed_boots!.ruleText.ru)).toBeTruthy();
  });

  // Passive items arrive with a later wave; the panel already badges them.
  it("badges a passive item instead of offering use", () => {
    const speed_boots = view("speed_boots");
    const passive = { ...speed_boots, usage: { ...speed_boots.usage!, activation: "passive" as const } };
    renderPanel({ items: [itemRow({ view: passive })] });
    expect(screen.getByText(p.passive)).toBeTruthy();
    expect(screen.getByText(p.passiveMeta)).toBeTruthy();
    expect(screen.queryByRole("button", { name: p.use })).toBeNull();
  });

  it("draws a cursed item in the penalty's colours, says it works by itself, and offers no use (spec §7.5)", () => {
    const speed_boots = view("speed_boots");
    const cursed: EntryView = {
      ...speed_boots,
      character: "penalty",
      polarity: "negative",
      usage: { ...speed_boots.usage!, activation: "cursed", target: "none" },
    };
    renderPanel({ items: [itemRow({ view: cursed, chargesLeft: 1 })] });
    expect(screen.getByText(p.cursed)).toBeTruthy();
    expect(screen.getByText(p.cursedMeta)).toBeTruthy();
    expect(screen.queryByText(t.iee.admin.window.before_roll)).toBeNull();
    expect(screen.queryByRole("button", { name: p.use })).toBeNull();
  });

  it("a reaction item says it waits for the dice and offers no use from here (wave B, spec §7.4)", () => {
    const speed_boots = view("speed_boots");
    const coin: EntryView = { ...speed_boots, key: "coin", usage: { ...speed_boots.usage!, window: "after_dice" } };
    renderPanel({ items: [itemRow({ view: coin })] });
    expect(screen.getByText(p.reactionMeta)).toBeTruthy();
    expect(screen.queryByText(t.iee.admin.window.after_dice)).toBeNull();
    // It is no passive item: it is used, just in the window.
    expect(screen.queryByText(p.passive)).toBeNull();
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
    renderPanel({ items: [otherItem({ id: "inv-9" })], targets: [targetRow()] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.targetTitle)).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("blocks other-targeted items when targeting is disabled", () => {
    renderPanel({
      items: [otherItem()],
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
      items: [otherItem({ id: "inv-9" })],
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
      items: [otherItem()],
      targets: [targetRow({ targetable: false })],
    });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    const target = screen.getByRole("button", { name: /Bob/ }) as HTMLButtonElement;
    expect(target.disabled).toBe(true);
    expect(screen.getByText(p.targetProtected)).toBeTruthy();
  });

  it("disables a rival out of reach and says so (wave B, spec §6.13)", () => {
    renderPanel({
      items: [otherItem()],
      targets: [targetRow({ untargetable: true }), targetRow({ seasonPlayerId: "sp3", username: "cid", displayName: "Cid" })],
    });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect((screen.getByRole("button", { name: /Bob/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Cid/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(p.targetOutOfReach)).toBeTruthy();
  });

  it("greys every use out while the player is kept from items, and says why (wave B, spec §6.13)", () => {
    renderPanel({ items: [itemRow(), otherItem({ id: "i2" })], forbidden: true });
    expect(screen.getByText(p.forbidden)).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: p.use })) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("greys every use out while a choice waits, and sends the player to it (wave B, spec §7.6)", () => {
    renderPanel({ items: [itemRow(), otherItem({ id: "i2" })], deciding: true });
    expect(screen.getByText(p.deciding)).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: p.use })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.getAttribute("title")).toBe(p.deciding);
    }
  });

  it("shows an empty hint when there is nobody to target", () => {
    renderPanel({ items: [otherItem()], targets: [] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.targetNone)).toBeTruthy();
  });
});

describe("InventoryPanel — picks and target filters (spec §6.10)", () => {
  const speed_boots = view("speed_boots");
  const amulet: EntryView = {
    ...speed_boots,
    key: "amulet",
    usage: { ...speed_boots.usage!, target: "self", choice: { what: "any", character: "penalty", entryId: null, rarity: null } },
  };

  it("an item that asks for a pick lists the player's own it may take, and sends the one picked", async () => {
    renderPanel({
      items: [itemRow({ id: "inv-a", view: amulet })],
      statuses: [statusRow({ id: "s-bad", view: view("unlucky") }), statusRow({ id: "s-good", view: view("lucky") })],
    });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.choiceTitle)).toBeTruthy();
    // «Везение» is a bonus: not something it may take.
    expect(screen.queryByRole("button", { name: /Lucky/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Unlucky/ }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect(formData.get("inventoryId")).toBe("inv-a");
    expect(formData.get("choiceInstanceId")).toBe("s-bad");
  });

  it("says so when there is nothing to pick", () => {
    renderPanel({ items: [itemRow({ view: amulet })], statuses: [statusRow({ view: view("lucky") })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.choiceNone)).toBeTruthy();
  });

  it("a filtered item offers only the players its filter allows, and says whom it reaches", () => {
    const hex = view("hex_scroll");
    const magnet: EntryView = { ...hex, usage: { ...hex.usage!, filter: "ahead" } };
    render(
      <I18nProvider locale="en" t={t}>
        <InventoryPanel
          items={[itemRow({ view: magnet })]}
          statuses={[]}
          targets={[targetRow({ seasonPlayerId: "sp-ahead", displayName: "Ahead", position: 12 }), targetRow({ seasonPlayerId: "sp-behind", displayName: "Behind", position: 2 })]}
          allowTargeting
          selfPosition={5}
        />
      </I18nProvider>,
    );
    expect(screen.getByText(p.filter.ahead)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText("Ahead")).toBeTruthy();
    expect(screen.queryByText("Behind")).toBeNull();
  });
});

describe("InventoryPanel — a pick for the next game (wave C, spec §6.16)", () => {
  const boots = view("speed_boots");
  const asking = (pick: "genre" | "years" | "game"): EntryView => ({ ...boots, key: `pick_${pick}`, usage: { ...boots.usage!, target: "self", pick } });

  it("a genre: lists the pool's genres, and sends the one picked", async () => {
    renderPanel({ items: [itemRow({ id: "inv-g", view: asking("genre"), pick: { kind: "genre", options: ["horror", "rpg"] } })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.pickTitle.genre)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "rpg" }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect([formData.get("inventoryId"), formData.get("pickedGenre")]).toEqual(["inv-g", "rpg"]);
  });

  it("a decade: lists the pool's decades, and sends the span", async () => {
    renderPanel({ items: [itemRow({ id: "inv-y", view: asking("years"), pick: { kind: "years", options: [1990, 2000] } })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    fireEvent.click(screen.getByRole("button", { name: "1990–1999" }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    expect((actions.useItem.mock.calls[0][1] as FormData).get("pickedYears")).toBe("1990-1999");
  });

  it("a game: searched for by title as the player types, and the one picked sent", async () => {
    actions.pickGames.mockImplementation(async (_id: string, q: string) =>
      [{ id: "g-1", title: "Celeste" }, { id: "g-2", title: "Hades" }].filter((g) => g.title.toLowerCase().includes(q.toLowerCase())),
    );
    renderPanel({ items: [itemRow({ id: "inv-f", view: asking("game"), pick: { kind: "game" } })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.pickSearching)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Hades" })).toBeTruthy());
    expect(actions.pickGames).toHaveBeenCalledWith("inv-f", "");
    fireEvent.change(screen.getByRole("searchbox", { name: p.pickSearch }), { target: { value: "cel" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Hades" })).toBeNull());
    expect(actions.pickGames).toHaveBeenLastCalledWith("inv-f", "cel");
    fireEvent.click(screen.getByRole("button", { name: "Celeste" }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    expect((actions.useItem.mock.calls[0][1] as FormData).get("pickedGameId")).toBe("g-1");
  });

  it("says so when the pool offers nothing to pick", () => {
    renderPanel({ items: [itemRow({ view: asking("genre"), pick: { kind: "genre", options: [] } })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.pickNone)).toBeTruthy();
  });
});

describe("InventoryPanel — a cell to stand on (wave D, spec §6.18)", () => {
  const boots = view("speed_boots");
  const mine: EntryView = { ...boots, key: "mine", usage: { ...boots.usage!, target: "self", pick: "cell" } };

  it("lists the free cells, says what everyone will see, and sends the one picked", async () => {
    renderPanel({ items: [itemRow({ id: "inv-m", view: mine, pick: { kind: "cell", options: [3, 14, 27] } })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.pickTitle.cell)).toBeTruthy();
    expect(screen.getByText(p.pickCellHint)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cell 14" }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect([formData.get("inventoryId"), formData.get("pickedCell")]).toEqual(["inv-m", "14"]);
  });

  it("says so when no cell is free", () => {
    renderPanel({ items: [itemRow({ view: mine, pick: { kind: "cell", options: [] } })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.pickCellNone)).toBeTruthy();
  });
});

describe("InventoryPanel — picks from the season's catalog (spec §6.12)", () => {
  const speed_boots = view("speed_boots");
  const joker: EntryView = {
    ...speed_boots,
    key: "joker",
    usage: { ...speed_boots.usage!, target: "self", entryChoice: { rarity: ["common"], activation: "active" } },
  };
  const offers = [view("speed_boots"), view("hex_scroll")];

  it("lists what the season offers, and sends the one picked", async () => {
    renderPanel({ items: [itemRow({ id: "inv-j", view: joker, entryOptions: offers })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.entryTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hex Scroll/ }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect(formData.get("inventoryId")).toBe("inv-j");
    expect(formData.get("chosenEntryId")).toBe(VIEWS.hex_scroll!.entryId);
    expect(formData.get("choiceInstanceId")).toBeNull();
  });

  it("says so when the season offers nothing", () => {
    renderPanel({ items: [itemRow({ view: joker, entryOptions: [] })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    expect(screen.getByText(p.entryNone)).toBeTruthy();
  });

  it("a pick of one's own, then one of the catalog: the first step moves on, the last sends both", async () => {
    const stone: EntryView = {
      ...joker,
      key: "stone",
      usage: { ...joker.usage!, choice: { what: "item", character: "bonus", entryId: null, rarity: ["common"] } },
    };
    renderPanel({
      items: [
        itemRow({ id: "inv-s", view: stone, entryOptions: offers }),
        itemRow({ id: "inv-b", view: view("speed_boots") }),
        itemRow({ id: "inv-r", view: view("cleansing_salve") }),
      ],
    });
    fireEvent.click(screen.getAllByRole("button", { name: p.use })[0]!);
    expect(screen.getByText(p.choiceTitle)).toBeTruthy();
    // «Очищающая мазь» is rare: not the stone's to turn.
    expect(screen.queryByRole("button", { name: /Cleansing Salve/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Boots of Speed/ }));
    expect(actions.useItem).not.toHaveBeenCalled();
    expect(screen.getByText(p.entryTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hex Scroll/ }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect([formData.get("inventoryId"), formData.get("choiceInstanceId"), formData.get("chosenEntryId")]).toEqual([
      "inv-s",
      "inv-b",
      VIEWS.hex_scroll!.entryId,
    ]);
  });

  it("an aimed item that also picks asks whom first", async () => {
    const hex = view("hex_scroll");
    const aimed: EntryView = { ...hex, key: "aimed", usage: { ...hex.usage!, entryChoice: { rarity: null, activation: null } } };
    renderPanel({ items: [itemRow({ id: "inv-x", view: aimed, entryOptions: offers })], targets: [targetRow({ seasonPlayerId: "sp2" })] });
    fireEvent.click(screen.getByRole("button", { name: p.use }));
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    expect(screen.getByText(p.entryTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Boots of Speed/ }));
    await waitFor(() => expect(actions.useItem).toHaveBeenCalledTimes(1));
    const formData = actions.useItem.mock.calls[0][1] as FormData;
    expect([formData.get("targetSeasonPlayerId"), formData.get("chosenEntryId")]).toEqual(["sp2", VIEWS.speed_boots!.entryId]);
  });
});

describe("InventoryPanel statuses", () => {
  it("renders a rolls-left meter with one pip per roll the season gives it", () => {
    renderPanel({ statuses: [statusRow({ remaining: 2 })] });
    const meter = screen.getByTitle(p.expiresIn.replace("{count}", "2"));
    expect(meter.querySelectorAll("span.w-1\\.5").length).toBe(3);
  });

  it("renders a triggers-left meter", () => {
    const ward = view("ward", { duration: { unit: "triggers", count: 5 } });
    renderPanel({ statuses: [statusRow({ remaining: 4, view: ward })] });
    const meter = screen.getByTitle(p.expiresCharges.replace("{count}", "4"));
    expect(meter.querySelectorAll("span.w-1\\.5").length).toBe(5);
  });

  it("counts moves and passed games in their own words", () => {
    const moves = view("tailwind", { duration: { unit: "moves", count: 2 } });
    const passed = view("momentum", { duration: { unit: "passed_games", count: 3 } });
    renderPanel({ statuses: [statusRow({ id: "a", remaining: 1, view: moves }), statusRow({ id: "b", remaining: 3, view: passed })] });
    expect(screen.getByTitle(p.expiresMoves.replace("{count}", "1"))).toBeTruthy();
    expect(screen.getByTitle(p.expiresPassed.replace("{count}", "3"))).toBeTruthy();
  });

  it("labels a status with no counter as permanent", () => {
    const forever = view("tailwind", { duration: { unit: "permanent", count: null } });
    renderPanel({ statuses: [statusRow({ remaining: null, view: forever })] });
    expect(screen.getByText(p.permanent)).toBeTruthy();
  });

  it("does not draw pips when the season shortened the duration after the grant", () => {
    renderPanel({ statuses: [statusRow({ remaining: 5 })] });
    const meter = screen.getByTitle(p.expiresIn.replace("{count}", "5"));
    expect(meter.querySelectorAll("span.w-1\\.5").length).toBe(0);
  });

  it("shows the polarity badge from the entry", () => {
    renderPanel({ statuses: [statusRow()] });
    expect(screen.getByText(t.iee.polarity.negative)).toBeTruthy();
    cleanup();
    renderPanel({ statuses: [statusRow({ view: view("lucky") })] });
    expect(screen.getByText(t.iee.polarity.positive)).toBeTruthy();
  });

  it("credits the caster or the source cell", () => {
    const { unmount } = renderPanel({ statuses: [statusRow({ castByUsername: "bob" })] });
    expect(screen.getByText(p.castBy.replace("{name}", "bob"))).toBeTruthy();
    unmount();
    renderPanel({ statuses: [statusRow()] });
    expect(screen.getByText(p.fromCell)).toBeTruthy();
  });
});
