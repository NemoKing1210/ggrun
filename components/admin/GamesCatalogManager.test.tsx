// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ToastProvider } from "@/components/ui/toast";
import type { CatalogGame } from "@/db/schema";
import {
  addCatalogGameAction,
  bulkDeleteGamesAction,
  bulkSetBlacklistedAction,
  deleteGameAction,
  toggleBlacklistAction,
} from "@/lib/modules/catalog/actions/catalog";
import {
  importExternalGameDirectAction,
  importGameFromUrlAction,
  resolveGameUrlAction,
  searchExternalGamesAction,
} from "@/lib/modules/catalog/actions/external";

import GamesCatalogManager from "./GamesCatalogManager";

vi.mock("@/lib/modules/catalog/actions/catalog", () => ({
  addCatalogGameAction: vi.fn(),
  bulkDeleteGamesAction: vi.fn(),
  bulkSetBlacklistedAction: vi.fn(),
  deleteGameAction: vi.fn(),
  toggleBlacklistAction: vi.fn(),
}));

vi.mock("@/lib/modules/catalog/actions/external", () => ({
  importExternalGameDirectAction: vi.fn(),
  importGameFromUrlAction: vi.fn(),
  resolveGameUrlAction: vi.fn(),
  searchExternalGamesAction: vi.fn(),
}));

const t = getDictionary("en");
const catalog = t.admin.catalog;

const addGame = vi.mocked(addCatalogGameAction);
const bulkDelete = vi.mocked(bulkDeleteGamesAction);
const bulkBlacklist = vi.mocked(bulkSetBlacklistedAction);
const deleteGame = vi.mocked(deleteGameAction);
const toggleBlacklist = vi.mocked(toggleBlacklistAction);
const searchExternal = vi.mocked(searchExternalGamesAction);
const importDirect = vi.mocked(importExternalGameDirectAction);
const resolveUrl = vi.mocked(resolveGameUrlAction);
const importFromUrl = vi.mocked(importGameFromUrlAction);

const game = (over: Partial<CatalogGame> = {}): CatalogGame => ({
  id: "g1",
  title: "Elden Ring",
  platform: "pc",
  externalIds: {},
  coverUrl: null,
  genres: ["rpg", "action"],
  isBlacklisted: false,
  metacritic: 96,
  rating: "4.5",
  releasedAt: null,
  esrb: "mature",
  externalSource: "rawg",
  externalRawId: "123",
  tags: ["open-world"],
  description: "A vast open world.",
  playtimeHours: 60,
  stores: [],
  website: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  ...over,
});

const games: CatalogGame[] = [
  game(),
  game({
    id: "g2",
    title: "Silent Hill 2",
    platform: "playstation5",
    genres: ["horror"],
    tags: ["survival"],
    isBlacklisted: true,
    metacritic: 89,
    rating: "4.0",
  }),
  game({
    id: "g3",
    title: "Dota 2",
    genres: ["moba"],
    tags: ["esports"],
    metacritic: null,
    rating: null,
  }),
];

const providers = [{ id: "rawg", label: "RAWG" }];

function renderManager(
  over: { games?: CatalogGame[]; availableProviders?: Array<{ id: string; label: string }> } = {},
) {
  const props: ComponentProps<typeof GamesCatalogManager> = {
    games: over.games ?? games,
    availableProviders: over.availableProviders,
  };
  return render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>
        <GamesCatalogManager {...props} />
      </ToastProvider>
    </I18nProvider>,
  );
}

/** Data rows of the desktop table (header excluded). */
const dataRows = () => screen.queryAllByRole("row").slice(1);

/** Clicks a bulk-bar button, confirms the dialog, and lets the form submit. */
async function invokeBulk(buttonName: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: buttonName }));
  });
  const dialog = screen.getByRole("dialog");
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: t.core.common.confirm }));
  });
}

beforeEach(() => {
  addGame.mockReset().mockResolvedValue({});
  bulkDelete.mockReset().mockResolvedValue(undefined);
  bulkBlacklist.mockReset().mockResolvedValue(undefined);
  deleteGame.mockReset().mockResolvedValue(undefined);
  toggleBlacklist.mockReset().mockResolvedValue(undefined);
  searchExternal.mockReset().mockResolvedValue({});
  importDirect.mockReset().mockResolvedValue(undefined);
  resolveUrl.mockReset().mockResolvedValue({});
  importFromUrl.mockReset().mockResolvedValue({});
});

afterEach(cleanup);

