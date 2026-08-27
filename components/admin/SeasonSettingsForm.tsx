"use client";

import { useActionState, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FireIcon,
  GlobeAltIcon,
  HeartIcon,
  MapIcon,
  PuzzlePieceIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquaresPlusIcon,
  StarIcon,
  TrophyIcon,
  TvIcon,
} from "@heroicons/react/24/outline";
import { updateSeasonSettingsAction } from "@/lib/use-cases/admin-actions";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Range } from "@/components/ui/Range";
import { useI18n } from "@/lib/i18n/client";

import { motion, AnimatePresence } from "framer-motion";
import { format } from "@/lib/i18n/format";
import { DebugError } from "@/components/ui/DebugError";
import type { SeasonConfig } from "@/game-engine/types";
import { GAME_POOL_TEMPLATES } from "@/lib/game-pool/templates";

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  EyeIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  BoltIcon,
  SparklesIcon,
  TvIcon,
  MapIcon,
  RocketLaunchIcon,
  StarIcon,
  FireIcon,
  HeartIcon,
  TrophyIcon,
};
import {
  PLATFORMS,
  GENRES,
  TAGS,
  ESRB,
  ORDERINGS,
  GAME_PROVIDERS,
  BOARD_DISTRIBUTIONS,
} from "@/lib/game-pool/constants";
type Props = {
  seasonId: string;
  initialConfig: SeasonConfig;
  initialRulesMd: string | null;
  seasonTitle?: string;
  seasonStatus?: string;
  availableProviders?: Array<{ id: string; label: string }>;
};

