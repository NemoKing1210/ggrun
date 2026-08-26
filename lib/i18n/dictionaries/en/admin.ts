/**
 * Админ-панель: обзор, создание сезона, настройки, редактор поля,
 * управление игроками, каталог игр, аудит-лог.
 */
export const admin = {
  /** Навигация админской шапки. */
  nav: {
    console: "Admin console",
    dashboard: "Dashboard",
    seasons: "Seasons",
    users: "Users",
    catalog: "Games catalog",
    audit: "Audit log",
    backToSite: "← Site",
  },

  /** Дашборд /admin. */
  dashboard: {
    heading: "Overview",
    statUsers: "Users",
    statSeasons: "Seasons",
    statGames: "Games in catalog",
    statRolls: "Game rolls",
    statMoves: "Moves",
    statEvents: "Feed events",
    activeSeason: "Active season",
    noActiveSeason: "No active season right now.",
    quickLinksHeading: "Quick actions",
  },

  /** Управление пользователями /admin/users (только admin). */
  users: {
    heading: "Users",
    searchPlaceholder: "Search by email, username or name…",
    empty: "No users match the query.",
    colUser: "User",
    colEmail: "Email",
    colRole: "Role",
    colStatus: "Status",
    colActions: "Actions",
    activeUser: "active",
    blocked: "blocked",
    you: "you",
    addHeading: "Add user",
    emailLabel: "Email",
    usernameLabel: "Username",
    passwordLabel: "Password (min. 8 characters)",
    roleLabel: "Role",
    roles: {
      admin: "Admin",
      judge: "Judge",
      player: "Player",
      viewer: "Viewer",
    },
    blockButton: "Block",
    unblockButton: "Unblock",
    blockConfirm: "Block {user}? They will lose access immediately.",
    deleteButton: "Delete",
    deleteConfirm: "Delete {user}? Their rolls and season participation will be removed.",
    saved: "Saved",
    userAdded: "User created",
    userDeleted: "User deleted",
  },

  /** /admin */
  overview: {
    heading: "Admin panel",
    newSeason: "New season",
    seasons: "Seasons",
    empty: "No seasons yet.",
    colTitle: "Title",
    colSlug: "Slug",
    colStatus: "Status",
    colActions: "Actions",
    colSections: "Sections",
    linkSettings: "Settings",
    linkBoard: "Board",
    linkPlayers: "Players",
    catalogLink: "Games catalog →",
    auditLink: "Audit log →",
  },

  /** Форма создания сезона на /admin. */
  createSeason: {
    titleLabel: "Title",
    titlePlaceholder: "Run #1",
    slugLabel: "Slug",
    cloneLabel: "Clone board from season",
    noCloneOption: "— do not clone (default board) —",
  },

  /** Настройки сезона (/admin/seasons/[id]). */
  settings: {
    heading: "Settings · {season}",
    configHeading: "Rules config (JSON) and rules text",
    configLabel: "season.config (validated against the SeasonConfigSchema Zod schema)",
    rulesLabel: "Season rules (Markdown)",
    rulesPlaceholder: "# Rules\nText for the /rules page...",
  },

  /** Редактор поля (/admin/seasons/[id]/board). */
  boardEditor: {
   saveCell: "Save cell",
    heading: "Board · {season}",
    hint: "Cells are edited by position. For penalty/bonus set the amount (points); teleport is not supported in this form — edit config directly.",
    noBoard: "This season has no board.",
    formHeading: "New / edited cell",
    positionLabel: "Position",
    typeLabel: "Type",
    labelPlaceholder: "Penalty sector",
    amountLabel: "Amount (penalty/bonus)",
    colPosition: "#",
    colType: "Type",
    colName: "Name",
    colConfig: "Config",
  },

  /** Управление игроками (/admin/seasons/[id]/players). */
  players: {
    heading: "Players · {season}",
    addHeading: "Add participant",
    userLabel: "User",
    pickUserOption: "— select —",
    statsFormat: "pos. {position} · pts. {balance}",
    metaFormat: "streaks +{pass}/-{drop} · rerolls {rerolls} · {status}",
    keepStatusOption: "— keep unchanged —",
    reasonLabel: "Reason (required, goes to audit log and feed)",
    reasonPlaceholder: "Manual referee adjustment",
  },

  /** Каталог игр (/admin/games-catalog). */
  catalog: {
    heading: "Games catalog",
    addHeading: "Add a game manually",
    titleLabel: "Title *",
    platformLabel: "Platform",
    coverLabel: "Cover (URL)",
    genresLabel: "Genres (comma-separated)",
    poolHeading: "Game pool ({count})",
    colTitle: "Title",
    colPlatform: "Platform",
    colGenres: "Genres",
    colStatus: "Status",
    colActions: "Actions",
    blacklisted: "blacklisted",
    active: "active",
    unblockButton: "Unblock",
    blockButton: "Blacklist",
  },

  /** Аудит-лог (/admin/audit). */
  audit: {
    heading: "Audit log",
    colTime: "Time",
    colWho: "Who",
    colAction: "Action",
    colTarget: "Target",
    colPayload: "Payload",
  },
} as const;
