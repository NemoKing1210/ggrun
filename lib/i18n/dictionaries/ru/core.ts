import type * as CoreEn from "../en/core";
import type { Widen } from "@/lib/i18n/widen";

/** Shared UI elements. */
export const common: Widen<typeof CoreEn.common> = {
  appName: "GGRun",
  loading: "Загрузка…",
  working: "Работаем…",
  save: "Сохранить",
  add: "Добавить",
  create: "Создать",
  delete: "Удалить",
  apply: "Применить",
  position: "Позиция",
  balance: "Баланс",
  status: "Статус",
  player: "Игрок",
  title: "Название",
  type: "Тип",
  label: "Название",
  actions: "Действия",
  reason: "Причина",
  seasonKicker: "сезон «{season}»",
  notFound: "Не найдено",
};

/** Header navigation. */
export const nav: Widen<typeof CoreEn.nav> = {
  home: "Главная",
  board: "Поле",
  leaderboard: "Лидерборд",
  feed: "Лента",
  rules: "Правила",
  admin: "Админка",
  login: "Войти",
  logout: "Выход",
  language: "Язык",
  menu: "Меню",
};

export const footer: Widen<typeof CoreEn.footer> = {
  tagline: "GGRun · сезонный игровой забег",
  metaTitle: "GGRun — сезонный игровой забег",
  metaDescription: "Платформа командного игрового ивента: сезоны, поле, кубики, лидерборд",
};

/** Login and registration. */
export const auth: Widen<typeof CoreEn.auth> = {
  loginTitle: "Вход",
  loginIdentifier: "Email или ник",
  password: "Пароль",
  passwordHint: "Пароль (мин. 8 символов)",
  signIn: "Войти",
  signingIn: "Входим…",
  registerTitle: "Регистрация",
  email: "Email",
  displayName: "Отображаемое имя",
  createAccount: "Создать аккаунт",
  creating: "Создаём…",
  noAccount: "Нет аккаунта?",
  goToRegister: "Регистрация",
  haveAccount: "Уже есть аккаунт?",
  goToLogin: "Вход",
  devQuick: "Быстрый вход (dev)",
  devAsAdmin: "Войти как админ",
  devAsPlayer: "Войти как игрок",
};

/** Player dashboard (/dashboard). */
export const dashboard: Widen<typeof CoreEn.dashboard> = {
  heading: "Штаб игрока",
  seasonLine: "{season} · {player}",
  statsAria: "Показатели участника",
  statPosition: "Позиция",
  statBalance: "Баланс",
  statStreakPass: "Серия проходов",
  statStreakDrop: "Серия дропов",
  statRerolls: "Рероллов использовано",
  statProgress: "Прогресс",
  currentGame: "Текущая игра",
  noCurrentGame: "Нет активной игры — сделайте ролл.",
  rolledAt: "Выпала {time} назад",
  rollButton: "Ролл игры",
  rolling: "Роллим…",
  rollHint: "Сервер случайно выбирает игру из каталога.",
  history: "История ходов",
  historyEmpty: "Ходов пока нет — сделайте первый ролл.",
  noActiveSeason: "Сейчас нет активного сезона.",
  notInSeason: "Вы не участвуете в текущем сезоне.",
  lastRoll: "Последний бросок",
  diceResult: "Результат кубика: {values}",
  diceRolling: "Бросок кубика",
  moveCell: "клетка",
  moveFormat: "{from} → {to}",
  coverAlt: "Обложка: {title}",
  markPassedConfirm: "Отметить игру пройденной?",
  dropConfirm: "Дропнуть игру? Серия дропов растёт.",
  rerollConfirm: "Запросить реролл? Админ должен подтвердить.",
  rerollButton: "Реролл",
  rerollLockedTitle: "Лимит рероллов исчерпан",
  rerollPending: "Реролл на рассмотрении",
  rerollPendingHint: "Запрос ожидает проверки админом.",
  passedButton: "Пройдено",
  dropButton: "Дроп",
  missingCatalogEntry: "Игра выпала, но запись в каталоге недоступна.",
  dropModalTitle: "Дроп игры",
  dropReasonLabel: "Почему дропаете?",
  dropReasonPlaceholder: "Слишком гриндовая, плохой порт, не мой жанр…",
  passModalTitle: "Отметить прохождение",
  passCommentLabel: "Комментарий (необязательно)",
  passCommentPlaceholder: "Короткий отзыв — что понравилось…",
  ratingLabel: "Оценка 1-10 (необязательно)",
  ratingPlaceholder: "7",
  rerollModalTitle: "Запрос реролла",
  rerollReasonLabel: "Почему нужен реролл?",
  rerollReasonPlaceholder: "Игра уже пройдена, техпроблемы и т.д.",
  submit: "Отправить",
  cancel: "Отмена",
  close: "Закрыть",
  boardProgressTitle: "Прогресс на поле",
  awaitingModeration: "На модерации",
  statsTitle: "Ваш забег",
};