export default function SeasonSettingsForm({ seasonId, initialConfig, initialRulesMd, availableProviders = [] }: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"templates" | "dice" | "board" | "pool" | "rules">("templates");
  const [cfg, setCfg] = useState<SeasonConfig>(initialConfig);
  const [poolAdvancedOpen, setPoolAdvancedOpen] = useState(false);
  const [rulesMd, setRulesMd] = useState(initialRulesMd ?? "");
  const [rulesMode, setRulesMode] = useState<SeasonConfig["rules"]["mode"]>(initialConfig.rules.mode);
  const templates = GAME_POOL_TEMPLATES;
  const [state, formAction, pending] = useActionState(updateSeasonSettingsAction, {});
  const boardTotalSpecials = cfg.board.bonusCount + cfg.board.penaltyCount + cfg.board.teleportCount + cfg.board.eventCount;
  const boardNormal = Math.max(0, cfg.board.size - boardTotalSpecials - (cfg.board.loop ? 1 : 2));
  const boardValid = boardTotalSpecials <= cfg.board.size - (cfg.board.loop ? 1 : 2);

  const setBoard = (patch: Partial<SeasonConfig["board"]>) =>
    setCfg((c) => ({ ...c, board: { ...c.board, ...patch } }));
  const setDice = (patch: Partial<SeasonConfig["dice"]>) =>
    setCfg((c) => ({ ...c, dice: { ...c.dice, ...patch } }));
  const setPoints = (patch: Partial<SeasonConfig["points"]>) =>
    setCfg((c) => ({ ...c, points: { ...c.points, ...patch } }));
  const setRerolls = (patch: Partial<SeasonConfig["rerolls"]>) =>
    setCfg((c) => ({ ...c, rerolls: { ...c.rerolls, ...patch } }));
  const setModeration = (patch: Partial<SeasonConfig["moderation"]>) =>
    setCfg((c) => ({ ...c, moderation: { ...(c.moderation ?? { completionRequireApproval: false }), ...patch } }));
  const setGamePool = (patch: Partial<SeasonConfig["gamePool"]>) =>
    setCfg((c) => ({ ...c, gamePool: { ...c.gamePool, ...patch } }));
  const setFilters = (patch: Partial<SeasonConfig["gamePool"]["filters"]>) =>
    setCfg((c) => ({ ...c, gamePool: { ...c.gamePool, filters: { ...c.gamePool.filters, ...patch } } }));
  const setCatalog = (patch: Partial<SeasonConfig["gamePool"]["catalog"]>) =>
    setCfg((c) => ({ ...c, gamePool: { ...c.gamePool, catalog: { ...c.gamePool.catalog, ...patch } } }));

  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setCfg((c) => ({
      ...c,
      gamePool: {
        ...c.gamePool,
        templateId: id,
        filters: {
          ...c.gamePool.filters,
          genres: tpl.filters.genres ?? c.gamePool.filters.genres,
          tags: tpl.filters.tags ?? c.gamePool.filters.tags,
          platforms: tpl.filters.platforms ?? c.gamePool.filters.platforms,
          esrb: tpl.filters.esrb ?? c.gamePool.filters.esrb,
          yearMin: (tpl.filters.yearMin as number | null) ?? c.gamePool.filters.yearMin,
          yearMax: (tpl.filters.yearMax as number | null) ?? c.gamePool.filters.yearMax,
          ordering: tpl.filters.ordering ?? c.gamePool.filters.ordering,
        },
      },
      board: tpl.boardHint
        ? {
            ...c.board,
            bonusCount: tpl.boardHint.bonusCount,
            penaltyCount: tpl.boardHint.penaltyCount,
            eventCount: tpl.boardHint.eventCount,
          }
        : c.board,
    }));
    setActiveTab("pool");
  };

  const clearTemplate = () => setGamePool({ templateId: null });

  const handleSubmit = (formData: FormData) => {
    formData.set("structured", "1");
    formData.set("seasonId", seasonId);
    formData.set("rulesMd", rulesMd);
    formData.set("rulesMode", rulesMode);
    formData.set("dice_sides", String(cfg.dice.sides));
    formData.set("dice_passDiceCount", String(cfg.dice.passDiceCount));
    formData.set("dice_dropDiceCount", String(cfg.dice.dropDiceCount));
    formData.set("dice_dropStreakMultiplier", cfg.dice.dropStreakMultiplier ? "true" : "false");
    formData.set("points_startingBalance", String(cfg.points.startingBalance));
    formData.set("points_bonusAddsToRollOnPass", cfg.points.bonusAddsToRollOnPass ? "true" : "false");
    formData.set("points_resetBalanceAfterUse", cfg.points.resetBalanceAfterUse ? "true" : "false");
    formData.set("board_size", String(cfg.board.size));
    formData.set("board_loop", cfg.board.loop ? "true" : "false");
    formData.set("board_bonusCount", String(cfg.board.bonusCount));
    formData.set("board_penaltyCount", String(cfg.board.penaltyCount));
    formData.set("board_teleportCount", String(cfg.board.teleportCount));
    formData.set("board_eventCount", String(cfg.board.eventCount));
    formData.set("board_distribution", cfg.board.distribution);
    formData.set("board_regenerateOnSave", cfg.board.regenerateOnSave ? "true" : "false");
    formData.set("rerolls_allowed", cfg.rerolls.allowed ? "true" : "false");
    formData.set("rerolls_limitPerGame", String(cfg.rerolls.limitPerGame));
    formData.set("rerolls_requireApproval", cfg.rerolls.requireApproval ? "true" : "false");
    formData.set("moderation_completionRequireApproval", cfg.moderation.completionRequireApproval ? "true" : "false");
    formData.set("gamePool_source", cfg.gamePool.source);
    formData.set("gamePool_provider", cfg.gamePool.provider);
    formData.set("gamePool_templateId", cfg.gamePool.templateId ?? "");
    formData.set("gamePool_maxCandidates", String(cfg.gamePool.maxCandidates));
    formData.set("gamePool_cacheTtlHours", String(cfg.gamePool.cacheTtlHours));
    formData.set("gamePool_autoFetchOnRoll", cfg.gamePool.autoFetchOnRoll ? "true" : "false");
    formData.set("catalog_allowManualAdd", cfg.gamePool.catalog.allowManualAdd ? "true" : "false");
    formData.set("catalog_fallbackToCatalog", cfg.gamePool.catalog.fallbackToCatalog ? "true" : "false");
    formData.set("genres", JSON.stringify(cfg.gamePool.filters.genres));
    formData.set("platforms", JSON.stringify(cfg.gamePool.filters.platforms));
    formData.set("tags", JSON.stringify(cfg.gamePool.filters.tags));
    formData.set("esrb", JSON.stringify(cfg.gamePool.filters.esrb));
    formData.set("filters_metacriticMin", cfg.gamePool.filters.metacriticMin?.toString() ?? "");
    formData.set("filters_metacriticMax", cfg.gamePool.filters.metacriticMax?.toString() ?? "");
    formData.set("filters_ratingMin", cfg.gamePool.filters.ratingMin?.toString() ?? "");
    formData.set("filters_ratingMax", cfg.gamePool.filters.ratingMax?.toString() ?? "");
    formData.set("filters_yearMin", cfg.gamePool.filters.yearMin?.toString() ?? "");
    formData.set("filters_yearMax", cfg.gamePool.filters.yearMax?.toString() ?? "");
    formData.set("filters_players", cfg.gamePool.filters.players);
    formData.set("filters_onlyWithCover", cfg.gamePool.filters.onlyWithCover ? "true" : "false");
    formData.set("filters_ordering", cfg.gamePool.filters.ordering);
    formData.set("filters_searchQuery", cfg.gamePool.filters.searchQuery ?? "");
    formData.set("filters_ordering", cfg.gamePool.filters.ordering);
    return formAction(formData);
  };

  const TabButton = ({ id, label }: { id: typeof activeTab; label: string }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 text-sm font-display uppercase tracking-wider border-b-2 transition ${
        activeTab === id ? "border-amber text-amber bg-amber/10" : "border-transparent text-zinc-400 hover:text-amber"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <div className="hud-card overflow-hidden p-0">
        <div className="flex flex-wrap border-b border-zinc-800 bg-[#0f0f0f]">
          <TabButton id="templates" label={t.admin.settings.tabs.templates} />
          <TabButton id="dice" label={t.admin.settings.tabs.dice} />
          <TabButton id="board" label={t.admin.settings.tabs.board} />
          <TabButton id="pool" label={t.admin.settings.tabs.pool} />
          <TabButton id="rules" label={t.admin.settings.tabs.rules} />
        </div>

        <div className="p-5">
          {activeTab === "templates" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg uppercase tracking-wider">{t.admin.settings.templatesHeading}</h3>
                {cfg.gamePool.templateId && (
                  <button type="button" onClick={clearTemplate} className="inline-flex items-center gap-1 text-xs text-amber underline underline-offset-4">
                    {t.admin.settings.clearTemplate}
                    <ArrowRightIcon className="h-3 w-3" aria-hidden />
                  </button>
                )}
              </div>
              <p className="text-sm text-zinc-400">{t.admin.settings.templatesHint}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((tpl) => {
                  const Icon = TEMPLATE_ICONS[tpl.heroIcon];
                  return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className={`hud-lift text-left p-4 border-2 group [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${
                      cfg.gamePool.templateId === tpl.id
                        ? "border-amber bg-amber/10 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                        : "border-zinc-800 bg-[#151515] hover:border-amber/40 hover:bg-[#1c1c1c]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {Icon ? <Icon className="h-5 w-5 shrink-0 text-amber" aria-hidden /> : null}
                      <span className="font-display uppercase tracking-wider text-sm">{tpl.label}</span>
                      {cfg.gamePool.templateId === tpl.id && <Badge variant="amber" size="sm" className="ml-auto">{t.admin.settings.activeBadge}</Badge>}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{tpl.description}</p>
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      {(tpl.filters.genres ?? []).slice(0, 3).map((g) => (
                        <Badge key={g} variant="neutral" size="sm">{g}</Badge>
                      ))}
                      {(tpl.filters.tags ?? []).slice(0, 3).map((tg) => (
                        <Badge key={tg} variant="amber" size="sm">{tg}</Badge>
                      ))}
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "dice" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="hud-card p-4 bg-[#0f0f0f] border-zinc-800">
                <h4 className="font-display uppercase tracking-wider text-amber mb-3">{t.admin.settings.diceHeading}</h4>
                <div className="flex flex-col gap-4">
                  <Field label={t.admin.settings.sidesPerDieLabel}>
                    <Range min={2} max={20} value={cfg.dice.sides} onChange={(e) => setDice({ sides: Number(e.target.value) })} />
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>2</span>
                      <span className="text-amber font-bold text-sm">d{cfg.dice.sides}</span>
                      <span>20</span>
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t.admin.settings.diceOnPassLabel}>
                      <Input type="number" min={0} max={5} value={cfg.dice.passDiceCount} onChange={(e) => setDice({ passDiceCount: Number(e.target.value) })} />
                    </Field>
                    <Field label={t.admin.settings.diceOnDropLabel}>
                      <Input type="number" min={0} max={5} value={cfg.dice.dropDiceCount} onChange={(e) => setDice({ dropDiceCount: Number(e.target.value) })} />
                    </Field>
                  </div>
                  <Switch
                    checked={cfg.dice.dropStreakMultiplier}
                    onChange={(v) => setDice({ dropStreakMultiplier: v })}
                    label={t.admin.settings.streakMultiplierLabel}
                    description={t.admin.settings.streakMultiplierDescription}
                  />
                  <div className="hud-card p-3 bg-black/30 text-xs text-zinc-400">
                    {format(t.admin.settings.movementInfo, {
                      balance: cfg.points.bonusAddsToRollOnPass ? " + balance" : "",
                      streak: cfg.dice.dropStreakMultiplier ? " × streak" : "",
                    })}
                  </div>
                </div>
              </section>

              <section className="hud-card p-4 bg-[#0f0f0f] border-zinc-800">
                <h4 className="font-display uppercase tracking-wider text-amber mb-3">{t.admin.settings.pointsHeading}</h4>
                <div className="flex flex-col gap-4">
                  <Field label={t.admin.settings.startingBalanceLabel}>
                    <Input type="number" min={0} value={cfg.points.startingBalance} onChange={(e) => setPoints({ startingBalance: Number(e.target.value) })} />
                  </Field>
                  <Switch
                    checked={cfg.points.bonusAddsToRollOnPass}
                    onChange={(v) => setPoints({ bonusAddsToRollOnPass: v })}
                    label={t.admin.settings.bonusOnPassLabel}
                    description={t.admin.settings.bonusOnPassDescription}
                  />
                  <Switch
                    checked={cfg.points.resetBalanceAfterUse}
                    onChange={(v) => setPoints({ resetBalanceAfterUse: v })}
                    label={t.admin.settings.resetBalanceLabel}
                    description={t.admin.settings.resetBalanceDescription}
                  />
                  <div className="h-px bg-zinc-800 my-1" />
                  <Switch
                    checked={cfg.rerolls.allowed}
                    onChange={(v) => setRerolls({ allowed: v })}
                    label={t.admin.settings.allowRerollsLabel}
                    description={t.admin.settings.allowRerollsDescription}
                  />
                  <Field label={t.admin.settings.rerollsLimitLabel}>
                    <Input type="number" min={0} max={5} value={cfg.rerolls.limitPerGame} onChange={(e) => setRerolls({ limitPerGame: Number(e.target.value) })} disabled={!cfg.rerolls.allowed} />
                  </Field>
                  <Switch
                    checked={!(cfg.rerolls.requireApproval ?? true)}
                    onChange={(v) => setRerolls({ requireApproval: !v })}
                    label={t.admin.settings.rerollWithoutApprovalLabel}
                    description={t.admin.settings.rerollWithoutApprovalDescription}
                  />
                  <Switch
                    checked={!(cfg.moderation?.completionRequireApproval ?? false)}
                    onChange={(v) => setModeration({ completionRequireApproval: !v })}
                    label={t.admin.settings.completionWithoutApprovalLabel}
                    description={t.admin.settings.completionWithoutApprovalDescription}
                  />
                </div>
              </section>
            </div>
          )}

          {activeTab === "board" && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Field label={t.admin.settings.boardSizeLabel}>
                  <Range min={10} max={100} value={cfg.board.size} onChange={(e) => setBoard({ size: Number(e.target.value) })} />
                  <span className="text-amber font-mono text-center text-lg block">{cfg.board.size}</span>
                </Field>
                <Field label={t.admin.settings.distributionLabel}>
                  <Select value={cfg.board.distribution} onChange={(e) => setBoard({ distribution: e.target.value as SeasonConfig["board"]["distribution"] })}>
                    {BOARD_DISTRIBUTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="mt-6">
                  <Switch
                    checked={cfg.board.loop}
                    onChange={(v) => setBoard({ loop: v })}
                    label={t.admin.settings.loopLabel}
                    description={t.admin.settings.loopDescription}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: "bonusCount", label: t.admin.settings.bonusCellsLabel, variant: "emerald" as const },
                  { key: "penaltyCount", label: t.admin.settings.penaltyCellsLabel, variant: "danger" as const },
                  { key: "teleportCount", label: t.admin.settings.teleportsLabel, variant: "violet" as const },
                  { key: "eventCount", label: t.admin.settings.eventCellsLabel, variant: "sky" as const },
                ].map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      type="number"
                      min={0}
                      max={cfg.board.size}
                      value={cfg.board[f.key as keyof SeasonConfig["board"]] as number}
                      onChange={(e) => setBoard({ [f.key]: Number(e.target.value) } as never)}
                    />
                    <div className="h-1.5 bg-zinc-800 overflow-hidden [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
                      <div
                        className={`h-full ${f.variant === "emerald" ? "bg-emerald-500" : f.variant === "danger" ? "bg-red-500" : f.variant === "violet" ? "bg-violet-500" : "bg-sky-500"}`}
                        style={{
                          width: `${Math.min(100, ((cfg.board[f.key as keyof SeasonConfig["board"]] as number) / cfg.board.size) * 100)}%`,
                        }}
                      />
                    </div>
                  </Field>
                ))}
              </div>

              {!boardValid && (
                <div className="hud-card p-3 bg-red-950/30 border-red-800 text-sm text-red-300">
                  {format(t.admin.settings.capacityWarning, {
                    count: boardTotalSpecials,
                    capacity: cfg.board.size - (cfg.board.loop ? 1 : 2),
                  })}
                </div>
              )}

              <div className="hud-card p-3 bg-black/20 text-xs">
                <div className="flex gap-1.5 mb-1 flex-wrap">
                  <Badge variant="neutral" size="sm">{t.admin.settings.badgeStart}</Badge>
                  <Badge variant="emerald" size="sm">{format(t.admin.settings.badgeBonus, { count: cfg.board.bonusCount })}</Badge>
                  <Badge variant="danger" size="sm">{format(t.admin.settings.badgePenalty, { count: cfg.board.penaltyCount })}</Badge>
                  <Badge variant="violet" size="sm">{format(t.admin.settings.badgeTeleport, { count: cfg.board.teleportCount })}</Badge>
                  <Badge variant="sky" size="sm">{format(t.admin.settings.badgeEvent, { count: cfg.board.eventCount })}</Badge>
                  <Badge variant="dim" size="sm">{format(t.admin.settings.badgeNormal, { count: boardNormal })}</Badge>
                  {!cfg.board.loop && <Badge variant="amber" size="sm">{t.admin.settings.badgeFinish}</Badge>}
                </div>
                <div className="h-2 overflow-hidden flex [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <div style={{ flex: cfg.board.loop ? 1 : 1 }} className="bg-zinc-600" />
                  {cfg.board.bonusCount > 0 && <div style={{ flex: cfg.board.bonusCount }} className="bg-emerald-500" />}
                  {cfg.board.penaltyCount > 0 && <div style={{ flex: cfg.board.penaltyCount }} className="bg-red-500" />}
                  {cfg.board.teleportCount > 0 && <div style={{ flex: cfg.board.teleportCount }} className="bg-violet-500" />}
                  {cfg.board.eventCount > 0 && <div style={{ flex: cfg.board.eventCount }} className="bg-sky-500" />}
                  <div style={{ flex: boardNormal }} className="bg-zinc-800" />
                  {!cfg.board.loop && <div style={{ flex: 1 }} className="bg-amber" />}
                </div>
                <div className="mt-3">
                  <Switch
                    checked={cfg.board.regenerateOnSave}
                    onChange={(v) => setBoard({ regenerateOnSave: v })}
                    label={t.admin.settings.regenerateLabel}
                    description={t.admin.settings.regenerateDescription}
                    variant="danger"
                  />
                </div>
                {cfg.board.regenerateOnSave && (
                  <p className="text-xs text-danger/90 mt-2 border border-danger/30 bg-danger/10 p-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] inline-flex items-center gap-1.5">
                    <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />
                    {t.admin.settings.regenerateWarning}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "rules" && (
            <div className="hud-card p-4 bg-[#0f0f0f] border-zinc-800 flex flex-col gap-4">
<div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display uppercase tracking-wider text-amber">{t.admin.settings.rulesLabel}</h3>
          <Badge variant={rulesMode === "auto" ? "amber" : "dim"}>{rulesMode === "auto" ? t.admin.settings.rulesAutoBadge : t.admin.settings.rulesManualBadge}</Badge>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.rulesModeLabel}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRulesMode("auto")}
              className={`border px-3 py-1.5 font-display text-xs uppercase tracking-widest transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${rulesMode === "auto" ? "border-amber bg-amber text-black" : "border-dim/20 bg-raised text-dim hover:border-amber/40"}`}
            >
              {t.admin.settings.rulesModeAuto}
            </button>
            <button
              type="button"
              onClick={() => setRulesMode("manual")}
              className={`border px-3 py-1.5 font-display text-xs uppercase tracking-widest transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${rulesMode === "manual" ? "border-amber bg-amber text-black" : "border-dim/20 bg-raised text-dim hover:border-amber/40"}`}
            >
              {t.admin.settings.rulesModeManual}
            </button>
          </div>
          <p className="font-mono text-xs text-dim">{rulesMode === "auto" ? t.admin.settings.rulesModeHintAuto : t.admin.settings.rulesModeHintManual}</p>
        </div>

        {rulesMode === "manual" ? (
          <div className="mt-4">
            <p className="mb-2 font-mono text-xs text-dim">{t.admin.settings.rulesManualHint}</p>
            <Textarea value={rulesMd} onChange={(e) => setRulesMd(e.target.value)} rows={10} placeholder={t.admin.settings.rulesPlaceholder} />
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-xs uppercase tracking-widest text-amber">{t.admin.settings.rulesAutoPreviewTitle}</p>
              <span className="font-mono text-[11px] text-dim">{t.admin.settings.rulesAutoBadge}</span>
            </div>
            <p className="mb-3 font-mono text-xs text-dim">{t.admin.settings.rulesAutoPreviewHint}</p>
            <div className="max-h-[520px] overflow-auto border border-dim/15 bg-raised p-3">
              {/* lightweight live preview without importing heavy AutoRulesView to avoid client bundling of server-only deps */}
              <div className="space-y-3 text-xs leading-relaxed">
                <div className="border border-amber/20 bg-amber/5 p-2 font-mono text-dim">
                  {t.rules.heroSubtitle}
                </div>
                <div>
                  <strong className="font-display uppercase tracking-wide text-amber">{t.rules.sections.dice}</strong>
                  <p className="text-zinc-300">d{cfg.dice.sides} · pass {cfg.dice.passDiceCount} / drop {cfg.dice.dropDiceCount}{cfg.dice.dropStreakMultiplier ? " · streak ×" : ""}</p>
                </div>
                <div>
                  <strong className="font-display uppercase tracking-wide text-amber">{t.rules.sections.points}</strong>
                  <p className="text-zinc-300">start {cfg.points.startingBalance} · {cfg.points.bonusAddsToRollOnPass ? "bonus+" : "no bonus"} · {cfg.points.resetBalanceAfterUse ? "reset" : "retain"} · rerolls {cfg.rerolls.allowed ? `up to ${cfg.rerolls.limitPerGame}` : "off"}</p>
                </div>
                <div>
                  <strong className="font-display uppercase tracking-wide text-amber">{t.rules.sections.board}</strong>
                  <p className="text-zinc-300">{cfg.board.size} cells · {cfg.board.distribution} · loop {cfg.board.loop ? "yes" : "no"} · bonus {cfg.board.bonusCount} penalty {cfg.board.penaltyCount} teleport {cfg.board.teleportCount} event {cfg.board.eventCount}</p>
                </div>
                <div>
                  <strong className="font-display uppercase tracking-wide text-amber">{t.rules.sections.pool}</strong>
                  <p className="text-zinc-300">{cfg.gamePool.source} via {cfg.gamePool.provider} · {cfg.gamePool.filters.ordering} · {cfg.gamePool.maxCandidates} candidates</p>
                  {cfg.gamePool.filters.genres.length || cfg.gamePool.filters.tags.length ? <p className="text-dim">filters: {[...cfg.gamePool.filters.genres, ...cfg.gamePool.filters.tags].join(", ")}</p> : null}
                </div>
                <div className="border-t border-dim/15 pt-2 font-mono text-[11px] uppercase tracking-widest text-dim">Preview updates live — full HUD preview on /rules</div>
              </div>
            </div>
          </div>
        )}
            </div>
          )}

          {activeTab === "pool" && (() => {
            const providerConfiguredIds = new Set(availableProviders.map((p) => p.id));
            const hasAnyProvider = availableProviders.length > 0;
            const selectedProviderConfigured = cfg.gamePool.provider === "internal" || providerConfiguredIds.has(cfg.gamePool.provider);
            const needsProvider = cfg.gamePool.source !== "catalog";
            const showProviderWarning = needsProvider && !selectedProviderConfigured;
            const sourceOptions: Array<{ value: SeasonConfig["gamePool"]["source"]; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
              { value: "catalog", label: t.admin.settings.sourceCatalogLabel, desc: t.admin.settings.sourceCatalogDesc, icon: CircleStackIcon },
              { value: "api", label: t.admin.settings.sourceApiLabel, desc: t.admin.settings.sourceApiDesc, icon: GlobeAltIcon },
              { value: "hybrid", label: t.admin.settings.sourceHybridLabel, desc: t.admin.settings.sourceHybridDesc, icon: SquaresPlusIcon },
            ];
            const handleSource = (src: SeasonConfig["gamePool"]["source"]) => {
              if (src === "catalog") {
                setGamePool({ source: src, provider: "internal" });
              } else {
                // when switching to api/hybrid, auto-pick first configured provider if current is internal and we have one
                let nextProvider: SeasonConfig["gamePool"]["provider"] = cfg.gamePool.provider;
                if (cfg.gamePool.provider === "internal" && hasAnyProvider) {
                  const first = availableProviders[0]!.id as SeasonConfig["gamePool"]["provider"];
                  if (["rawg", "igdb", "steam"].includes(first)) nextProvider = first;
                }
                setGamePool({ source: src, provider: nextProvider });
              }
            };
            return (
            <div className="flex flex-col gap-6">
              {/* Source switch — prominent segmented control */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display text-[11px] uppercase tracking-widest text-amber">{t.admin.settings.sourceLabel} · game source</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{cfg.gamePool.source} → {cfg.gamePool.provider}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {sourceOptions.map((opt) => {
                    const active = cfg.gamePool.source === opt.value;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSource(opt.value)}
                        aria-pressed={active}
                        className={`relative text-left p-3 flex gap-3 items-start transition duration-150 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${active ? "border-2 border-amber bg-amber text-black shadow-[0_0_22px_rgba(251,191,36,0.50),inset_0_1px_0_rgba(255,255,255,0.38),inset_0_-3px_0_rgba(0,0,0,0.30)]" : "border border-zinc-700 bg-[#161616] text-zinc-200 hover:border-zinc-500 hover:bg-[#1e1e1c] hover:brightness-[1.04] opacity-[0.92] hover:opacity-100"}`}
                      >
                        {active && <span className="pointer-events-none absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-black text-amber border border-black/20" aria-hidden><CheckCircleIcon className="size-3.5" /></span>}
                        <span className={`inline-flex size-8 shrink-0 items-center justify-center border [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${active ? "bg-black text-amber border-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "bg-[#232323] text-zinc-400 border-zinc-700"}`}><Icon className="size-4" aria-hidden /></span>
                        <span className="min-w-0 pr-6">
                          <span className={`font-display text-sm uppercase tracking-wider ${active ? "text-black font-bold" : "text-zinc-100"}`}>{opt.label}</span>
                          {active && <span className="ml-2 inline-flex items-center border border-black/20 bg-black px-1.5 py-0.5 font-display text-[10px] leading-none uppercase tracking-widest text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">{t.admin.settings.sourceActiveBadge}</span>}
                          <span className={`mt-0.5 block text-xs leading-snug ${active ? "text-black/70" : "text-zinc-500"}`}>{opt.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 font-mono text-xs text-dim">{t.admin.settings.poolHint}</p>
              </div>

              {/* Provider row — only when API is involved */}
              <div className={`hud-card p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${needsProvider ? "bg-[#0f0f0f] border-zinc-800" : "bg-[#0f0f0f]/60 border-zinc-800 opacity-80"}`}>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <Field label={t.admin.settings.providerLabel}>
                    <Select value={cfg.gamePool.provider} onChange={(e) => setGamePool({ provider: e.target.value as SeasonConfig["gamePool"]["provider"] })} disabled={!needsProvider}>
                      {GAME_PROVIDERS.map((o) => {
                        const configured = o.value === "internal" || providerConfiguredIds.has(o.value);
                        return (
                          <option key={o.value} value={o.value}>
                            {o.label}{configured ? " ✓" : needsProvider ? " · not configured" : ""}
                          </option>
                        );
                      })}
                    </Select>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {GAME_PROVIDERS.map((o) => {
                        const configured = o.value === "internal" || providerConfiguredIds.has(o.value);
                        const isSelected = cfg.gamePool.provider === o.value;
                        if (!needsProvider && o.value !== "internal") return null;
                        return (
                          <span key={o.value} className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${isSelected ? "border-amber bg-amber/10 text-amber" : configured ? "border-emerald-800 bg-emerald-950/30 text-emerald-300" : "border-red-900 bg-red-950/30 text-red-300"}`}>
                            <span className={`size-1.5 rounded-full ${configured ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />{o.label}
                          </span>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label={t.admin.settings.orderingLabel}>
                    <Select value={cfg.gamePool.filters.ordering} onChange={(e) => setFilters({ ordering: e.target.value })}>
                      {ORDERINGS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-1 font-mono text-[11px] text-dim">Ordering affects API & catalog picks equally</p>
                  </Field>
                </div>
                {!needsProvider && (
                  <p className="mt-3 flex items-center gap-1.5 border border-dim/15 bg-raised px-3 py-2 font-mono text-xs text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"><CircleStackIcon className="size-3.5 text-amber" aria-hidden /> {t.admin.settings.catalogOnlyNote}</p>
                )}
                {showProviderWarning && (
                  <div className="mt-3 flex items-start gap-2 border border-amber/30 bg-amber/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <ExclamationTriangleIcon className="size-4 shrink-0 text-amber" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-amber">{format(t.admin.settings.providerNotConfiguredShort, { provider: cfg.gamePool.provider })}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{t.admin.settings.providerFallbackNote} {cfg.gamePool.catalog.fallbackToCatalog ? t.admin.settings.providerFallbackYes : t.admin.settings.providerFallbackNo} · <a href="/admin/settings" className="underline decoration-amber/50 underline-offset-4 hover:text-amber">Settings → Integrations</a></p>
                    </div>
                  </div>
                )}
                {needsProvider && hasAnyProvider && selectedProviderConfigured && (
                  <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-emerald-300"><CheckCircleIcon className="size-3.5" aria-hidden /> {t.admin.settings.providerReady} — {availableProviders.find((p) => p.id === cfg.gamePool.provider)?.label ?? cfg.gamePool.provider}</p>
                )}
                {needsProvider && !hasAnyProvider && (
                  <div className="mt-3 border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <p className="text-sm font-medium text-red-300">{t.admin.settings.noProvidersConfiguredShort}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t.admin.settings.noProvidersConfiguredHint}</p>
                    <a href="/admin/settings" className="hud-btn hud-btn-primary mt-2 inline-flex !py-1.5 !px-3 text-xs">Go to Settings</a>
                  </div>
                )}
              </div>

              {/* Advanced filters — collapsible (less important) */}
              {(() => {
                const activeCount =
                  cfg.gamePool.filters.genres.length +
                  cfg.gamePool.filters.platforms.length +
                  cfg.gamePool.filters.tags.length +
                  cfg.gamePool.filters.esrb.length +
                  (cfg.gamePool.filters.searchQuery ? 1 : 0) +
                  (cfg.gamePool.filters.metacriticMin !== null ? 1 : 0) +
                  (cfg.gamePool.filters.metacriticMax !== null ? 1 : 0) +
                  (cfg.gamePool.filters.ratingMin !== null ? 1 : 0) +
                  (cfg.gamePool.filters.ratingMax !== null ? 1 : 0) +
                  (cfg.gamePool.filters.yearMin !== null ? 1 : 0) +
                  (cfg.gamePool.filters.yearMax !== null ? 1 : 0) +
                  (cfg.gamePool.filters.players !== "any" ? 1 : 0) +
                  (cfg.gamePool.filters.onlyWithCover ? 1 : 0) +
                  (cfg.gamePool.autoFetchOnRoll ? 1 : 0);
                return (
                  <div className="hud-card overflow-hidden border-zinc-800 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                    <button
                      type="button"
                      onClick={() => setPoolAdvancedOpen((v) => !v)}
                      aria-expanded={poolAdvancedOpen}
                      className="flex w-full items-center justify-between gap-4 bg-[#0f0f0f] px-4 py-3.5 text-left transition hover:bg-[#151515]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex size-8 shrink-0 items-center justify-center border border-amber/30 bg-amber/12 text-amber shadow-[0_0_10px_rgba(251,191,36,0.15)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                          <AdjustmentsHorizontalIcon className="size-4" aria-hidden />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5 text-left">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-[13px] font-bold uppercase tracking-widest leading-none text-zinc-100">{t.admin.settings.advancedFiltersTitle}</span>
                            {activeCount > 0 && <Badge variant="amber" size="sm" className="shrink-0">{format(t.admin.settings.filtersCountLabel, { count: String(activeCount) })}</Badge>}
                          </span>
                          <span className="max-w-[52ch] font-sans text-xs leading-snug text-zinc-400">{t.admin.settings.advancedFiltersHint}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2.5">
                        <span className={`hidden font-mono text-xs uppercase tracking-widest transition sm:inline ${poolAdvancedOpen ? "text-amber" : "text-zinc-400"}`}>{poolAdvancedOpen ? t.admin.settings.hideFilters : t.admin.settings.showFilters}</span>
                        <span className={`inline-flex size-7 items-center justify-center border shadow-sm [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] transition ${poolAdvancedOpen ? "border-amber bg-amber text-black shadow-[0_0_12px_rgba(251,191,36,0.45)]" : "border-zinc-600 bg-[#1e1e1e] text-zinc-300 hover:border-zinc-500 hover:text-amber"}`}>
                          <ChevronDownIcon className={`size-4 transition duration-200 ${poolAdvancedOpen ? "rotate-180" : ""}`} aria-hidden />
                        </span>
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {poolAdvancedOpen && (
                        <motion.div
                          key="advanced-filters"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden border-t border-zinc-800"
                        >
                          <div className="bg-[#0f0f0f]/60 p-4 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterGenres}</span>
                <div className="flex flex-wrap gap-1.5">
                  {GENRES.map((g) => (
                    <Chip key={g.value} active={cfg.gamePool.filters.genres.includes(g.value)} onClick={() => setFilters({ genres: cfg.gamePool.filters.genres.includes(g.value) ? cfg.gamePool.filters.genres.filter((x) => x !== g.value) : [...cfg.gamePool.filters.genres, g.value] })}>
                      {g.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterPlatforms}</span>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => (
                    <Chip key={p.value} active={cfg.gamePool.filters.platforms.includes(p.value)} onClick={() => setFilters({ platforms: cfg.gamePool.filters.platforms.includes(p.value) ? cfg.gamePool.filters.platforms.filter((x) => x !== p.value) : [...cfg.gamePool.filters.platforms, p.value] })}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterTags}</span>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map((tg) => (
                    <Chip key={tg.value} active={cfg.gamePool.filters.tags.includes(tg.value)} onClick={() => setFilters({ tags: cfg.gamePool.filters.tags.includes(tg.value) ? cfg.gamePool.filters.tags.filter((x) => x !== tg.value) : [...cfg.gamePool.filters.tags, tg.value] })}>
                      {tg.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label={t.admin.settings.metaMinLabel}>
                  <Input type="number" placeholder="—" min={0} max={100} value={cfg.gamePool.filters.metacriticMin ?? ""} onChange={(e) => setFilters({ metacriticMin: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.metaMaxLabel}>
                  <Input type="number" placeholder="—" min={0} max={100} value={cfg.gamePool.filters.metacriticMax ?? ""} onChange={(e) => setFilters({ metacriticMax: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.ratingMinLabel}>
                  <Input type="number" step={0.1} placeholder="—" min={0} max={5} value={cfg.gamePool.filters.ratingMin ?? ""} onChange={(e) => setFilters({ ratingMin: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.ratingMaxLabel}>
                  <Input type="number" step={0.1} placeholder="—" min={0} max={5} value={cfg.gamePool.filters.ratingMax ?? ""} onChange={(e) => setFilters({ ratingMax: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label={t.admin.settings.yearMinLabel}>
                  <Input type="number" placeholder="—" value={cfg.gamePool.filters.yearMin ?? ""} onChange={(e) => setFilters({ yearMin: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.yearMaxLabel}>
                  <Input type="number" placeholder="—" value={cfg.gamePool.filters.yearMax ?? ""} onChange={(e) => setFilters({ yearMax: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.playersLabel}>
                  <Select value={cfg.gamePool.filters.players} onChange={(e) => setFilters({ players: e.target.value as SeasonConfig["gamePool"]["filters"]["players"] })}>
                    <option value="any">{t.admin.settings.playersAny}</option>
                    <option value="single">{t.admin.settings.playersSingle}</option>
                    <option value="multi">{t.admin.settings.playersMulti}</option>
                    <option value="coop">{t.admin.settings.playersCoop}</option>
                  </Select>
                </Field>
                <Field label={t.admin.settings.searchQueryLabel}>
                  <Input type="text" placeholder="e.g. elden ring" value={cfg.gamePool.filters.searchQuery ?? ""} onChange={(e) => setFilters({ searchQuery: e.target.value || null })} />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterEsrb}</span>
                <div className="flex flex-wrap gap-1.5">
                  {ESRB.map((e) => (
                    <Chip key={e.value} active={cfg.gamePool.filters.esrb.includes(e.value)} onClick={() => setFilters({ esrb: cfg.gamePool.filters.esrb.includes(e.value) ? cfg.gamePool.filters.esrb.filter((x) => x !== e.value) : [...cfg.gamePool.filters.esrb, e.value] })}>
                      {e.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 hud-card p-3 bg-black/20">
                <Switch checked={cfg.gamePool.filters.onlyWithCover} onChange={(v) => setFilters({ onlyWithCover: v })} label={t.admin.settings.onlyWithCoverLabel} description={t.admin.settings.onlyWithCoverDescription} />
                <Switch checked={cfg.gamePool.autoFetchOnRoll} onChange={(v) => setGamePool({ autoFetchOnRoll: v })} label={t.admin.settings.autoFetchLabel} description={t.admin.settings.autoFetchDescription} />
                <Switch checked={cfg.gamePool.catalog.allowManualAdd} onChange={(v) => setCatalog({ allowManualAdd: v })} label={t.admin.settings.manualAddLabel} description={t.admin.settings.manualAddDescription} />
                <Switch checked={cfg.gamePool.catalog.fallbackToCatalog} onChange={(v) => setCatalog({ fallbackToCatalog: v })} label={t.admin.settings.fallbackLabel} description={t.admin.settings.fallbackDescription} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t.admin.settings.maxCandidatesLabel}>
                  <Input type="number" min={1} max={100} value={cfg.gamePool.maxCandidates} onChange={(e) => setGamePool({ maxCandidates: Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.cacheTtlLabel}>
                  <Input type="number" min={0} max={720} value={cfg.gamePool.cacheTtlHours} onChange={(e) => setGamePool({ cacheTtlHours: Number(e.target.value) })} />
                </Field>
              </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}
            </div>
            );
          })()}
        </div>
      </div>

      

      {state?.error && <DebugError debug={state?.debug} title="season settings" />}
      {state?.ok && <div className="hud-card p-3 bg-emerald-950/30 border-emerald-800 text-sm text-emerald-300 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">{state.ok}</div>}

      <div className="flex gap-3 justify-end">
        <button type="submit" disabled={pending || !boardValid} className="hud-btn hud-btn-primary px-6 py-2 disabled:opacity-50">
          {pending ? t.admin.settings.savingButton : t.admin.settings.saveButton}
        </button>
      </div>

      <p className="text-xs text-zinc-500 text-center">{t.admin.settings.changesNote}</p>
    </form>
  );
}
