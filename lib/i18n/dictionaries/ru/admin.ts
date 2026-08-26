import type * as AdminEn from "../en/admin";
import type { Widen } from "@/lib/i18n/widen";

/**
 * Admin panel: overview, season creation, settings, board editor,
 * player management, games catalog, audit log.
 */

export const admin: Widen<typeof AdminEn.admin> = {
  /** Успешные ответы форм. */
  feedback: {
    seasonCreated: "Сезон создан ({id})",
    statusChanged: "Статус изменён на {status}",
    settingsSaved: "Настройки сохранены",
    cellSaved: "Клетка {position} обновлена",
    playerAdded: "Участник добавлен",
    adjustmentApplied: "Корректировка применена",
    gameAdded: "Игра «{title}» добавлена",
  },
  /** Admin header navigation. */
  nav: {
    console: "Консоль администратора",
    dashboard: "Дашборд",
    seasons: "Сезоны",
    users: "Пользователи",
    catalog: "Каталог игр",
    audit: "Аудит-лог",
    rerolls: "Рероллы",
    backToSite: "← На сайт",
  },

  /** Dashboard /admin. */
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

  /** User management /admin/users (admin only). */
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

  /** Season creation form on /admin. */
  createSeason: {
    titleLabel: "Название",
    titlePlaceholder: "Забег #1",
    slugLabel: "Slug",
    cloneLabel: "Клонировать поле из сезона",
    noCloneOption: "— не клонировать (поле по умолчанию) —",
  },

  /** Season settings (/admin/seasons/[id]). */
  settings: {
    heading: "Настройки · {season}",
    configHeading: "Гибкие настройки сезона",
    configLabel: "season.config (валидация по Zod-схеме SeasonConfigSchema)",
    rulesLabel: "Правила сезона (Markdown)",
    rulesPlaceholder: "# Правила\nТекст для страницы /rules...",
    tabs: {
      templates: "Шаблоны",
      dice: "Кости и очки",
      board: "Поле",
      pool: "Пул игр",
    },
    templatesHint: "Выберите пресет — хорроры, стратегии, RPG… — или соберите фильтры вручную. Шаблоны предзаполняют жанры, теги и подсказки для поля.",
    diceHint: "Кости определяют шаг при прохождении/провале; множитель серии усиливает откат.",
    boardHint: "Размер поля, количество специальных клеток и распределение. Перегенерация при сохранении перезапишет клетки.",
    poolHint: "Откуда берутся игры и как фильтруются. Гибрид использует и каталог, и внешний API.",
    saveButton: "Сохранить настройки",
    clearTemplate: "Сбросить шаблон → вручную",
    regenerateWarning: "Удалит текущую раскладку клеток и сгенерирует новую.",
  },

  /** Board editor (/admin/seasons/[id]/board). */
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
    previewHeading: "Предпросмотр поля",
    configTarget: "Цель по конфигу",
    actualCounts: "Фактически",
  },

  /** Player management (/admin/seasons/[id]/players). */
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

  /** Games catalog (/admin/games-catalog). */
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
    searchHeading: "Поиск во внешнем API",
    importButton: "Импорт →",
    noResults: "Ничего не найдено.",
    filterPlaceholder: "Фильтр пула…",
    tagsLabel: "Теги",
    metacriticLabel: "Metacritic",
    ratingLabel: "Рейтинг",
  },
  /** Audit log (/admin/audit). */
  audit: {
    heading: "Аудит-лог",
    colTime: "Время",
    colWho: "Кто",
    colAction: "Действие",
    colTarget: "Цель",
    colPayload: "Payload",
  },

  /** Reroll requests (/admin/rerolls). */
  rerolls: {
    heading: "Запросы на реролл",
    empty: "Нет ожидающих запросов.",
    colPlayer: "Игрок",
    colGame: "Игра",
    colReason: "Причина",
    colRequested: "Запрошено",
    approve: "Одобрить",
    reject: "Отклонить",
    approveConfirm: "Одобрить реролл для {player}? Будет нароллена новая игра.",
    rejectPlaceholder: "Причина отклонения…",
    approved: "Одобрено",
    rejected: "Отклонено",
  },
};
