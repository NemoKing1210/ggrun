import type { Locale } from "@/lib/i18n/config";
import type { Widen } from "@/lib/i18n/widen";

import * as coreEn from "./en/core";
import { landing as landingEn } from "./en/landing";
import { board as boardEn } from "./en/board";
import { feed as feedEn } from "./en/feed";
import { leaderboard as leaderboardEn } from "./en/leaderboard";
import { profile as profileEn } from "./en/profile";
import { rules as rulesEn } from "./en/rules";
import { admin as adminEn } from "./en/admin";
import { seasons as seasonsEn } from "./en/seasons";
import { settings as settingsEn } from "./en/settings";
import { chat as chatEn } from "./en/chat";
import * as coreRu from "./ru/core";
import { landing as landingRu } from "./ru/landing";
import { board as boardRu } from "./ru/board";
import { feed as feedRu } from "./ru/feed";
import { leaderboard as leaderboardRu } from "./ru/leaderboard";
import { profile as profileRu } from "./ru/profile";
import { rules as rulesRu } from "./ru/rules";
import { admin as adminRu } from "./ru/admin";
import { seasons as seasonsRu } from "./ru/seasons";
import { settings as settingsRu } from "./ru/settings";
import { chat as chatRu } from "./ru/chat";
import * as coreUk from "./uk/core";
import { landing as landingUk } from "./uk/landing";
import { board as boardUk } from "./uk/board";
import { feed as feedUk } from "./uk/feed";
import { leaderboard as leaderboardUk } from "./uk/leaderboard";
import { profile as profileUk } from "./uk/profile";
import { rules as rulesUk } from "./uk/rules";
import { admin as adminUk } from "./uk/admin";
import { seasons as seasonsUk } from "./uk/seasons";
import { settings as settingsUk } from "./uk/settings";
import { chat as chatUk } from "./uk/chat";

/** core exports several constants — assembled into a plain object for serialization to the client. */
function pickCore(core: Widen<typeof coreEn>) {
  return {
    common: core.common,
    nav: core.nav,
    footer: core.footer,
    auth: core.auth,
    dashboard: core.dashboard,
    cellTypes: core.cellTypes,
    seasonStatuses: core.seasonStatuses,
    playerStatuses: core.playerStatuses,
    breadcrumbs: core.breadcrumbs,
    gameInfo: core.gameInfo,
    errors: core.errors,
    siteUnavailable: core.siteUnavailable,
    maintenance: core.maintenance,
    verification: core.verification,
  };
}
const coreEnDict = pickCore(coreEn);
const coreRuDict = pickCore(coreRu);
const coreUkDict = pickCore(coreUk);

/**
 * Full dictionary. The type comes from the en version (source of truth):
 * the compiler requires ru/uk to implement the same keys.
 */
export type Dictionary = {
  core: Widen<typeof coreEn>;
  landing: Widen<typeof landingEn>;
  board: Widen<typeof boardEn>;
  feed: Widen<typeof feedEn>;
  leaderboard: Widen<typeof leaderboardEn>;
  profile: Widen<typeof profileEn>;
  rules: Widen<typeof rulesEn>;
  admin: Widen<typeof adminEn>;
  seasons: Widen<typeof seasonsEn>;
  settings: Widen<typeof settingsEn>;
  chat: Widen<typeof chatEn>;
};

const dictionaries: Record<Locale, Dictionary> = {
  en: {
    core: coreEnDict,
    landing: landingEn,
    board: boardEn,
    feed: feedEn,
    leaderboard: leaderboardEn,
    profile: profileEn,
    rules: rulesEn,
    admin: adminEn,
    seasons: seasonsEn,
    settings: settingsEn,
    chat: chatEn,
  },
  ru: {
    core: coreRuDict,
    landing: landingRu,
    board: boardRu,
    feed: feedRu,
    leaderboard: leaderboardRu,
    profile: profileRu,
    rules: rulesRu,
    admin: adminRu,
    seasons: seasonsRu,
    settings: settingsRu,
    chat: chatRu,
  },
  uk: {
    core: coreUkDict,
    landing: landingUk,
    board: boardUk,
    feed: feedUk,
    leaderboard: leaderboardUk,
    profile: profileUk,
    rules: rulesUk,
    admin: adminUk,
    seasons: seasonsUk,
    settings: settingsUk,
    chat: chatUk,
  },
};

/** Locale dictionary; falls back to en when a locale is missing. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}
