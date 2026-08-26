import type * as CoreEn from "../en/core";
import type { Widen } from "@/lib/i18n/widen";

/** Загальні елементи інтерфейсу. */
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

/** Навігація у шапці. */
export const nav: Widen<typeof CoreEn.nav> = {
  home: "Головна",
  board: "Поле",
  leaderboard: "Таблиця лідерів",
  feed: "Стрічка",
  rules: "Правила",
  admin: "Адмінка",
  login: "Увійти",
  logout: "Вийти",
  language: "Мова",
};

export const footer: Widen<typeof CoreEn.footer> = {
  tagline: "GGRun · сезонний ігровий забіг",
  metaTitle: "GGRun — сезонний ігровий забіг",
  metaDescription: "Платформа командного ігрового івенту: сезони, поле, кубики, таблиця лідерів",
};

/** Вхід і реєстрація. */
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

/** Кабінет гравця (/dashboard). */
export const dashboard: Widen<typeof CoreEn.dashboard> = {
  heading: "Штаб гравця",
  seasonLine: "{season} · {player}",
  statsAria: "Показники учасника",
  statPosition: "Позиція",
  statBalance: "Баланс",
  statStreakPass: "Серія проходжень",
  statStreakDrop: "Серія дропів",
  currentGame: "Поточна гра",
  rollButton: "Ролл гри",
  rolling: "Ролимо…",
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
  rerollConfirm: "Переролити гру? Випаде інша.",
  rerollButton: "Рерол",
  rerollLockedTitle: "Ліміт реролів вичерпано",
  passedButton: "Пройдено",
  dropButton: "Дроп",
  missingCatalogEntry: "Гра випала, але запис у каталозі недоступний.",
};

/** Статуси сезону та учасника. */
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

/** Названия типов клеток поля. */
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

/** Тексти помилок серверних use-cases (ключі — коди помилок). */
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
  gameLoginRequired: "Потрібен вхід",

  adminStaffRequired: "Потрібні права staff",
  adminSeasonNotFound: "Сезон не знайдено",
  adminInvalidTransition: "Неприпустимий перехід {from} → {to}",
  adminPlayerNotFound: "Учасника не знайдено",

  authInvalidEmail: "Некоректний email",
  authPasswordTooShort: "Пароль має бути не коротшим за 8 символів",
  authUserExists: "Користувач уже існує",
  authUsernameFailed: "Не вдалося підібрати унікальний username",
  authInvalidCredentials: "Невірний логін або пароль",

  formLoginRequired: "Вкажіть логін",
  formPasswordRequired: "Вкажіть пароль",
  formSlugFormat: "slug: малі латинські літери, цифри, дефіс",
  formConfigInvalidJson: "config — некоректний JSON",
  formTitleRequired: "Вкажіть назву гри",
  formUnknown: "Невідома помилка",
};
