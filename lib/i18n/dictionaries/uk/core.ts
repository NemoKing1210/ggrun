import type * as CoreEn from "../en/core";
import type { Widen } from "@/lib/i18n/widen";

/** Shared UI elements. */
export const common: Widen<typeof CoreEn.common> = {
  appName: "GGRun",
  loading: "Завантаження…",
  working: "Працюємо…",
  save: "Зберегти",
  add: "Додати",
  create: "Створити",
  delete: "Видалити",
  apply: "Застосувати",
  position: "Позиція",
  balance: "Баланс",
  status: "Статус",
  player: "Гравець",
  title: "Назва",
  type: "Тип",
  label: "Назва",
  actions: "Дії",
  reason: "Причина",
  seasonKicker: "сезон «{season}»",
  notFound: "Не знайдено",
};

/** Header navigation. */
export const nav: Widen<typeof CoreEn.nav> = {
  home: "Головна",
  board: "Поле",
  leaderboard: "Таблиця лідерів",
  feed: "Стрічка",
  rules: "Правила",
  seasons: "Сезони",
  admin: "Адмінка",
  login: "Увійти",
  logout: "Вийти",
  language: "Мова",
  menu: "Меню",
};

export const footer: Widen<typeof CoreEn.footer> = {
  tagline: "GGRun · сезонний ігровий забіг",
  metaTitle: "GGRun — сезонний ігровий забіг",
  metaDescription: "Платформа командного ігрового івенту: сезони, поле, кубики, таблиця лідерів",
};

/** Login and registration. */
export const auth: Widen<typeof CoreEn.auth> = {
  loginTitle: "Вхід",
  loginIdentifier: "Email або нік",
  password: "Пароль",
  passwordHint: "Пароль (мін. 8 символів)",
  signIn: "Увійти",
  signingIn: "Входимо…",
  registerTitle: "Реєстрація",
  email: "Email",
  displayName: "Псевдонім для показу",
  createAccount: "Створити акаунт",
  creating: "Створюємо…",
  noAccount: "Немає акаунта?",
  goToRegister: "Реєстрація",
  haveAccount: "Вже є акаунт?",
  goToLogin: "Вхід",
  devQuick: "Швидкий вхід (dev)",
  devAsAdmin: "Увійти як адмін",
  devAsPlayer: "Увійти як гравець",
};

/** Player dashboard (/dashboard). */
export const dashboard: Widen<typeof CoreEn.dashboard> = {
  heading: "Штаб гравця",
  seasonLine: "{season} · {player}",
  statsAria: "Показники учасника",
  statPosition: "Позиція",
  statBalance: "Баланс",
  statStreakPass: "Серія проходжень",
  statStreakDrop: "Серія дропів",
  statRerolls: "Реролів використано",
  statProgress: "Прогрес",
  currentGame: "Поточна гра",
  noCurrentGame: "Немає активної гри — зробіть ролл.",
  rolledAt: "Випала {time} тому",
  rollButton: "Ролл гри",
  rolling: "Ролимо…",
  rollHint: "Сервер випадково обирає гру з каталогу.",
  history: "Історія ходів",
  historyEmpty: "Ходів ще немає — зробіть перший ролл.",
  noActiveSeason: "Наразі немає активного сезону.",
  notInSeason: "Ви не берете участі в поточному сезоні.",
  lastRoll: "Останній кидок",
  diceResult: "Результат кубика: {values}",
  diceRolling: "Кидок кубика",
  moveCell: "клітинка",
  moveFormat: "{from} → {to}",
  coverAlt: "Обкладинка: {title}",
  markPassedConfirm: "Позначити гру пройденою?",
  dropConfirm: "Дропнути гру? Серія дропів зростає.",
  rerollConfirm: "Запросити рерол? Адмін має підтвердити.",
  rerollButton: "Рерол",
  rerollLockedTitle: "Ліміт реролів вичерпано",
  rerollPending: "Рерол на розгляді",
  rerollPendingHint: "Запит очікує перевірки адміном.",
  passedButton: "Пройдено",
  dropButton: "Дроп",
  missingCatalogEntry: "Гра випала, але запис у каталозі недоступний.",
  dropModalTitle: "Дроп гри",
  dropReasonLabel: "Чому дропаєте?",
  dropReasonPlaceholder: "Занадто гріндова, поганий порт, не мій жанр…",
  passModalTitle: "Відзначити проходження",
  passCommentLabel: "Коментар (необов'язково)",
  passCommentPlaceholder: "Короткий відгук — що сподобалося…",
  ratingLabel: "Оцінка 1-10 (необов'язково)",
  ratingPlaceholder: "7",
  rerollModalTitle: "Запит реролу",
  rerollReasonLabel: "Чому потрібен рерол?",
  rerollReasonPlaceholder: "Гра вже пройдена, технічні проблеми тощо.",
  submit: "Надіслати",
  cancel: "Скасувати",
  close: "Закрити",
  boardProgressTitle: "Прогрес на полі",
  awaitingModeration: "На модерації",
  statsTitle: "Ваш забіг",
};

