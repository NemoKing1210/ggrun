import type * as AdminEn from "../en/admin";
import type { Widen } from "@/lib/i18n/widen";

/**
 * Адмін-панель: огляд, створення сезону, налаштування, редактор поля,
 * керування гравцями, каталог ігор, журнал аудиту.
 */
export const admin: Widen<typeof AdminEn.admin> = {
  /** /admin */
  overview: {
    heading: "Адмінка",
    newSeason: "Новий сезон",
    seasons: "Сезони",
    empty: "Сезонів ще немає.",
    colTitle: "Назва",
    colSlug: "Slug",
    colStatus: "Статус",
    colActions: "Дії",
    colSections: "Розділи",
    linkSettings: "Налаштування",
    linkBoard: "Поле",
    linkPlayers: "Гравці",
    catalogLink: "Каталог ігор →",
    auditLink: "Журнал аудиту →",
  },

  /** Форма создания сезона на /admin. */
  createSeason: {
    titleLabel: "Назва",
    titlePlaceholder: "Забіг #1",
    slugLabel: "Slug",
    cloneLabel: "Клонувати поле з сезону",
    noCloneOption: "— не клонувати (поле за замовчуванням) —",
  },

  /** Настройки сезона (/admin/seasons/[id]). */
  settings: {
    heading: "Налаштування · {season}",
    configHeading: "Конфіг правил (JSON) і текст правил",
    configLabel: "season.config (валідація за Zod-схемою SeasonConfigSchema)",
    rulesLabel: "Правила сезону (Markdown)",
    rulesPlaceholder: "# Правила\nТекст для сторінки /rules...",
  },

  /** Редактор поля (/admin/seasons/[id]/board). */
  boardEditor: {
   saveCell: "Зберегти клітинку",
    heading: "Поле · {season}",
    hint: "Клітинки редагуються за позицією. Для penalty/bonus вкажіть amount (очки), teleport не підтримується у цій формі — редагуйте config напряму.",
    noBoard: "У сезону немає поля.",
    formHeading: "Нова / змінена клітинка",
    positionLabel: "Позиція",
    typeLabel: "Тип",
    labelPlaceholder: "Штрафний сектор",
    amountLabel: "Amount (penalty/bonus)",
    colPosition: "#",
    colType: "Тип",
    colName: "Назва",
    colConfig: "Config",
  },

  /** Управление игроками (/admin/seasons/[id]/players). */
  players: {
    heading: "Гравці · {season}",
    addHeading: "Додати учасника",
    userLabel: "Користувач",
    pickUserOption: "— оберіть —",
    statsFormat: "поз. {position} · бал. {balance}",
    metaFormat: "стріки +{pass}/-{drop} · рероли {rerolls} · {status}",
    keepStatusOption: "— не змінювати —",
    reasonLabel: "Причина (обов'язково, потрапляє в аудит і стрічку)",
    reasonPlaceholder: "Ручне коригування суддею",
  },

  /** Каталог игр (/admin/games-catalog). */
  catalog: {
    heading: "Каталог ігор",
    addHeading: "Додати гру вручну",
    titleLabel: "Назва *",
    platformLabel: "Платформа",
    coverLabel: "Обкладинка (URL)",
    genresLabel: "Жанри (через кому)",
    poolHeading: "Пул ігор ({count})",
    colTitle: "Назва",
    colPlatform: "Платформа",
    colGenres: "Жанри",
    colStatus: "Статус",
    colActions: "Дії",
    blacklisted: "блеклист",
    active: "активна",
    unblockButton: "Розблокувати",
    blockButton: "У блеклист",
  },

  /** Аудит-лог (/admin/audit). */
  audit: {
    heading: "Журнал аудиту",
    colTime: "Час",
    colWho: "Хто",
    colAction: "Дія",
    colTarget: "Ціль",
    colPayload: "Payload",
  },
};
