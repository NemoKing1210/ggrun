import type * as ChatEn from "../en/chat";
import type { Widen } from "@/lib/i18n/widen";

export const chat: Widen<typeof ChatEn.chat> = {
  title: "ЗВ’ЯЗОК",
  hint: "загальний чат",
  placeholder: "Передати повідомлення…",
  send: "Надіслати",
  sending: "Надсилання…",
  loginHint: "Увійдіть, щоб писати в чат",
  loginAction: "Увійти",
  empty: "Поки тихо — стань першим в ефірі.",
  loadMore: "Завантажити ще",
  loading: "Синхронізація…",
  error: "Не вдалося надіслати",
  rateLimited: "Повільно — канал перегріто. Зачекай.",
  emptyContent: "Повідомлення порожнє",
  tooLong: "Повідомлення занадто довге (макс. 1000)",
  newMessages: "{count} нових",
  onlineHint: "канал активний",
  close: "Закрити",
} as const;