/** Season and participant statuses. */
export const seasonStatuses = {
  draft: "Чернетка",
  active: "Триває",
  paused: "Пауза",
  finished: "Завершено",
  archived: "Архів",
} as const;

export const playerStatuses = {
  active: "У грі",
  finished: "Фініш",
  eliminated: "Вибув",
  withdrawn: "Знявся",
} as const;

/** Board cell type names. */
export const cellTypes: Widen<typeof CoreEn.cellTypes> = {
  start: "Старт",
  finish: "Фініш",
  normal: "Звичайна",
  penalty: "Штраф",
  bonus: "Бонус",
  event: "Подія",
  teleport: "Телепорт",
  custom: "Особлива",
};

/** Breadcrumbs — shown on every page. */
export const breadcrumbs: Widen<typeof CoreEn.breadcrumbs> = {
  ariaLabel: "Хлібні крихти",
  dashboard: "Штаб гравця",
  players: "Гравці",
};

/** Server use-case error texts (keys are error codes). */
export const errors: Widen<typeof CoreEn.errors> = {
  gameNotAllowed: "Недостатньо прав для цієї дії",
  gameParticipantNotFound: "Учасника не знайдено",
  gameSeasonNotActive: "Сезон не активний",
  gameSeasonNotFound: "Сезон не знайдено",
  gameAlreadyHaveRoll: "У вас уже є нароллена гра",
  gameRollNotFound: "Рол не знайдено",
  gameRollAlreadyResolved: "Рол уже вирішено",
  gameRerollLimit: "Ліміт реролів вичерпано",
  gameRerollLimitForGame: "Ліміт реролів для цієї гри вичерпано",
  gameRerollPending: "Запит на рерол уже на розгляді",
  gameRerollRequestNotFound: "Запит на рерол не знайдено",
  gameLoginRequired: "Потрібен вхід",
  formReasonRequired: "Вкажіть причину (мінімум 5 символів)",
  formRatingInvalid: "Оцінка має бути цілим числом від 1 до 10",

  adminStaffRequired: "Потрібні права staff",
  adminSeasonNotFound: "Сезон не знайдено",
  adminInvalidTransition: "Неприпустимий перехід {from} → {to}",
  adminPlayerNotFound: "Учасника не знайдено",
  adminSelfBlock: "Не можна блокувати самого себе",
  adminSelfDemote: "Не можна розжалувати самого себе",
  adminSelfDelete: "Не можна видаляти самого себе",

  authInvalidEmail: "Некоректний email",
  authPasswordTooShort: "Пароль має бути не коротшим за 8 символів",
  authUserExists: "Користувач уже існує",
  authUsernameFailed: "Не вдалося підібрати унікальний username",
  authInvalidCredentials: "Невірний логін або пароль",
  authBlocked: "Цей акаунт заблоковано",

  formLoginRequired: "Вкажіть логін",
  formPasswordRequired: "Вкажіть пароль",
  formSlugFormat: "slug: малі латинські літери, цифри, дефіс",
  formConfigInvalidJson: "config — некоректний JSON",
  formTitleRequired: "Вкажіть назву гри",
  formUnknown: "Невідома помилка",
};