describe("GamesCatalogManager", () => {
  it("lists games, counts them per filter tab, and filters the pool by tab", () => {
    renderManager();

    expect(dataRows()).toHaveLength(3);
    expect(screen.getByRole("button", { name: /^All/ }).textContent).toContain("3");
    expect(screen.getByRole("button", { name: /^Active/ }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /^Blocked/ }).textContent).toContain("1");

    fireEvent.click(screen.getByRole("button", { name: /^Blocked/ }));
    expect(dataRows()).toHaveLength(1);
    expect(dataRows()[0].textContent).toContain("Silent Hill 2");

    fireEvent.click(screen.getByRole("button", { name: /^Active/ }));
    expect(dataRows()).toHaveLength(2);
    expect(dataRows().map((r) => r.textContent)).toEqual([
      expect.stringContaining("Elden Ring"),
      expect.stringContaining("Dota 2"),
    ]);
  });

  it("narrows the pool with the free-text search and resets with the reset button", () => {
    renderManager();

    fireEvent.change(screen.getByPlaceholderText(catalog.filterPlaceholder), {
      target: { value: "dota" },
    });
    expect(dataRows()).toHaveLength(1);
    expect(dataRows()[0].textContent).toContain("Dota 2");

    // search also matches genres/tags, not just titles
    fireEvent.change(screen.getByPlaceholderText(catalog.filterPlaceholder), {
      target: { value: "horror" },
    });
    expect(dataRows()).toHaveLength(1);
    expect(dataRows()[0].textContent).toContain("Silent Hill 2");

    fireEvent.change(screen.getByPlaceholderText(catalog.filterPlaceholder), {
      target: { value: "zzz" },
    });
    expect(dataRows()).toHaveLength(0);
    expect(screen.getByText(catalog.emptyFilteredTitle)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: catalog.resetButton }));
    expect(dataRows()).toHaveLength(3);
  });

  it("shows the empty-catalog state with add/search shortcuts when there are no games", () => {
    renderManager({ games: [] });

    expect(screen.getByText(catalog.emptyCatalogTitle)).not.toBeNull();
    // no rows, and no bulk bar because there is nothing to act on
    expect(screen.queryAllByRole("row")).toEqual([]);
    expect(screen.queryByRole("switch", { name: catalog.selectAll })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Add game/ }).length).toBeGreaterThan(0);
  });

  it("selects every filtered row and bulk-deletes the selected ids after confirmation", async () => {
    renderManager();

    // command row starts in "apply to filtered view" mode
    expect(screen.getByRole("button", { name: new RegExp(catalog.bulkDeleteAll) })).not.toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(catalog.bulkDeleteSelected) })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: catalog.selectAll }));

    expect(screen.getByText(catalog.bulkDeleteSelected)).not.toBeNull();
    expect(screen.getByRole("switch", { name: catalog.deselectAll })).not.toBeNull();
    expect(dataRows().every((row) => (row.querySelector("input[type=checkbox]") as HTMLInputElement).checked)).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(catalog.bulkDeleteSelected) }));
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Delete 3 games?");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: t.core.common.confirm }));
    });

    expect(bulkDelete).toHaveBeenCalledTimes(1);
    const formData = bulkDelete.mock.calls[0][0] as FormData;
    expect(formData.get("ids")).toBe("g1,g2,g3");
  });

  it("bulk-blocks only the selected active games and unblocks the selected blacklisted ones", async () => {
    renderManager();

    // select only the active Elden Ring (desktop checkbox of the first row)
    const firstRowCheckbox = within(dataRows()[0]).getByLabelText(catalog.colSelect);
    fireEvent.click(firstRowCheckbox);

    expect(
      (screen.getByRole("button", { name: new RegExp(catalog.bulkEnableSelected) }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await invokeBulk(new RegExp(catalog.bulkDisableSelected));
    expect(bulkBlacklist).toHaveBeenCalledTimes(1);
    let formData = bulkBlacklist.mock.calls[0][0] as FormData;
    expect(formData.get("ids")).toBe("g1");
    expect(formData.get("blacklisted")).toBe("true");

    // now select the blacklisted Silent Hill 2 in addition
    bulkBlacklist.mockClear();
    fireEvent.click(within(dataRows()[1]).getByLabelText(catalog.colSelect));
    await invokeBulk(new RegExp(catalog.bulkEnableSelected));
    formData = bulkBlacklist.mock.calls[0][0] as FormData;
    expect(formData.get("ids")).toBe("g2");
    expect(formData.get("blacklisted")).toBe("false");
  });

  it("toggles a row's blacklist flag and deletes a single row through their forms", async () => {
    renderManager();

    // active row offers "Blacklist" -> blacklisted=true
    await act(async () => {
      fireEvent.click(within(dataRows()[0]).getByRole("button", { name: catalog.blockButton }));
    });
    let formData = toggleBlacklist.mock.calls[0][0] as FormData;
    expect(formData.get("gameId")).toBe("g1");
    expect(formData.get("blacklisted")).toBe("true");

    // blacklisted row offers "Unblock" -> blacklisted=false
    await act(async () => {
      fireEvent.click(within(dataRows()[1]).getByRole("button", { name: catalog.unblockButton }));
    });
    formData = toggleBlacklist.mock.calls[1][0] as FormData;
    expect(formData.get("gameId")).toBe("g2");
    expect(formData.get("blacklisted")).toBe("false");

    await act(async () => {
      fireEvent.click(within(dataRows()[0]).getByLabelText(catalog.deleteButton));
    });
    expect(deleteGame).toHaveBeenCalledTimes(1);
    expect((deleteGame.mock.calls[0][0] as FormData).get("gameId")).toBe("g1");
  });

  it("opens the add-game modal, submits its fields, and renders a server error", async () => {
    addGame.mockResolvedValue({ error: "Title already exists" });
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: /Add game/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(catalog.addHeading);

    fireEvent.change(within(dialog).getByPlaceholderText("Elden Ring"), {
      target: { value: "Hollow Knight" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("pc / playstation5…"), {
      target: { value: "pc" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("rpg, action"), {
      target: { value: "metroidvania, action" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("85"), { target: { value: "90" } });

    await act(async () => {
      fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    });

    expect(addGame).toHaveBeenCalledTimes(1);
    const formData = addGame.mock.calls[0][1] as FormData;
    expect(formData.get("title")).toBe("Hollow Knight");
    expect(formData.get("platform")).toBe("pc");
    expect(formData.get("genres")).toBe("metroidvania, action");
    expect(formData.get("metacritic")).toBe("90");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Title already exists");
  });

  it("opens the details modal for a row", () => {
    renderManager();

    fireEvent.click(within(dataRows()[0]).getByRole("button", { name: t.core.gameInfo.details }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Elden Ring")).not.toBeNull();
    expect(dialog.textContent).toContain("A vast open world.");
  });

  it("warns when the search modal has no configured providers", () => {
    renderManager({ availableProviders: [] });

    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    const dialog = screen.getByRole("dialog");

    expect(dialog.textContent).toContain(catalog.noProvidersTitle);
    expect(dialog.textContent).toContain(catalog.noProvidersHint);
    expect(within(dialog).getByRole("link", { name: catalog.goToSettings })).not.toBeNull();
  });

  it("searches the external provider and imports a result with its metadata", async () => {
    searchExternal.mockResolvedValue({
      results: [
        {
          title: "Hollow Knight",
          genres: ["metroidvania", "action"],
          coverUrl: "https://img/hk.jpg",
          platform: "pc",
          externalId: "367520",
          provider: "rawg",
          metacritic: 90,
          rating: 4.5,
          description: "Hand-drawn action adventure.",
          playtimeHours: 40,
          stores: [{ store: "steam", url: "https://store.steampowered.com/app/367520" }],
          website: "https://hollowknight.com",
        },
      ],
    });
    renderManager({ availableProviders: providers });

    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(catalog.searchHeading);

    fireEvent.change(within(dialog).getByPlaceholderText("horror survival"), {
      target: { value: "hollow" },
    });
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    });

    const searchForm = searchExternal.mock.calls[0][1] as FormData;
    expect(searchForm.get("provider")).toBe("rawg");
    expect(searchForm.get("query")).toBe("hollow");
    expect(searchForm.get("ordering")).toBe("-metacritic");

    expect(await within(dialog).findByText("Hollow Knight")).not.toBeNull();
    expect(dialog.textContent).toContain("Results · 1");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(catalog.importButton) }));
    });

    expect(importDirect).toHaveBeenCalledTimes(1);
    const importForm = importDirect.mock.calls[0][0] as FormData;
    expect(importForm.get("title")).toBe("Hollow Knight");
    expect(importForm.get("genres")).toBe("metroidvania,action");
    expect(importForm.get("coverUrl")).toBe("https://img/hk.jpg");
    expect(importForm.get("metacritic")).toBe("90");
    expect(importForm.get("playtimeHours")).toBe("40");
    expect(importForm.get("stores")).toBe('[{"store":"steam","url":"https://store.steampowered.com/app/367520"}]');
  });

  it("resolves a store URL into an editable preview and imports it", async () => {
    resolveUrl.mockResolvedValue({
      game: {
        title: "Hollow Knight",
        coverUrl: null,
        description: "Hand-drawn action adventure.",
        platform: "steam",
        genres: ["metroidvania"],
        tags: ["indie"],
        metacritic: 90,
        rating: 4.5,
        website: "https://hollowknight.com",
        stores: [{ store: "steam", url: "https://store.steampowered.com/app/367520" }],
        detectedProvider: "steam",
        sourceUrl: "https://store.steampowered.com/app/367520",
        externalId: "367520",
      },
    });
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: /By link/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(catalog.byLinkHeading);

    fireEvent.change(within(dialog).getByPlaceholderText(catalog.urlPlaceholder), {
      target: { value: "https://store.steampowered.com/app/367520" },
    });
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    });

    const resolveForm = resolveUrl.mock.calls[0][1] as FormData;
    expect(resolveForm.get("url")).toBe("https://store.steampowered.com/app/367520");

    expect(await within(dialog).findByText("Hollow Knight")).not.toBeNull();
    expect(dialog.textContent).toContain(`${catalog.detected}: steam`);

    const forms = dialog.querySelectorAll("form");
    const importForm = forms[forms.length - 1] as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(importForm);
    });

    expect(importFromUrl).toHaveBeenCalledTimes(1);
    const submitted = importFromUrl.mock.calls[0][1] as FormData;
    expect(submitted.get("title")).toBe("Hollow Knight");
    expect(submitted.get("sourceUrl")).toBe("https://store.steampowered.com/app/367520");
    expect(submitted.get("detectedProvider")).toBe("steam");
  });
});
