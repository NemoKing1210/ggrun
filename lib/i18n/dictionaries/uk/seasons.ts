/** Seasons archive (/seasons and /seasons/[slug]/*). */
export const seasons = {
  metaTitle: "Сезони — GGRun",
  archiveTitle: "Сезони",
  archiveDescription: "Поточні та завершені сезони — поля, таблиці та історія.",
  archiveEmpty: "Завершених сезонів ще немає — перший забіг попереду.",
  card: {
    participants: "{count} гравців",
    duration: "Тривалість",
    cells: "{count} клітинок",
    startedAt: "Старт",
    finishedAt: "Фініш",
    statusLabel: "Статус",
  },
  tabs: {
    overview: "Огляд",
    board: "Поле",
    leaderboard: "Лідерборд",
    feed: "Стрічка",
    rules: "Правила",
  },
  overview: {
    seasonInfoTitle: "Про сезон",
    statsTitle: "Статистика",
    topPlayersTitle: "Лідери",
    noPlayers: "У цьому сезоні немає учасників.",
    boardPreviewTitle: "Превʼю поля",
    noBoard: "У цього сезону немає поля.",
    viewBoard: "Відкрити поле →",
    viewLeaderboard: "Весь лідерборд →",
    viewFeed: "Відкрити стрічку →",
    viewRules: "Читати правила →",
  },
  detail: {
    notFound: "Сезон не знайдено",
    backToArchive: "← Усі сезони",
    currentBadge: "Поточний",
  },
  statusFilter: {
    all: "Усі",
    finished: "Завершені",
    archived: "Архів",
  },
} as const;
