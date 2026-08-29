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
  cancel: "Cancel",
  confirm: "Confirm",
  confirmTitle: "Confirm action",
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
  githubLabel: "GitHub — NemoKing1210/ggrun",
} as const;

/** Header navigation. */
export const nav = {
  home: "Home",
  dashboard: "Dashboard",
  board: "Board",
  leaderboard: "Leaderboard",
  feed: "Feed",
  rules: "Rules",
  seasons: "Seasons",
  admin: "Admin",
  login: "Log in",
  logout: "Log out",
  logoutConfirm: "Log out? You'll need to sign in again.",
  settings: "Settings",
  language: "Language",
  menu: "Menu",
} as const;

export const footer = {
  tagline: "GGRun · seasonal game run",
  metaTitle: "GGRun — seasonal game run",
  metaDescription: "Team gaming event platform: seasons, board, dice movement, leaderboard",
  aboutTitle: "About the run",
  aboutText:
    "Seasonal gaming event: roll games, move across the board, climb the leaderboard.",
  navTitle: "Navigation",
  linksTitle: "Links",
  rights: "© {year} GGRun. All rights reserved.",
  version: "v{version}",
  admin: "Admin console",
} as const;

/** Maintenance banner. */
export const maintenance = {
  title: "Maintenance",
  text: "Site is in maintenance mode — login is restricted to admins",
} as const;

/** Login and registration. */
export const auth = {
  loginTitle: "Log in",
  loginSubtitle: "Access your tactical console",
  loginIdentifier: "Email or nickname",
  password: "Password",
  passwordHint: "Password (min. 8 characters)",
  signIn: "Log in",
  signingIn: "Signing in…",
  registerTitle: "Sign up",
  registerSubtitle: "Create account and join the run",
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
  loginPlaceholder: "player / email",
  loginMetaTitle: "Log in — GGRun",
  registerMetaTitle: "Sign up — GGRun",
  registrationClosed: "Registration closed",
  registrationClosedHint: "An invite link can still be used to sign up.",
  verificationLinkDev: "Verification link (dev)",
  openVerificationLink: "Open verification link",
  heroBadge: "TACTICAL CONSOLE",
  heroTitleLogin: "Welcome back, Operator",
  heroTextLogin: "Track progress, roll games, move across the board and climb the leaderboard. Your run continues.",
  heroTitleRegister: "Join the run",
  heroTextRegister: "One account for all seasons — roll games, earn moves, become the legend of the board.",
  benefitTrack: "Track progress",
  benefitTrackHint: "Position, balance and streaks in real time",
  benefitRoll: "Roll & play",
  benefitRollHint: "Random game from the pool on every roll",
  benefitClimb: "Climb the ranks",
  benefitClimbHint: "Leaderboard and feed for every season",
  step1: "Create account",
  step2: "Roll a game",
  step3: "Play & report",
  secureNote: "Your credentials are stored securely with scrypt hashing. No plain passwords.",
  inviteBadge: "Invite link active",
  inviteHint: "Registration bypass enabled — you can sign up even when closed",
  passwordShow: "Show",
  passwordHide: "Hide",
  orDivider: "or",
  alreadyVerifiedHint: "Already verified? Go to login",
} as const;

/** Player dashboard (/dashboard). */
export const dashboard = {
  heading: "Player HQ",
  metaTitle: "Dashboard — GGRun",
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
  youHere: "YOU",
  games: "Games",
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

/** Shared game info labels (dashboard roll card, catalog, details modal). */
export const gameInfo = {
  details: "Details",
  metaLabel: "MC",
  playtime: "≈ {hours} h",
  close: "Close",
  noDescription: "No description provided by the source yet.",
  expand: "Show full description",
  collapse: "Show less",
  stores: "Store links",
  website: "Official website",
  storesHint: "Store buttons are direct provider links or search pages in the store front",
  year: "{year}",
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
  gameCompletionPending: "A completion is already pending approval for this game",
  gameCompletionRequestNotFound: "Completion request not found",
  gameLoginRequired: "Login required",
  catalogEmpty: "No games available in the catalog. Add games or check your filters.",
  formReasonRequired: "Please provide a reason (at least 5 characters)",
  formRatingInvalid: "Rating must be an integer from 1 to 10",

  // --- admin (AdminError) ---
  adminStaffRequired: "Staff permissions required",
  adminSeasonNotFound: "Season not found",
  adminInvalidTransition: "Invalid status transition {from} → {to}",
  adminActiveSeasonExists: "Another run “{title}” is already active. Only one season can run at a time — finish or archive it first.",
  proxyUrlInvalid: "Proxy URL must start with http:// or https://",
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
  authLoginRequired: "Please log in",
  authRegistrationDisabled: "Registration is currently disabled",
  authMaintenance: "Site is in maintenance mode — only admins can log in",
  authPendingApproval: "Your account is pending admin approval",
  authEmailNotVerified: "Please verify your email — check your inbox for the link",
  authInviteInvalid: "Invite link is invalid or expired",
  authEmailVerified: "Email verified — you can now log in",
  authVerificationExpired: "Verification link expired",
  registrationPendingApproval: "Account created — awaiting admin approval",
  registrationCheckEmail: "Account created — check your email for the verification link",

  // --- forms ---
  formLoginRequired: "Enter your login",
  formPasswordRequired: "Enter your password",
  formSlugFormat: "slug: lowercase latin letters, digits, hyphens",
  formConfigInvalidJson: "config — invalid JSON",
  formTitleRequired: "Enter the game title",
  formInvalid: "Some fields are invalid",
  formUnknown: "Unknown error",
} as const;

/** Full-screen "site temporarily unavailable" state (DB unreachable). */
export const siteUnavailable = {
  kicker: "connection lost",
  title: "Site temporarily unavailable",
  text: "We cannot reach the game database right now. Please try again in a few minutes.",
  retry: "Retry",
} as const;

/** Email verification (/verify-email). */
export const verification = {
  metaTitle: "Verify email — GGRun",
  missingTokenTitle: "Missing token",
  missingTokenText: "No verification token provided.",
  invalidLinkTitle: "Invalid link",
  invalidLinkText: "This verification link is invalid or already used.",
  linkExpiredTitle: "Link expired",
  linkExpiredText: "This link has expired. Ask an admin to resend a new one.",
  verifiedBadge: "Verified",
  emailVerifiedTitle: "Email verified",
  emailVerifiedText: "Your account {username} is now active. You can log in.",
  goToLogin: "Go to login",
} as const;
