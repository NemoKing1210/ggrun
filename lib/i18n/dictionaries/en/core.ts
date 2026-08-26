/** Shared UI elements. */
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

/** Header navigation. */
export const nav = {
  home: "Home",
  board: "Board",
  leaderboard: "Leaderboard",
  feed: "Feed",
  rules: "Rules",
  seasons: "Seasons",
  admin: "Admin",
  login: "Log in",
  logout: "Log out",
  language: "Language",
  menu: "Menu",
} as const;

export const footer = {
  tagline: "GGRun · seasonal game run",
  metaTitle: "GGRun — seasonal game run",
  metaDescription: "Team gaming event platform: seasons, board, dice movement, leaderboard",
} as const;

/** Login and registration. */
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

/** Player dashboard (/dashboard). */
export const dashboard = {
  heading: "Player HQ",
  seasonLine: "{season} · {player}",
  statsAria: "Player stats",
  statPosition: "Position",
  statBalance: "Balance",
  statStreakPass: "Pass streak",
  statStreakDrop: "Drop streak",
  statRerolls: "Rerolls used",
  statProgress: "Progress",
  currentGame: "Current game",
  noCurrentGame: "No active roll — hit Roll to get a game.",
  rolledAt: "Rolled {time} ago",
  rollButton: "Roll a game",
  rolling: "Rolling…",
  rollHint: "The server picks a random game from the catalog.",
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
  rerollConfirm: "Request a reroll? An admin must approve it.",
  rerollButton: "Reroll",
  rerollLockedTitle: "Reroll limit reached",
  rerollPending: "Reroll pending approval",
  rerollPendingHint: "Your request is awaiting admin review.",
  passedButton: "Passed",
  dropButton: "Drop",
  missingCatalogEntry: "The game came up, but its catalog entry is unavailable.",
  dropModalTitle: "Drop game",
  dropReasonLabel: "Why are you dropping it?",
  dropReasonPlaceholder: "Too grindy, bad port, not my genre…",
  passModalTitle: "Mark as passed",
  passCommentLabel: "Comment (optional)",
  passCommentPlaceholder: "Short review — what you thought…",
  ratingLabel: "Rating 1-10 (optional)",
  ratingPlaceholder: "7",
  rerollModalTitle: "Request reroll",
  rerollReasonLabel: "Why do you want a reroll?",
  rerollReasonPlaceholder: "Game already played, technical issues, etc.",
  submit: "Submit",
  cancel: "Cancel",
  close: "Close",
  boardProgressTitle: "Board progress",
  awaitingModeration: "Awaiting moderation",
  statsTitle: "Your run",
} as const;
/** Season and participant statuses. */
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

/** Board cell type names. */
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

/** Breadcrumbs — shown on every page. */
export const breadcrumbs = {
  ariaLabel: "Breadcrumb",
  dashboard: "Dashboard",
  players: "Players",
} as const;

/**
 * Server use-case error texts.
 * Keys are error codes (GameLoopError/AdminError/AuthError throw a code;
 * server actions resolve the code into text in the session language).
 */
export const errors = {
  // --- game loop (GameLoopError) ---
  gameNotAllowed: "You are not allowed to perform this action",
  gameParticipantNotFound: "Participant not found",
  gameSeasonNotActive: "The season is not active",
  gameSeasonNotFound: "Season not found",
  gameAlreadyHaveRoll: "You already have a rolled game",
  gameRollNotFound: "Roll not found",
  gameRollAlreadyResolved: "The roll is already resolved",
  gameRerollLimit: "Reroll limit reached",
  gameRerollLimitForGame: "Reroll limit for this game is reached",
  gameRerollPending: "A reroll request is already pending for this game",
  gameRerollRequestNotFound: "Reroll request not found",
  gameLoginRequired: "Login required",
  formReasonRequired: "Please provide a reason (at least 5 characters)",
  formRatingInvalid: "Rating must be an integer from 1 to 10",

  // --- admin (AdminError) ---
  adminStaffRequired: "Staff permissions required",
  adminSeasonNotFound: "Season not found",
  adminInvalidTransition: "Invalid status transition {from} → {to}",
  adminPlayerNotFound: "Participant not found",
  adminSelfBlock: "You cannot block yourself",
  adminSelfDemote: "You cannot demote yourself",
  adminSelfDelete: "You cannot delete yourself",

  // --- authentication (AuthError) ---
  authInvalidEmail: "Invalid email",
  authPasswordTooShort: "Password must be at least 8 characters",
  authUserExists: "User already exists",
  authUsernameFailed: "Failed to generate a unique username",
  authInvalidCredentials: "Wrong login or password",
  authBlocked: "This account is blocked",

  // --- forms ---
  formLoginRequired: "Enter your login",
  formPasswordRequired: "Enter your password",
  formSlugFormat: "slug: lowercase latin letters, digits, hyphens",
  formConfigInvalidJson: "config — invalid JSON",
  formTitleRequired: "Enter the game title",
  formUnknown: "Unknown error",
} as const;
