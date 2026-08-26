import type * as AdminEn from "../en/admin";
import type { Widen } from "@/lib/i18n/widen";

/**
 * Админ-панель: обзор, создание сезона, настройки, редактор поля,
 * управление игроками, каталог игр, аудит-лог.
 */
export const admin: Widen<typeof AdminEn.admin> = {
  /** Навигация админской шапки. */
  nav: {
    console: "Консоль администратора",
    dashboard: "Дашборд",
    seasons: "Сезоны",
    users: "Пользователи",
    catalog: "Каталог игр",
    audit: "Аудит-лог",
    backToSite: "← На сайт",
  },

  /** Дашборд /admin. */
  dashboard: {
    heading: "Обзор",
    statUsers: "Пользователи",
    statSeasons: "Сезоны",
    statGames: "Игр в каталоге",
    statRolls: "Роллов игр",
    statMoves: "Ходов",
    statEvents: "Событий в ленте",
    activeSeason: "Активный сезон",
    noActiveSeason: "Сейчас активного сезона нет.",
    quickLinksHeading: "Быстрые действия",
  },

  /** Управление пользователями /admin/users (только admin). */
  users: {
    heading: "Пользователи",
    searchPlaceholder: "Поиск по email, username или имени…",
    empty: "Под запрос нет пользователей.",
    colUser: "Пользователь",
    colEmail: "Email",
    colRole: "Роль",
    colStatus: "Статус",
    colActions: "Действия",
    activeUser: "активен",
    blocked: "заблокирован",
    you: "вы",
    addHeading: "Добавить пользователя",
    emailLabel: "Email",
    usernameLabel: "Username",
    passwordLabel: "Пароль (мин. 8 символов)",
    roleLabel: "Роль",
    roles: {
      admin: "Админ",
      judge: "Судья",
      player: "Игрок",
      viewer: "Зритель",
    },
    blockButton: "Заблокировать",
    unblockButton: "Разблокировать",
    blockConfirm: "Заблокировать {user}? Доступ пропадёт мгновенно.",
    deleteButton: "Удалить",
    deleteConfirm: "Удалить {user}? Его роллы и участие в сезонах будут удалены.",
    saved: "Сохранено",
    userAdded: "Пользователь создан",
    userDeleted: "Пользователь удалён",
  },

  /** /admin */
  overview: {
    heading: "Админка",
    newSeason: "Новый сезон",
    seasons: "Сезоны",
    empty: "Сезонов пока нет.",
    colTitle: "Название",
    colSlug: "Slug",
    colStatus: "Статус",
    colActions: "Действия",
    colSections: "Разделы",
    linkSettings: "Настройки",
    linkBoard: "Поле",
    linkPlayers: "Игроки",
    catalogLink: "Каталог игр →",
    auditLink: "Аудит-лог →",
  },

  /** Форма создания сезона на /admin. */
  createSeason: {
    titleLabel: "Название",
    titlePlaceholder: "Забег #1",
    slugLabel: "Slug",
    cloneLabel: "Клонировать поле из сезона",
    noCloneOption: "— не клонировать (поле по умолчанию) —",
  },

  /** Настройки сезона (/admin/seasons/[id]). */
  settings: {
    heading: "Настройки · {season}",
    configHeading: "Конфиг правил (JSON) и текст правил",
    configLabel: "season.config (валидация по Zod-схеме SeasonConfigSchema)",
    rulesLabel: "Правила сезона (Markdown)",
    rulesPlaceholder: "# Правила\nТекст для страницы /rules...",
  },

  /** Редактор поля (/admin/seasons/[id]/board). */
  boardEditor: {
   saveCell: "Сохранить клетку",
    heading: "Поле · {season}",
    hint: "Клетки редактируются по позиции. Для penalty/bonus укажите amount (очки), для teleport — не поддерживается в этой форме, используйте config напрямую.",
    noBoard: "У сезона нет поля.",
    formHeading: "Новая / изменённая клетка",
    positionLabel: "Позиция",
    typeLabel: "Тип",
    labelPlaceholder: "Штрафной сектор",
    amountLabel: "Amount (penalty/bonus)",
    colPosition: "#",
    colType: "Тип",
    colName: "Название",
    colConfig: "Config",
  },

  /** Управление игроками (/admin/seasons/[id]/players). */
  players: {
    heading: "Игроки · {season}",
    addHeading: "Добавить участника",
    userLabel: "Пользователь",
    pickUserOption: "— выберите —",
    statsFormat: "поз. {position} · бал. {balance}",
    metaFormat: "стрики +{pass}/-{drop} · рероллы {rerolls} · {status}",
    keepStatusOption: "— не менять —",
    reasonLabel: "Причина (обязательно, попадает в аудит и ленту)",
    reasonPlaceholder: "Ручная корректировка судьи",
  },

  /** Каталог игр (/admin/games-catalog). */
  catalog: {
    heading: "Каталог игр",
    addHeading: "Добавить игру вручную",
    titleLabel: "Название *",
    platformLabel: "Платформа",
    coverLabel: "Обложка (URL)",
    genresLabel: "Жанры (через запятую)",
    poolHeading: "Пул игр ({count})",
    colTitle: "Название",
    colPlatform: "Платформа",
    colGenres: "Жанры",
    colStatus: "Статус",
    colActions: "Действия",
    blacklisted: "блэклист",
    active: "активна",
    unblockButton: "Разблокировать",
    blockButton: "В блэклист",
  },

  /** Аудит-лог (/admin/audit). */
  audit: {
    heading: "Аудит-лог",
    colTime: "Время",
    colWho: "Кто",
    colAction: "Действие",
    colTarget: "Цель",
    colPayload: "Payload",
  },
};
