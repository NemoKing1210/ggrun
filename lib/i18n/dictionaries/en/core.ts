/** Общие элементы интерфейса. */
export const common = {
  appName: "GGRun",
  loading: "Loading…",
  working: "Working…",
  save: "Save",
  add: "Add",
  create: "Create",
  delete: "Delete",
  apply: "Apply",
  position: "Position",
  balance: "Balance",
  status: "Status",
  player: "Player",
  title: "Title",
  type: "Type",
  label: "Name",
  actions: "Actions",
  reason: "Reason",
  seasonKicker: "season “{season}”",
  notFound: "Not found",
} as const;

/** Навигация в шапке. */
export const nav = {
  home: "Home",
  board: "Board",
  leaderboard: "Leaderboard",
  feed: "Feed",
  rules: "Rules",
  admin: "Admin",
  login: "Log in",
  logout: "Log out",
  language: "Language",
} as const;

export const footer = {
  tagline: "GGRun · seasonal game run",
  metaTitle: "GGRun — seasonal game run",
  metaDescription: "Team gaming event platform: seasons, board, dice movement, leaderboard",
} as const;

/** Вход и регистрация. */
export const auth = {
  loginTitle: "Log in",
  loginIdentifier: "Email or nickname",
  password: "Password",
  passwordHint: "Password (min. 8 characters)",
  signIn: "Log in",
  signingIn: "Signing in…",
  registerTitle: "Sign up",
  email: "Email",
  displayName: "Display name",
  createAccount: "Create account",
  creating: "Creating…",
  noAccount: "No account?",
  goToRegister: "Sign up",
  haveAccount: "Already have an account?",
  goToLogin: "Log in",
  devQuick: "Quick sign-in (dev)",
  devAsAdmin: "Login as admin",
  devAsPlayer: "Login as player",
} as const;

/** Кабинет игрока (/dashboard). */
export const dashboard = {
  heading: "Player HQ",
  seasonLine: "{season} · {player}",
  statsAria: "Player stats",
  statPosition: "Position",
  statBalance: "Balance",
  statStreakPass: "Pass streak",
  statStreakDrop: "Drop streak",
  currentGame: "Current game",
  rollButton: "Roll a game",
  rolling: "Rolling…",
  history: "Move history",
  historyEmpty: "No moves yet — make your first roll.",
  noActiveSeason: "There is no active season right now.",
  notInSeason: "You are not in the current season.",
  lastRoll: "Last roll",
  diceResult: "Dice result: {values}",
  diceRolling: "Rolling the dice",
  moveCell: "cell",
  moveFormat: "{from} → {to}",
  coverAlt: "Cover: {title}",
  markPassedConfirm: "Mark the game as passed?",
  dropConfirm: "Drop the game? Your drop streak grows.",
  rerollConfirm: "Reroll the game? A different one will come up.",
  rerollButton: "Reroll",
  rerollLockedTitle: "Reroll limit reached",
  passedButton: "Passed",
  dropButton: "Drop",
  missingCatalogEntry: "The game came up, but its catalog entry is unavailable.",
} as const;

/** Статусы сезона и участника. */
export const seasonStatuses = {
  draft: "Draft",
  active: "Running",
  paused: "Paused",
  finished: "Finished",
  archived: "Archived",
} as const;

export const playerStatuses = {
  active: "In game",
  finished: "Finished",
  eliminated: "Eliminated",
  withdrawn: "Withdrawn",
} as const;

/** Названия типов клеток поля. */
export const cellTypes = {
  start: "Start",
  finish: "Finish",
  normal: "Normal",
  penalty: "Penalty",
  bonus: "Bonus",
  event: "Event",
  teleport: "Teleport",
  custom: "Special",
} as const;

/**
 * Тексты ошибок серверных use-cases.
 * Ключи — коды ошибок (GameLoopError/AdminError/AuthError бросают код,
 * серверные экшены переводят код текстом на языке сессии).
 */
export const errors = {
  // --- игровой цикл (GameLoopError) ---
  gameNotAllowed: "You are not allowed to perform this action",
  gameParticipantNotFound: "Participant not found",
  gameSeasonNotActive: "The season is not active",
  gameSeasonNotFound: "Season not found",
  gameAlreadyHaveRoll: "You already have a rolled game",
  gameRollNotFound: "Roll not found",
  gameRollAlreadyResolved: "The roll is already resolved",
  gameRerollLimit: "Reroll limit reached",
  gameRerollLimitForGame: "Reroll limit for this game is reached",
  gameLoginRequired: "Login required",

  // --- админка (AdminError) ---
  adminStaffRequired: "Staff permissions required",
  adminSeasonNotFound: "Season not found",
  adminInvalidTransition: "Invalid status transition {from} → {to}",
  adminPlayerNotFound: "Participant not found",

  // --- аутентификация (AuthError) ---
  authInvalidEmail: "Invalid email",
  authPasswordTooShort: "Password must be at least 8 characters",
  authUserExists: "User already exists",
  authUsernameFailed: "Failed to generate a unique username",
  authInvalidCredentials: "Wrong login or password",

  // --- формы ---
  formLoginRequired: "Enter your login",
  formPasswordRequired: "Enter your password",
  formSlugFormat: "slug: lowercase latin letters, digits, hyphens",
  formConfigInvalidJson: "config — invalid JSON",
  formTitleRequired: "Enter the game title",
  formUnknown: "Unknown error",
} as const;