/** Season and participant statuses. */
export const seasonStatuses = {
  draft: "Черновик",
  active: "Идёт",
  paused: "Пауза",
  finished: "Завершён",
  archived: "Архив",
} as const;

export const playerStatuses = {
  active: "В игре",
  finished: "Финиш",
  eliminated: "Выбыл",
  withdrawn: "Снялся",
} as const;

/** Board cell type names. */
export const cellTypes: Widen<typeof CoreEn.cellTypes> = {
  start: "Старт",
  finish: "Финиш",
  normal: "Обычная",
  penalty: "Штраф",
  bonus: "Бонус",
  event: "Событие",
  teleport: "Телепорт",
  custom: "Особая",
};

/**
 * Server use-case error texts (keys are error codes).
 */
export const errors: Widen<typeof CoreEn.errors> = {
  gameNotAllowed: "Недостаточно прав для этого действия",
  gameParticipantNotFound: "Участник не найден",
  gameSeasonNotActive: "Сезон не активен",
  gameSeasonNotFound: "Сезон не найден",
  gameAlreadyHaveRoll: "У вас уже есть наролленная игра",
  gameRollNotFound: "Ролл не найден",
  gameRollAlreadyResolved: "Ролл уже разрешён",
  gameRerollLimit: "Лимит рероллов исчерпан",
  gameRerollLimitForGame: "Лимит рероллов для этой игры исчерпан",
  gameRerollPending: "Запрос на реролл уже на рассмотрении",
  gameRerollRequestNotFound: "Запрос на реролл не найден",
  gameLoginRequired: "Требуется вход",
  formReasonRequired: "Укажите причину (минимум 5 символов)",
  formRatingInvalid: "Оценка должна быть целым числом от 1 до 10",

  adminStaffRequired: "Требуются права staff",
  adminSeasonNotFound: "Сезон не найден",
  adminInvalidTransition: "Недопустимый переход {from} → {to}",
  adminPlayerNotFound: "Участник не найден",
  adminSelfBlock: "Нельзя заблокировать самого себя",
  adminSelfDemote: "Нельзя разжаловать самого себя",
  adminSelfDelete: "Нельзя удалить самого себя",

  authInvalidEmail: "Некорректный email",
  authPasswordTooShort: "Пароль должен быть не короче 8 символов",
  authUserExists: "Пользователь уже существует",
  authUsernameFailed: "Не удалось подобрать уникальный username",
  authInvalidCredentials: "Неверный логин или пароль",
  authBlocked: "Этот аккаунт заблокирован",

  formLoginRequired: "Укажите логин",
  formPasswordRequired: "Укажите пароль",
  formSlugFormat: "slug: строчные латинские буквы, цифры, дефис",
  formConfigInvalidJson: "config — некорректный JSON",
  formTitleRequired: "Укажите название игры",
  formUnknown: "Неизвестная ошибка",
};
