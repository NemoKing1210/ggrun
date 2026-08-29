import type * as ChatEn from "../en/chat";
import type { Widen } from "@/lib/i18n/widen";

export const chat: Widen<typeof ChatEn.chat> = {
  title: "СВЯЗЬ",
  hint: "общий чат",
  placeholder: "Передать сообщение…",
  send: "Отправить",
  sending: "Отправка…",
  loginHint: "Войдите, чтобы писать в чат",
  loginAction: "Войти",
  empty: "Пока тихо — стань первым в эфире.",
  loadMore: "Загрузить ещё",
  loading: "Синхронизация…",
  error: "Не удалось отправить",
  rateLimited: "Помедленнее — канал перегрет. Подожди.",
  emptyContent: "Сообщение пустое",
  tooLong: "Сообщение слишком длинное (макс. 1000)",
  newMessages: "{count} новых",
  onlineHint: "канал активен",
  close: "Закрыть",
} as const;
